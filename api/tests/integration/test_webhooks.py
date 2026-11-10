"""POST /webhooks/stripe (invariant 3): signature-verified, idempotent, the only path to paid."""

import json
from datetime import UTC, date, datetime
from typing import Any
from uuid import uuid4

import httpx
import pytest

from app.db import Conn
from app.domain.tickets import venue_local_date
from tests.integration.conftest import (
    AMERICANO,
    STRIPE_ACCOUNT,
    VENUE_ID,
    add_to_cart,
    auth,
    checkout,
    enable_charges,
    pi_event,
    post_webhook,
    requires_db,
    start_session,
    stripe_signature,
)

pytestmark = [pytest.mark.integration, requires_db]


async def one(db: Conn, sql: str, *params: object) -> Any:
    cur = await db.execute(sql, params)
    row = await cur.fetchone()
    return row[0] if row and len(row) == 1 else row


async def pending_order(client: httpx.AsyncClient, db: Conn) -> dict[str, Any]:
    await enable_charges(db)
    s = await start_session(client)
    await add_to_cart(client, s, AMERICANO)
    res = await checkout(client, s)
    assert res.status_code == 201, res.text
    out: dict[str, Any] = res.json()
    out["pi_id"] = await one(
        db,
        "select stripe_payment_intent_id from public.order_payments where order_id = %s",
        out["order_id"],
    )
    out["session"] = s
    return out


def succeeded(order: dict[str, Any], **kw: Any) -> dict[str, Any]:
    return pi_event(
        "payment_intent.succeeded",
        pi_id=kw.pop("pi_id", order["pi_id"]),
        order_id=kw.pop("order_id", order["order_id"]),
        amount=kw.pop("amount", order["total_cents"]),
        **kw,
    )


async def order_row(db: Conn, order_id: str) -> tuple[Any, ...]:
    row = await one(
        db,
        "select status::text, paid_at, ticket_number, ticket_date from public.orders where id = %s",
        order_id,
    )
    assert isinstance(row, tuple)
    return row


async def event_count(db: Conn, event_id: str) -> int:
    return int(
        await one(db, "select count(*) from public.stripe_events where event_id = %s", event_id)
    )


# ---------------------------------------------------------------- signature


async def test_bad_signature_is_400_and_records_nothing(
    client: httpx.AsyncClient, db: Conn
) -> None:
    order = await pending_order(client, db)
    event = succeeded(order)
    res = await post_webhook(client, event, secret="whsec_wrong")
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "bad_signature"
    assert await event_count(db, event["id"]) == 0
    assert (await order_row(db, order["order_id"]))[0] == "pending_payment"


async def test_missing_signature_is_400(client: httpx.AsyncClient, db: Conn) -> None:
    order = await pending_order(client, db)
    event = succeeded(order)
    res = await client.post("/webhooks/stripe", content=json.dumps(event).encode())
    assert res.status_code == 400
    assert await event_count(db, event["id"]) == 0


async def test_tampered_payload_is_400(client: httpx.AsyncClient, db: Conn) -> None:
    order = await pending_order(client, db)
    signed = json.dumps(succeeded(order)).encode()
    tampered = signed.replace(b'"amount": ', b'"amount": 1')
    res = await client.post(
        "/webhooks/stripe", content=tampered, headers={"Stripe-Signature": stripe_signature(signed)}
    )
    assert res.status_code == 400


# ---------------------------------------------------------------- payment_intent.succeeded


async def test_succeeded_marks_paid_with_ticket_and_clears_cart(
    client: httpx.AsyncClient, db: Conn
) -> None:
    order = await pending_order(client, db)
    res = await post_webhook(client, succeeded(order))
    assert res.status_code == 200, res.text
    assert res.json()["ticket_number"] == 1

    status, paid_at, ticket, ticket_date = await order_row(db, order["order_id"])
    assert status == "paid"
    assert paid_at is not None
    assert ticket == 1
    assert ticket_date == venue_local_date(datetime.now(UTC), "America/Vancouver")

    cart = await client.get("/cart", headers=auth(order["session"]))
    assert cart.json()["lines"] == []

    # The next paid order of the day gets the next number.
    second = await pending_order(client, db)
    assert (await post_webhook(client, succeeded(second))).json()["ticket_number"] == 2


async def test_replayed_event_is_a_noop(client: httpx.AsyncClient, db: Conn) -> None:
    order = await pending_order(client, db)
    event = succeeded(order)
    assert (await post_webhook(client, event)).status_code == 200
    before = await order_row(db, order["order_id"])

    res = await post_webhook(client, event)
    assert res.status_code == 200
    assert res.json() == {"received": True, "duplicate": True}
    assert await event_count(db, event["id"]) == 1
    assert await order_row(db, order["order_id"]) == before


async def test_second_succeeded_event_for_paid_order_changes_nothing(
    client: httpx.AsyncClient, db: Conn
) -> None:
    order = await pending_order(client, db)
    await post_webhook(client, succeeded(order))
    before = await order_row(db, order["order_id"])
    res = await post_webhook(client, succeeded(order))  # new event id, same PaymentIntent
    assert res.json()["ignored"] == "not_pending"
    assert await order_row(db, order["order_id"]) == before


@pytest.mark.parametrize("change", [{"amount": 1}, {"currency": "usd"}])
async def test_amount_or_currency_mismatch_leaves_order_pending(
    client: httpx.AsyncClient, db: Conn, change: dict[str, Any]
) -> None:
    order = await pending_order(client, db)
    if "amount" in change:
        change = {"amount": order["total_cents"] - 1}
    event = succeeded(order, **change)
    res = await post_webhook(client, event)
    assert res.status_code == 200
    assert res.json()["ignored"] == "amount_mismatch"
    assert await event_count(db, event["id"]) == 1
    assert await order_row(db, order["order_id"]) == ("pending_payment", None, None, None)
    cart = await client.get("/cart", headers=auth(order["session"]))
    assert len(cart.json()["lines"]) == 1  # not cleared


async def test_pi_id_must_match_the_order(client: httpx.AsyncClient, db: Conn) -> None:
    order = await pending_order(client, db)
    res = await post_webhook(client, succeeded(order, pi_id="pi_someone_else"))
    assert res.json()["ignored"] == "unknown_order"
    res = await post_webhook(client, succeeded(order, order_id=str(uuid4())))
    assert res.json()["ignored"] == "unknown_order"
    assert (await order_row(db, order["order_id"]))[0] == "pending_payment"


async def test_payment_failed_leaves_order_pending(client: httpx.AsyncClient, db: Conn) -> None:
    order = await pending_order(client, db)
    event = pi_event(
        "payment_intent.payment_failed",
        pi_id=order["pi_id"],
        order_id=order["order_id"],
        amount=order["total_cents"],
    )
    res = await post_webhook(client, event)
    assert res.status_code == 200
    assert await event_count(db, event["id"]) == 1
    assert await order_row(db, order["order_id"]) == ("pending_payment", None, None, None)


async def test_unknown_event_types_are_acknowledged(client: httpx.AsyncClient, db: Conn) -> None:
    event_id = f"evt_{uuid4().hex}"
    event = {"id": event_id, "type": "charge.refunded", "data": {"object": {}}}
    res = await post_webhook(client, event)
    assert res.status_code == 200
    assert await event_count(db, event_id) == 1


# ---------------------------------------------------------------- account.updated


@pytest.mark.parametrize("enabled", [True, False])
async def test_account_updated_syncs_charges_enabled(
    client: httpx.AsyncClient, db: Conn, enabled: bool
) -> None:
    await enable_charges(db, enabled=not enabled)
    event = {
        "id": f"evt_{uuid4().hex}",
        "type": "account.updated",
        "account": STRIPE_ACCOUNT,
        "data": {"object": {"id": STRIPE_ACCOUNT, "object": "account", "charges_enabled": enabled}},
    }
    res = await post_webhook(client, event)
    assert res.status_code == 200
    assert res.json()["synced"] is True
    assert (
        await one(
            db,
            "select stripe_charges_enabled from public.venue_payment_settings where venue_id = %s",
            VENUE_ID,
        )
        is enabled
    )


# ---------------------------------------------------------------- ticket counter


async def test_next_ticket_number_restarts_for_a_new_local_date(db: Conn) -> None:
    async def nxt(d: date) -> int:
        return int(await one(db, "select app.next_ticket_number(%s, %s)", VENUE_ID, d))

    assert [await nxt(date(2030, 1, 1)), await nxt(date(2030, 1, 1))] == [1, 2]
    assert await nxt(date(2030, 1, 2)) == 1
