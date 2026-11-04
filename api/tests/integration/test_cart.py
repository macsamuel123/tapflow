"""Server-priced cart (CLAUDE.md invariants 1 + 2) against the seed menu."""

from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest

from app.db import Conn
from tests.integration.conftest import (
    AMERICANO,
    BURGER,
    FRIES,
    LATTE,
    NANAIMO_BAR,
    auth,
    modifier_ids,
    requires_db,
    start_session,
)

pytestmark = [pytest.mark.integration, requires_db]


@pytest.fixture
async def session(client: httpx.AsyncClient) -> dict[str, Any]:
    return await start_session(client)


@pytest.fixture
async def mods(client: httpx.AsyncClient) -> dict[tuple[UUID, str], UUID]:
    return await modifier_ids(client)


async def add(
    client: httpx.AsyncClient,
    session: dict[str, Any],
    item_id: UUID,
    modifier_ids: list[UUID] | None = None,
    quantity: int = 1,
    **extra: Any,
) -> httpx.Response:
    body = {
        "item_id": str(item_id),
        "modifier_ids": [str(m) for m in modifier_ids or []],
        "quantity": quantity,
        **extra,
    }
    return await client.post("/cart/items", json=body, headers=auth(session))


async def cart(client: httpx.AsyncClient, session: dict[str, Any]) -> dict[str, Any]:
    res = await client.get("/cart", headers=auth(session))
    assert res.status_code == 200
    data: dict[str, Any] = res.json()
    return data


# ---------------------------------------------------------------- the Nanaimo Bar (86'd in seed)


async def test_nanaimo_bar_cannot_be_added(
    client: httpx.AsyncClient, session: dict[str, Any]
) -> None:
    res = await add(client, session, NANAIMO_BAR)
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "item_out_of_stock"
    assert "Nanaimo Bar is sold out" in res.json()["detail"]["message"]
    assert (await cart(client, session))["lines"] == []


# ---------------------------------------------------------------- pricing from DB rows


async def test_realistic_cart_priced_server_side_with_gst(
    client: httpx.AsyncClient, session: dict[str, Any], mods: dict[tuple[UUID, str], UUID]
) -> None:
    assert (await add(client, session, FRIES, [mods[(FRIES, "Large")]])).status_code == 201
    res = await add(client, session, LATTE, [mods[(LATTE, "Oat milk")]], quantity=2)
    assert res.status_code == 201
    c = res.json()
    assert [
        (ln["name"], ln["unit_price_cents"], ln["quantity"], ln["line_total_cents"])
        for ln in c["lines"]
    ] == [
        ("Truffle Fries", 1500, 1, 1500),
        ("Latte", 625, 2, 1250),
    ]
    assert c["lines"][1]["modifiers"] == [
        {"id": str(mods[(LATTE, "Oat milk")]), "name": "Oat milk", "price_delta_cents": 75}
    ]
    # 2750 * 5% = 137.5 -> 138 (half-up), total 2888.
    assert (c["subtotal_cents"], c["tax_cents"], c["tip_cents"], c["total_cents"]) == (
        2750,
        138,
        0,
        2888,
    )
    assert c["currency"] == "CAD"
    # Both lines are Food (5%): one category, rounded on its subtotal.
    assert c["tax_breakdown"] == [
        {"name": "Food", "rate_bps": 500, "subtotal_cents": 2750, "tax_cents": 138}
    ]
    assert c["item_count"] == 3
    assert c["can_checkout"] is True
    assert "platform_fee" not in res.text


async def test_cart_reprices_from_current_db_prices(
    client: httpx.AsyncClient, session: dict[str, Any], db: Conn
) -> None:
    await add(client, session, AMERICANO, quantity=2)
    await db.execute("update public.menu_items set price_cents = 450 where id = %s", (AMERICANO,))
    c = await cart(client, session)
    assert c["lines"][0]["unit_price_cents"] == 450
    assert (c["subtotal_cents"], c["tax_cents"], c["total_cents"]) == (900, 45, 945)


@pytest.mark.parametrize(
    "extra",
    [
        {"price_cents": 1},
        {"unit_price_cents": 1},
        {"line_total_cents": 1},
        {"total_cents": 1},
        {"name": "Free burger"},
        {"venue_id": str(uuid4())},
    ],
)
async def test_client_cannot_send_prices_or_extra_fields(
    client: httpx.AsyncClient, session: dict[str, Any], extra: dict[str, Any]
) -> None:
    res = await add(client, session, AMERICANO, **extra)
    assert res.status_code == 422
    assert (await cart(client, session))["lines"] == []


@pytest.mark.parametrize("quantity", [0, 21, -1, "2", 2.0, True, None])
async def test_quantity_must_be_int_1_to_20(
    client: httpx.AsyncClient, session: dict[str, Any], quantity: Any
) -> None:
    body = {"item_id": str(AMERICANO), "modifier_ids": [], "quantity": quantity}
    res = await client.post("/cart/items", json=body, headers=auth(session))
    assert res.status_code == 422


# ---------------------------------------------------------------- modifier rules end to end


async def test_required_group_missing(client: httpx.AsyncClient, session: dict[str, Any]) -> None:
    res = await add(client, session, BURGER)
    assert res.status_code == 422
    assert res.json()["detail"]["code"] == "required_group_missing"


async def test_too_many_in_single_choice_group(
    client: httpx.AsyncClient, session: dict[str, Any], mods: dict[tuple[UUID, str], UUID]
) -> None:
    res = await add(
        client, session, BURGER, [mods[(BURGER, "Medium")], mods[(BURGER, "Well done")]]
    )
    assert res.status_code == 422
    assert res.json()["detail"]["code"] == "too_many_selections"


async def test_max_add_ons(
    client: httpx.AsyncClient, session: dict[str, Any], mods: dict[tuple[UUID, str], UUID]
) -> None:
    addons = [mods[(BURGER, n)] for n in ("Bacon", "Avocado", "Fried egg", "Extra cheddar")]
    medium = mods[(BURGER, "Medium")]
    four = await add(client, session, BURGER, [medium, *addons])
    assert four.status_code == 422
    assert four.json()["detail"]["code"] == "too_many_selections"
    three = await add(client, session, BURGER, [medium, *addons[:3]])
    assert three.status_code == 201
    assert three.json()["lines"][0]["unit_price_cents"] == 2200 + 300 + 250 + 200


async def test_modifier_of_another_item_rejected(
    client: httpx.AsyncClient, session: dict[str, Any], mods: dict[tuple[UUID, str], UUID]
) -> None:
    res = await add(client, session, BURGER, [mods[(BURGER, "Medium")], mods[(LATTE, "Oat milk")]])
    assert res.status_code == 422
    assert res.json()["detail"]["code"] == "modifier_not_found"


async def test_modifier_of_another_venue_rejected(
    client: httpx.AsyncClient, session: dict[str, Any], db: Conn
) -> None:
    rid, cid, iid, gid, mid, tcid = (uuid4() for _ in range(6))
    await db.execute(
        "insert into public.venues (id, slug, name) values (%s, 'other-bistro', 'Other')",
        (rid,),
    )
    await db.execute(
        "insert into public.menu_categories (id, venue_id, name) values (%s, %s, 'C')",
        (cid, rid),
    )
    await db.execute(
        "insert into public.tax_categories (id, venue_id, name, rate_bps) "
        "values (%s, %s, 'Food', 500)",
        (tcid, rid),
    )
    await db.execute(
        "insert into public.menu_items "
        "(id, venue_id, category_id, tax_category_id, name, price_cents) "
        "values (%s, %s, %s, %s, 'Their burger', 100)",
        (iid, rid, cid, tcid),
    )
    await db.execute(
        "insert into public.modifier_groups (id, venue_id, item_id, name) values (%s, %s, %s, 'G')",
        (gid, rid, iid),
    )
    await db.execute(
        "insert into public.modifiers (id, venue_id, group_id, name) values (%s, %s, %s, 'M')",
        (mid, rid, gid),
    )
    # Their modifier on our americano, and their item through our session.
    res = await add(client, session, AMERICANO, [mid])
    assert res.status_code == 422
    assert res.json()["detail"]["code"] == "modifier_not_found"
    res = await add(client, session, iid)
    assert res.status_code == 404
    assert res.json()["detail"]["code"] == "item_not_found"


async def test_duplicate_modifier_rejected(
    client: httpx.AsyncClient, session: dict[str, Any], mods: dict[tuple[UUID, str], UUID]
) -> None:
    medium, bacon = mods[(BURGER, "Medium")], mods[(BURGER, "Bacon")]
    res = await add(client, session, BURGER, [medium, bacon, bacon])
    assert res.status_code == 422
    assert res.json()["detail"]["code"] == "duplicate_modifier"


async def test_unknown_item_404(client: httpx.AsyncClient, session: dict[str, Any]) -> None:
    res = await add(client, session, uuid4())
    assert res.status_code == 404


# ---------------------------------------------------------------- cart mechanics


async def test_identical_lines_merge_and_cap_at_20(
    client: httpx.AsyncClient, session: dict[str, Any], mods: dict[tuple[UUID, str], UUID]
) -> None:
    medium, bacon = mods[(BURGER, "Medium")], mods[(BURGER, "Bacon")]
    await add(client, session, BURGER, [medium, bacon], quantity=15)
    res = await add(client, session, BURGER, [bacon, medium], quantity=5)  # same choice, any order
    assert len(res.json()["lines"]) == 1
    assert res.json()["lines"][0]["quantity"] == 20
    over = await add(client, session, BURGER, [medium, bacon], quantity=1)
    assert over.status_code == 422
    # Different notes → separate line.
    res = await add(client, session, BURGER, [medium, bacon], notes="no pickles")
    assert len(res.json()["lines"]) == 2


async def test_update_and_delete_line(client: httpx.AsyncClient, session: dict[str, Any]) -> None:
    line_id = (await add(client, session, AMERICANO)).json()["lines"][0]["id"]
    res = await client.patch(
        f"/cart/items/{line_id}", json={"quantity": 3, "notes": "extra hot"}, headers=auth(session)
    )
    assert res.status_code == 200
    assert (res.json()["lines"][0]["quantity"], res.json()["lines"][0]["notes"]) == (3, "extra hot")
    assert res.json()["subtotal_cents"] == 1200
    bad = await client.patch(
        f"/cart/items/{line_id}", json={"quantity": 3, "price_cents": 1}, headers=auth(session)
    )
    assert bad.status_code == 422
    res = await client.delete(f"/cart/items/{line_id}", headers=auth(session))
    assert res.status_code == 200
    assert res.json()["lines"] == []
    assert res.json()["total_cents"] == 0


async def test_cannot_touch_another_sessions_cart(
    client: httpx.AsyncClient, session: dict[str, Any]
) -> None:
    line_id = (await add(client, session, AMERICANO)).json()["lines"][0]["id"]
    other = await start_session(client)
    headers = auth(other)
    assert (await client.delete(f"/cart/items/{line_id}", headers=headers)).status_code == 404
    patch = await client.patch(f"/cart/items/{line_id}", json={"quantity": 2}, headers=headers)
    assert patch.status_code == 404
    assert (await cart(client, other))["lines"] == []
    assert len((await cart(client, session))["lines"]) == 1


async def test_cart_requires_session(client: httpx.AsyncClient) -> None:
    assert (await client.get("/cart")).status_code == 401
    body = {"item_id": str(AMERICANO), "modifier_ids": [], "quantity": 1}
    assert (await client.post("/cart/items", json=body)).status_code == 401


async def test_item_86d_after_adding_is_flagged_and_excluded(
    client: httpx.AsyncClient, session: dict[str, Any], db: Conn
) -> None:
    await add(client, session, AMERICANO)
    await add(client, session, LATTE, [(await modifier_ids(client))[(LATTE, "Whole milk")]])
    await db.execute("update public.menu_items set in_stock = false where id = %s", (AMERICANO,))
    c = await cart(client, session)
    americano = next(ln for ln in c["lines"] if ln["item_id"] == str(AMERICANO))
    assert americano["available"] is False
    assert americano["problem"] == "Americano is sold out."
    assert americano["line_total_cents"] == 0
    assert (c["subtotal_cents"], c["tax_cents"], c["total_cents"]) == (550, 28, 578)
    assert c["can_checkout"] is False


async def test_browse_only_session_has_cart_but_cannot_check_out(
    client: httpx.AsyncClient,
) -> None:
    s = await start_session(client, verified=False)
    res = await add(client, s, AMERICANO)
    assert res.status_code == 201
    assert res.json()["verified"] is False
    assert res.json()["can_checkout"] is False
