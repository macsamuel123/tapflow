"""POST /checkout against the seed venue and a fake Stripe gateway (invariants 1 and 2)."""

from typing import Any
from uuid import UUID

import httpx
import pytest

from app.db import Conn
from app.payments.fake import FakeGateway
from tests.integration.conftest import (
    AMERICANO,
    FRIES,
    HOUSE_RED,
    PICKUP_COUNTER,
    STRIPE_ACCOUNT,
    add_to_cart,
    checkout,
    enable_charges,
    modifier_ids,
    requires_db,
    start_session,
)

pytestmark = [pytest.mark.integration, requires_db]


async def one(db: Conn, sql: str, *params: object) -> Any:
    cur = await db.execute(sql, params)
    row = await cur.fetchone()
    return row[0] if row and len(row) == 1 else row


async def order_count(db: Conn) -> int:
    return int(await one(db, "select count(*) from public.orders"))


@pytest.fixture
async def session(client: httpx.AsyncClient, db: Conn) -> dict[str, Any]:
    await enable_charges(db)
    return await start_session(client)


# ---------------------------------------------------------------- guards


async def test_unverified_session_cannot_check_out(client: httpx.AsyncClient, db: Conn) -> None:
    await enable_charges(db)
    s = await start_session(client, verified=False)
    await add_to_cart(client, s, AMERICANO)
    res = await checkout(client, s)
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "session_unverified"
    assert "scan the qr" in res.json()["detail"]["message"].lower()


async def test_missing_session_is_401(client: httpx.AsyncClient) -> None:
    assert (await client.post("/checkout", json={})).status_code == 401


async def test_empty_cart(client: httpx.AsyncClient, session: dict[str, Any]) -> None:
    res = await checkout(client, session)
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "cart_empty"


async def test_charges_disabled(
    client: httpx.AsyncClient, db: Conn, session: dict[str, Any], fake_gateway: FakeGateway
) -> None:
    await enable_charges(db, enabled=False)
    await add_to_cart(client, session, AMERICANO)
    before = await order_count(db)
    res = await checkout(client, session)
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "payments_unavailable"
    assert await order_count(db) == before
    assert fake_gateway.created == []


async def test_item_86d_after_adding_is_rechecked(
    client: httpx.AsyncClient, db: Conn, session: dict[str, Any]
) -> None:
    await add_to_cart(client, session, AMERICANO)
    await db.execute("update public.menu_items set in_stock = false where id = %s", (AMERICANO,))
    res = await checkout(client, session)
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "item_out_of_stock"


@pytest.mark.parametrize(
    "extra",
    [
        {"total_cents": 1},
        {"price": 1},
        {"subtotal_cents": 1},
        {"platform_fee_cents": 0},
        {"items": [{"item_id": str(AMERICANO), "price_cents": 1}]},
    ],
)
async def test_client_amounts_are_rejected(
    client: httpx.AsyncClient,
    db: Conn,
    session: dict[str, Any],
    fake_gateway: FakeGateway,
    extra: dict[str, Any],
) -> None:
    await add_to_cart(client, session, AMERICANO)
    before = await order_count(db)
    res = await checkout(client, session, **extra)
    assert res.status_code == 422
    assert await order_count(db) == before
    assert fake_gateway.created == []


@pytest.mark.parametrize("tip", [-1, 1.5, "100", True, 401])
async def test_bad_tip(
    client: httpx.AsyncClient, db: Conn, session: dict[str, Any], tip: Any
) -> None:
    await add_to_cart(client, session, AMERICANO)  # subtotal 400
    before = await order_count(db)
    res = await checkout(client, session, tip_cents=tip)
    assert res.status_code == 422
    assert await order_count(db) == before


# ---------------------------------------------------------------- success


async def test_checkout_creates_server_priced_pending_order(
    client: httpx.AsyncClient, db: Conn, session: dict[str, Any], fake_gateway: FakeGateway
) -> None:
    mods = await modifier_ids(client)
    await add_to_cart(client, session, FRIES, [mods[(FRIES, "Large")]], quantity=2)  # 2 x 1500
    await add_to_cart(client, session, HOUSE_RED)  # 900, Alcohol
    res = await checkout(client, session, tip_cents=500)
    assert res.status_code == 201, res.text
    body = res.json()
    order_id = UUID(body["order_id"])

    # subtotal 3900; GST 5% of 3900 = 195; PST 10% of 900 = 90; tip 500 untaxed.
    assert body["total_cents"] == 3900 + 195 + 90 + 500
    assert body["currency"] == "CAD"
    assert body["reused"] is False
    assert body["client_secret"] == "pi_fake_1_secret_fake"

    row = await one(
        db,
        "select status::text, subtotal_cents, tax_cents, tip_cents, total_cents, "
        "service_mode::text, guest_name, paid_at, ticket_number from public.orders where id = %s",
        order_id,
    )
    assert row == ("pending_payment", 3900, 285, 500, 4685, "delivery", None, None, None)

    taxes = await (
        await db.execute(
            "select tax_code, rate_bps, base_cents, tax_cents from public.order_tax_lines "
            "where order_id = %s order by tax_code",
            (order_id,),
        )
    ).fetchall()
    assert taxes == [("GST", 500, 3900, 195), ("PST", 1000, 900, 90)]

    fee, pi_id = await one(
        db,
        "select platform_fee_cents, stripe_payment_intent_id from public.order_payments "
        "where order_id = %s",
        order_id,
    )
    assert (fee, pi_id) == (117, "pi_fake_1")  # 3% of 3900

    [req] = fake_gateway.created
    assert (req.amount_cents, req.currency, req.application_fee_cents) == (4685, "CAD", 117)
    assert (req.destination_account, req.order_id) == (STRIPE_ACCOUNT, order_id)
    [call] = fake_gateway.create_calls
    assert call.options == {"idempotency_key": str(order_id)}
    assert call.params["automatic_payment_methods"] == {"enabled": True}
    assert call.params["transfer_data"] == {"destination": STRIPE_ACCOUNT}
    assert call.params["metadata"] == {"order_id": str(order_id)}


async def test_item_snapshots_survive_menu_changes(
    client: httpx.AsyncClient, db: Conn, session: dict[str, Any]
) -> None:
    mods = await modifier_ids(client)
    await add_to_cart(client, session, FRIES, [mods[(FRIES, "Large")]])
    order_id = (await checkout(client, session)).json()["order_id"]
    await db.execute(
        "update public.menu_items set price_cents = 9999, name = 'Renamed' where id = %s", (FRIES,)
    )
    snap = await one(
        db,
        "select name_snapshot, unit_price_cents, line_total_cents, modifiers_snapshot, "
        "tax_category_name_snapshot, tax_codes_snapshot from public.order_items "
        "where order_id = %s",
        order_id,
    )
    name, unit, line, modifiers, category, codes = snap
    assert (name, unit, line, category, codes) == ("Truffle Fries", 1500, 1500, "Food", ["GST"])
    assert [(m["name"], m["price_delta_cents"]) for m in modifiers] == [("Large", 400)]


# ---------------------------------------------------------------- pickup


async def test_pickup_requires_guest_name(client: httpx.AsyncClient, db: Conn) -> None:
    await enable_charges(db)
    s = await start_session(client, touchpoint_id=PICKUP_COUNTER)
    assert s["service_mode"] == "pickup"
    await add_to_cart(client, s, AMERICANO)
    before = await order_count(db)
    res = await checkout(client, s)
    assert res.status_code == 422
    assert res.json()["detail"]["code"] == "guest_name_required"
    assert await order_count(db) == before

    res = await checkout(client, s, guest_name="  Ana  ")
    assert res.status_code == 201, res.text
    row = await one(
        db,
        "select service_mode::text, guest_name from public.orders where id = %s",
        res.json()["order_id"],
    )
    assert row == ("pickup", "Ana")


async def test_delivery_touchpoint_needs_no_guest_name(
    client: httpx.AsyncClient, session: dict[str, Any]
) -> None:
    assert session["service_mode"] == "delivery"
    await add_to_cart(client, session, AMERICANO)
    assert (await checkout(client, session)).status_code == 201


# ---------------------------------------------------------------- re-checkout matrix


async def _first_checkout(client: httpx.AsyncClient, session: dict[str, Any]) -> dict[str, Any]:
    await add_to_cart(client, session, AMERICANO)
    res = await checkout(client, session)
    assert res.status_code == 201, res.text
    data: dict[str, Any] = res.json()
    return data


@pytest.mark.parametrize("pi_status", ["requires_payment_method", "requires_confirmation"])
async def test_recheckout_replaces(
    client: httpx.AsyncClient,
    db: Conn,
    session: dict[str, Any],
    fake_gateway: FakeGateway,
    pi_status: str,
) -> None:
    first = await _first_checkout(client, session)
    fake_gateway.set_status("pi_fake_1", pi_status)
    await add_to_cart(client, session, AMERICANO)  # the cart changed: 2 Americanos

    res = await checkout(client, session)
    assert res.status_code == 201, res.text
    second = res.json()
    assert second["order_id"] != first["order_id"]
    assert second["reused"] is False
    assert second["total_cents"] == 840  # 800 + 5% GST
    assert fake_gateway.cancelled == ["pi_fake_1"]
    assert len(fake_gateway.created) == 2
    assert (
        await one(db, "select status::text from public.orders where id = %s", first["order_id"])
        == "cancelled"
    )
    assert (
        await one(
            db,
            "select stripe_payment_intent_id from public.order_payments where order_id = %s",
            second["order_id"],
        )
        == "pi_fake_2"
    )


@pytest.mark.parametrize(
    "pi_status", ["processing", "succeeded", "requires_action", "requires_capture"]
)
async def test_recheckout_reuses(
    client: httpx.AsyncClient,
    db: Conn,
    session: dict[str, Any],
    fake_gateway: FakeGateway,
    pi_status: str,
) -> None:
    first = await _first_checkout(client, session)
    fake_gateway.set_status("pi_fake_1", pi_status)
    before = await order_count(db)

    res = await checkout(client, session)
    assert res.status_code == 200, res.text
    again = res.json()
    assert again["order_id"] == first["order_id"]
    assert again["client_secret"] == first["client_secret"]
    assert again["reused"] is True
    assert len(fake_gateway.created) == 1
    assert fake_gateway.cancelled == []
    assert await order_count(db) == before
    assert (
        await one(db, "select status::text from public.orders where id = %s", first["order_id"])
        == "pending_payment"
    )
