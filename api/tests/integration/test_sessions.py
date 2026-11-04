"""POST /sessions: signed QR tokens decide verified vs browse-only (CLAUDE.md invariant 6)."""

from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest

from app.db import Conn
from app.repositories import touchpoints as touchpoints_repo
from tests.integration.conftest import (
    SLUG,
    TOUCHPOINT_1,
    TOUCHPOINT_2,
    VENUE_ID,
    auth,
    requires_db,
    start_session,
    touchpoint_token,
)

pytestmark = [pytest.mark.integration, requires_db]


async def create(client: httpx.AsyncClient, **body: Any) -> httpx.Response:
    return await client.post("/sessions", json={"venue_slug": SLUG, **body})


async def test_valid_token_gives_verified_session(client: httpx.AsyncClient) -> None:
    res = await create(client, touchpoint_id=str(TOUCHPOINT_1), token=touchpoint_token())
    assert res.status_code == 201
    body = res.json()
    assert body["verified"] is True
    assert body["touchpoint_id"] == str(TOUCHPOINT_1)
    assert body["touchpoint_label"] == "Table 1"
    assert body["venue_slug"] == SLUG
    assert body["session_token"].startswith(body["session_id"] + ".")


@pytest.mark.parametrize(
    "token",
    [
        None,
        "",
        "not-a-real-token",
        touchpoint_token(secret="wrong-secret-xxxxxxxx"),
        touchpoint_token(
            TOUCHPOINT_2, secret="dev-only-qr-secret-table-01"
        ),  # signed for another table
        touchpoint_token(slug="other-bistro"),  # signed for another venue slug
    ],
)
async def test_invalid_or_missing_token_gives_browse_only_session(
    client: httpx.AsyncClient, token: str | None
) -> None:
    body: dict[str, Any] = {"touchpoint_id": str(TOUCHPOINT_1)}
    if token is not None:
        body["token"] = token
    res = await create(client, **body)
    assert res.status_code == 201
    assert res.json()["verified"] is False
    # The table is still known (for display), but checkout will be refused.
    assert res.json()["touchpoint_id"] == str(TOUCHPOINT_1)


async def test_token_for_table_1_does_not_verify_table_2(client: httpx.AsyncClient) -> None:
    res = await create(
        client, touchpoint_id=str(TOUCHPOINT_2), token=touchpoint_token(TOUCHPOINT_1)
    )
    assert res.json()["verified"] is False


async def test_rotating_secret_invalidates_old_qr(client: httpx.AsyncClient, db: Conn) -> None:
    old_token = touchpoint_token()
    assert (await create(client, touchpoint_id=str(TOUCHPOINT_1), token=old_token)).json()[
        "verified"
    ]

    await touchpoints_repo.rotate_qr_secret(db, TOUCHPOINT_1)

    assert (await create(client, touchpoint_id=str(TOUCHPOINT_1), token=old_token)).json()[
        "verified"
    ] is False
    table = await touchpoints_repo.get_with_secret(db, VENUE_ID, TOUCHPOINT_1)
    assert table is not None
    new_token = touchpoint_token(secret=table.qr_secret)
    assert (await create(client, touchpoint_id=str(TOUCHPOINT_1), token=new_token)).json()[
        "verified"
    ] is True


async def test_inactive_table_never_verifies(client: httpx.AsyncClient, db: Conn) -> None:
    await db.execute("update public.touchpoints set active = false where id = %s", (TOUCHPOINT_1,))
    res = await create(client, touchpoint_id=str(TOUCHPOINT_1), token=touchpoint_token())
    assert res.status_code == 201
    assert res.json()["verified"] is False
    assert res.json()["touchpoint_id"] is None


async def test_unknown_table_is_browse_only(client: httpx.AsyncClient) -> None:
    res = await create(client, touchpoint_id=str(uuid4()), token=touchpoint_token())
    assert res.status_code == 201
    assert res.json()["verified"] is False
    assert res.json()["touchpoint_id"] is None


async def test_table_of_another_venue_is_browse_only(client: httpx.AsyncClient, db: Conn) -> None:
    other_rid, other_tid = uuid4(), uuid4()
    await db.execute(
        "insert into public.venues (id, slug, name) values (%s, 'other-bistro', 'Other')",
        (other_rid,),
    )
    await db.execute(
        "insert into public.touchpoints (id, venue_id, label, qr_secret) "
        "values (%s, %s, 'T1', 'other-venue-secret-01')",
        (other_tid, other_rid),
    )
    # A correctly signed token for other-bistro's table, presented at demo-bistro.
    token = touchpoint_token(other_tid, secret="other-venue-secret-01", slug=SLUG)
    res = await create(client, touchpoint_id=str(other_tid), token=token)
    assert res.json()["verified"] is False
    assert res.json()["touchpoint_id"] is None


async def test_no_table_at_all_is_browse_only(client: httpx.AsyncClient) -> None:
    res = await create(client)
    assert res.status_code == 201
    assert res.json()["verified"] is False


async def test_unknown_venue_404(client: httpx.AsyncClient) -> None:
    res = await client.post("/sessions", json={"venue_slug": "no-such-place"})
    assert res.status_code == 404
    assert res.json()["detail"]["code"] == "venue_not_found"


@pytest.mark.parametrize(
    "body",
    [
        {"venue_slug": SLUG, "verified": True},  # clients can't claim verified
        {"venue_slug": SLUG, "touchpoint_id": "not-a-uuid"},
        {"venue_slug": "Bad Slug!"},
        {"venue_slug": SLUG, "token": "x" * 129},
        {},
    ],
)
async def test_bad_bodies_rejected(client: httpx.AsyncClient, body: dict[str, Any]) -> None:
    assert (await client.post("/sessions", json=body)).status_code == 422


async def test_session_token_authenticates_me(client: httpx.AsyncClient) -> None:
    s = await start_session(client)
    res = await client.get("/sessions/me", headers=auth(s))
    assert res.status_code == 200
    assert res.json()["session_id"] == s["session_id"]
    assert res.json()["verified"] is True
    assert "session_token" not in res.json()


@pytest.mark.parametrize(
    "header",
    [
        None,
        "garbage",
        f"{uuid4()}.AAAA",
    ],
)
async def test_bad_session_token_401(client: httpx.AsyncClient, header: str | None) -> None:
    headers = {} if header is None else {"X-Session-Token": header}
    res = await client.get("/sessions/me", headers=headers)
    assert res.status_code == 401
    assert res.json()["detail"]["code"] == "session_invalid"


async def test_tampered_session_token_401(client: httpx.AsyncClient) -> None:
    s = await start_session(client)
    _sid, mac = s["session_token"].split(".")
    forged = f"{uuid4()}.{mac}"
    assert (
        await client.get("/sessions/me", headers={"X-Session-Token": forged})
    ).status_code == 401


async def test_expired_session_401(client: httpx.AsyncClient, db: Conn) -> None:
    s = await start_session(client)
    await db.execute(
        "update public.touchpoint_sessions "
        "set expires_at = now() - interval '1 second' where id = %s",
        (UUID(s["session_id"]),),
    )
    assert (await client.get("/sessions/me", headers=auth(s))).status_code == 401


async def test_qr_secret_never_returned(client: httpx.AsyncClient) -> None:
    res = await create(client, touchpoint_id=str(TOUCHPOINT_1), token=touchpoint_token())
    assert "dev-only-qr-secret" not in res.text
    assert "qr_secret" not in res.text
