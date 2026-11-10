"""Staff order endpoints: paid orders only, venue-scoped, role-checked, via the status machine."""

from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest

from app.db import Conn
from tests.integration.conftest import (
    AMERICANO,
    FULFILLMENT,
    MANAGER,
    OWNER,
    PICKUP_COUNTER,
    PLATFORM_ADMIN,
    RUNNER,
    VENUE_ID,
    add_to_cart,
    checkout,
    enable_charges,
    paid_order,
    pi_event,
    post_webhook,
    requires_db,
    staff_headers,
    start_session,
)

pytestmark = [pytest.mark.integration, requires_db]

OTHER_VENUE = UUID("b0000000-0000-4000-8000-0000000000ff")
OTHER_TOUCHPOINT = UUID("c0000000-0000-4000-8000-0000000000ff")


async def list_ids(client: httpx.AsyncClient, user: UUID, venue: UUID = VENUE_ID) -> set[str]:
    res = await client.get(
        "/staff/orders", params={"venue_id": str(venue)}, headers=staff_headers(user)
    )
    assert res.status_code == 200, res.text
    return {o["id"] for o in res.json()["orders"]}


async def patch(
    client: httpx.AsyncClient, user: UUID, order_id: str, status: str
) -> httpx.Response:
    return await client.patch(
        f"/staff/orders/{order_id}/status", json={"status": status}, headers=staff_headers(user)
    )


async def advance(client: httpx.AsyncClient, order_id: str, *statuses: str) -> None:
    for s in statuses:
        res = await patch(client, OWNER, order_id, s)
        assert res.status_code == 200, res.text


# ---------------------------------------------------------------- auth


async def test_missing_or_invalid_token_is_401(client: httpx.AsyncClient) -> None:
    params = {"venue_id": str(VENUE_ID)}
    assert (await client.get("/staff/orders", params=params)).status_code == 401
    bad = staff_headers(OWNER, secret="not-the-configured-secret-0123456789")
    assert (await client.get("/staff/orders", params=params, headers=bad)).status_code == 401
    res = await client.get("/staff/orders", params=params, headers={"Authorization": "Bearer x"})
    assert res.status_code == 401
    res = await client.patch(f"/staff/orders/{uuid4()}/status", json={"status": "accepted"})
    assert res.status_code == 401


# ---------------------------------------------------------------- tickets only after payment


async def test_pending_orders_are_never_returned_to_staff(
    client: httpx.AsyncClient, db: Conn
) -> None:
    await enable_charges(db)
    s = await start_session(client)
    await add_to_cart(client, s, AMERICANO)
    res = await checkout(client, s)
    order = res.json()
    order_id = order["order_id"]

    for user in (OWNER, MANAGER, FULFILLMENT, RUNNER):
        assert order_id not in await list_ids(client, user)
        assert (await patch(client, OWNER, order_id, "accepted")).status_code == 404

    cur = await db.execute(
        "select stripe_payment_intent_id from public.order_payments where order_id = %s",
        (order_id,),
    )
    row = await cur.fetchone()
    assert row is not None
    hook = await post_webhook(
        client,
        pi_event(
            "payment_intent.succeeded", pi_id=row[0], order_id=order_id, amount=order["total_cents"]
        ),
    )
    assert hook.status_code == 200
    for user in (OWNER, MANAGER, FULFILLMENT):
        assert order_id in await list_ids(client, user)


async def test_abandoned_checkouts_stay_hidden(client: httpx.AsyncClient, db: Conn) -> None:
    await enable_charges(db)
    s = await start_session(client)
    await add_to_cart(client, s, AMERICANO)
    first = (await checkout(client, s)).json()["order_id"]
    await add_to_cart(client, s, AMERICANO)
    second = (await checkout(client, s)).json()["order_id"]  # replaces the first (cancelled)
    assert first != second
    for user in (OWNER, MANAGER, FULFILLMENT, RUNNER):
        ids = await list_ids(client, user)
        assert first not in ids
        assert second not in ids


# ---------------------------------------------------------------- roles


async def test_runner_sees_only_ready_delivery_orders_and_may_only_deliver(
    client: httpx.AsyncClient, db: Conn
) -> None:
    paid = (await paid_order(client, db))["order_id"]
    ready = (await paid_order(client, db))["order_id"]
    await advance(client, ready, "accepted", "ready")
    pickup = (await paid_order(client, db, touchpoint_id=PICKUP_COUNTER, guest_name="Ana"))[
        "order_id"
    ]
    await advance(client, pickup, "accepted", "ready")

    assert await list_ids(client, RUNNER) == {ready}

    for target in ("accepted", "cancelled"):
        res = await patch(client, RUNNER, paid, target)
        assert res.status_code == 403, res.text
        assert res.json()["detail"]["code"] == "role_forbidden"
    res = await patch(client, RUNNER, pickup, "picked_up")
    assert res.status_code == 403

    res = await patch(client, RUNNER, ready, "delivered")
    assert res.status_code == 200, res.text
    assert res.json()["order"]["status"] == "delivered"
    assert res.json()["timestamp_field"] == "delivered_at"


async def test_owner_manager_fulfillment_see_paid_orders(
    client: httpx.AsyncClient, db: Conn
) -> None:
    order = (await paid_order(client, db))["order_id"]
    for user in (OWNER, MANAGER, FULFILLMENT):
        res = await client.get(
            "/staff/orders", params={"venue_id": str(VENUE_ID)}, headers=staff_headers(user)
        )
        body = res.json()
        [o] = [o for o in body["orders"] if o["id"] == order]
        assert o["status"] == "paid"
        assert o["ticket_number"] is not None
        assert [i["name"] for i in o["items"]] == ["Americano"]


# ---------------------------------------------------------------- tenant isolation


async def test_cross_venue_and_unknown_orders_are_404(client: httpx.AsyncClient, db: Conn) -> None:
    await db.execute(
        "insert into public.venues (id, slug, name) values (%s, 'other-venue', 'Other')",
        (OTHER_VENUE,),
    )
    await db.execute(
        "insert into public.touchpoints (id, venue_id, label, qr_secret) "
        "values (%s, %s, 'X1', 'other-venue-test-secret-123')",
        (OTHER_TOUCHPOINT, OTHER_VENUE),
    )
    cur = await db.execute(
        "insert into public.orders (venue_id, touchpoint_id, status, currency, subtotal_cents, "
        "tax_cents, total_cents, paid_at, ticket_number, ticket_date) "
        "values (%s, %s, 'paid', 'CAD', 100, 5, 105, now(), 1, current_date) returning id",
        (OTHER_VENUE, OTHER_TOUCHPOINT),
    )
    row = await cur.fetchone()
    assert row is not None
    other_order = str(row[0])

    for user in (OWNER, MANAGER, FULFILLMENT, RUNNER):
        res = await patch(client, user, other_order, "accepted")
        assert res.status_code == 404
        assert res.json()["detail"]["code"] == "order_not_found"
        assert other_order not in await list_ids(client, user)
    assert (await patch(client, OWNER, str(uuid4()), "accepted")).status_code == 404

    res = await client.get(
        "/staff/orders", params={"venue_id": str(OTHER_VENUE)}, headers=staff_headers(OWNER)
    )
    assert res.status_code == 404
    # A platform admin is not venue staff: no special path through /staff (that is M5).
    res = await client.get(
        "/staff/orders", params={"venue_id": str(VENUE_ID)}, headers=staff_headers(PLATFORM_ADMIN)
    )
    assert res.status_code == 404


# ---------------------------------------------------------------- the status machine


async def test_invalid_transitions_are_409(client: httpx.AsyncClient, db: Conn) -> None:
    order = (await paid_order(client, db))["order_id"]
    for target in ("ready", "delivered", "picked_up"):
        res = await patch(client, OWNER, order, target)
        assert res.status_code == 409, target
        assert res.json()["detail"]["code"] == "invalid_transition"
    await advance(client, order, "accepted", "ready")
    assert (await patch(client, OWNER, order, "cancelled")).status_code == 409
    assert (await patch(client, OWNER, order, "picked_up")).status_code == 409  # delivery order


@pytest.mark.parametrize("body", [{"status": "paid"}, {"status": "pending_payment"}, {}])
async def test_staff_cannot_set_paid(
    client: httpx.AsyncClient, db: Conn, body: dict[str, Any]
) -> None:
    order = (await paid_order(client, db))["order_id"]
    res = await client.patch(
        f"/staff/orders/{order}/status", json=body, headers=staff_headers(OWNER)
    )
    assert res.status_code == 422


async def test_extra_fields_are_rejected(client: httpx.AsyncClient, db: Conn) -> None:
    order = (await paid_order(client, db))["order_id"]
    res = await client.patch(
        f"/staff/orders/{order}/status",
        json={"status": "accepted", "paid_at": "2026-01-01T00:00:00Z"},
        headers=staff_headers(OWNER),
    )
    assert res.status_code == 422


async def test_delivery_flow_returns_each_timestamp(client: httpx.AsyncClient, db: Conn) -> None:
    order = (await paid_order(client, db))["order_id"]
    for target, user in (("accepted", FULFILLMENT), ("ready", FULFILLMENT), ("delivered", RUNNER)):
        res = await patch(client, user, order, target)
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["timestamp_field"] == f"{target}_at"
        assert body["order"]["status"] == target
        assert body["order"][f"{target}_at"] is not None


async def test_pickup_flow_returns_each_timestamp(client: httpx.AsyncClient, db: Conn) -> None:
    order = (await paid_order(client, db, touchpoint_id=PICKUP_COUNTER, guest_name="Bo"))[
        "order_id"
    ]
    assert (await patch(client, OWNER, order, "accepted")).status_code == 200
    assert (await patch(client, OWNER, order, "ready")).status_code == 200
    assert (await patch(client, OWNER, order, "delivered")).status_code == 409
    res = await patch(client, FULFILLMENT, order, "picked_up")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["timestamp_field"] == "picked_up_at"
    assert body["order"]["picked_up_at"] is not None
    assert body["order"]["guest_name"] == "Bo"
    assert body["order"]["service_mode"] == "pickup"
    # Picked up today: still on fulfillment's board, and terminal.
    assert order in await list_ids(client, FULFILLMENT)
    assert (await patch(client, OWNER, order, "cancelled")).status_code == 409


async def test_cancel_from_paid_and_accepted(client: httpx.AsyncClient, db: Conn) -> None:
    a = (await paid_order(client, db))["order_id"]
    b = (await paid_order(client, db))["order_id"]
    await advance(client, b, "accepted")
    for order in (a, b):
        res = await patch(client, MANAGER, order, "cancelled")
        assert res.status_code == 200
        assert res.json()["timestamp_field"] == "cancelled_at"
