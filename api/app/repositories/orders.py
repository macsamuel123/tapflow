"""Orders: checkout writes, the payment webhook, and staff reads/updates.

Staff reads always require `paid_at is not null` ("tickets only after payment"), whatever the
caller's role, so abandoned and in-flight checkouts never reach venue staff.
"""

import json
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
from uuid import UUID

from psycopg.rows import class_row, dict_row

from app.db import Conn
from app.domain.checkout import ModifierSnapshot, OrderDraft

# ---------------------------------------------------------------- checkout


@dataclass(frozen=True, slots=True)
class PendingOrder:
    id: UUID
    payment_intent_id: str | None
    currency: str
    total_cents: int


async def get_pending_for_session(conn: Conn, session_id: UUID) -> PendingOrder | None:
    async with conn.cursor(row_factory=class_row(PendingOrder)) as cur:
        await cur.execute(
            "select o.id, p.stripe_payment_intent_id as payment_intent_id, "
            "o.currency::text as currency, o.total_cents "
            "from public.orders o left join public.order_payments p on p.order_id = o.id "
            "where o.session_id = %s and o.status = 'pending_payment' "
            "for update of o",
            (session_id,),
        )
        return await cur.fetchone()


async def cancel_unpaid(conn: Conn, order_id: UUID) -> bool:
    cur = await conn.execute(
        "update public.orders set status = 'cancelled' "
        "where id = %s and status = 'pending_payment'",
        (order_id,),
    )
    return cur.rowcount == 1


def _modifiers_json(modifiers: tuple[ModifierSnapshot, ...]) -> str:
    return json.dumps(
        [
            {"id": str(m.id), "name": m.name, "price_delta_cents": m.price_delta_cents}
            for m in modifiers
        ]
    )


async def insert_pending(
    conn: Conn,
    *,
    venue_id: UUID,
    touchpoint_id: UUID,
    session_id: UUID,
    currency: str,
    service_mode: str,
    guest_name: str | None,
    draft: OrderDraft,
) -> UUID:
    q = draft.quote
    cur = await conn.execute(
        "insert into public.orders (venue_id, touchpoint_id, session_id, status, currency, "
        "service_mode, guest_name, subtotal_cents, tax_cents, tip_cents, total_cents) "
        "values (%s, %s, %s, 'pending_payment', %s, %s::public.service_mode, %s, %s, %s, %s, %s) "
        "returning id",
        (
            venue_id,
            touchpoint_id,
            session_id,
            currency,
            service_mode,
            guest_name,
            q.subtotal_cents,
            q.tax_cents,
            q.tip_cents,
            q.total_cents,
        ),
    )
    row = await cur.fetchone()
    if row is None:
        raise RuntimeError("orders insert returned no row")
    order_id: UUID = row[0]

    async with conn.cursor() as c:
        await c.executemany(
            "insert into public.order_items (order_id, item_id, name_snapshot, unit_price_cents, "
            "modifiers_snapshot, quantity, notes, line_total_cents, tax_category_name_snapshot, "
            "tax_codes_snapshot) values (%s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s)",
            [
                (
                    order_id,
                    it.item_id,
                    it.name,
                    it.unit_price_cents,
                    json.dumps(
                        [
                            {
                                "id": str(m.id),
                                "name": m.name,
                                "price_delta_cents": m.price_delta_cents,
                            }
                            for m in it.modifiers
                        ]
                    ),
                    it.quantity,
                    it.notes,
                    it.line_total_cents,
                    it.tax_category_name,
                    list(it.tax_codes),
                )
                for it in draft.items
            ],
        )
        if draft.tax_lines:
            await c.executemany(
                "insert into public.order_tax_lines "
                "(order_id, tax_code, tax_name, rate_bps, base_cents, tax_cents) "
                "values (%s, %s, %s, %s, %s, %s)",
                [
                    (order_id, tl.code, tl.name, tl.rate_bps, tl.base_cents, tl.tax_cents)
                    for tl in draft.tax_lines
                ],
            )
    await conn.execute(
        "insert into public.order_payments (order_id, platform_fee_cents) values (%s, %s)",
        (order_id, q.platform_fee_cents),
    )
    return order_id


async def set_payment_intent(conn: Conn, order_id: UUID, payment_intent_id: str) -> None:
    await conn.execute(
        "update public.order_payments set stripe_payment_intent_id = %s where order_id = %s",
        (payment_intent_id, order_id),
    )


# ---------------------------------------------------------------- payment webhook


@dataclass(frozen=True, slots=True)
class PayableOrder:
    id: UUID
    venue_id: UUID
    session_id: UUID | None
    status: str
    service_mode: str
    currency: str
    total_cents: int
    timezone: str


async def lock_for_payment(
    conn: Conn, order_id: UUID, payment_intent_id: str
) -> PayableOrder | None:
    """The order this PaymentIntent was created for, locked. Both ids must match."""
    async with conn.cursor(row_factory=class_row(PayableOrder)) as cur:
        await cur.execute(
            "select o.id, o.venue_id, o.session_id, o.status::text as status, "
            "o.service_mode::text as service_mode, o.currency::text as currency, "
            "o.total_cents, v.timezone "
            "from public.orders o "
            "join public.order_payments p on p.order_id = o.id "
            "join public.venues v on v.id = o.venue_id "
            "where o.id = %s and p.stripe_payment_intent_id = %s "
            "for update of o",
            (order_id, payment_intent_id),
        )
        return await cur.fetchone()


async def mark_paid(conn: Conn, order_id: UUID, venue_id: UUID, local_date: date) -> int | None:
    """pending_payment → paid with today's (venue-local) ticket number. None if not pending."""
    cur = await conn.execute(
        "update public.orders set status = 'paid', paid_at = now(), ticket_date = %s, "
        "ticket_number = app.next_ticket_number(%s, %s) "
        "where id = %s and status = 'pending_payment' returning ticket_number",
        (local_date, venue_id, local_date, order_id),
    )
    row = await cur.fetchone()
    return int(row[0]) if row else None


# ---------------------------------------------------------------- staff


@dataclass(frozen=True, slots=True)
class StaffOrderItem:
    order_id: UUID
    name: str
    quantity: int
    unit_price_cents: int
    line_total_cents: int
    notes: str
    modifiers: list[dict[str, Any]]


@dataclass(frozen=True, slots=True)
class StaffOrder:
    id: UUID
    venue_id: UUID
    touchpoint_id: UUID
    touchpoint_label: str
    status: str
    service_mode: str
    guest_name: str | None
    currency: str
    subtotal_cents: int
    tax_cents: int
    tip_cents: int
    total_cents: int
    ticket_number: int | None
    ticket_date: date | None
    created_at: datetime
    status_updated_at: datetime
    paid_at: datetime | None
    accepted_at: datetime | None
    ready_at: datetime | None
    delivered_at: datetime | None
    picked_up_at: datetime | None
    cancelled_at: datetime | None


_STAFF_SELECT = (
    "select o.id, o.venue_id, o.touchpoint_id, t.label as touchpoint_label, "
    "o.status::text as status, o.service_mode::text as service_mode, o.guest_name, "
    "o.currency::text as currency, o.subtotal_cents, o.tax_cents, o.tip_cents, o.total_cents, "
    "o.ticket_number, o.ticket_date, o.created_at, o.status_updated_at, o.paid_at, "
    "o.accepted_at, o.ready_at, o.delivered_at, o.picked_up_at, o.cancelled_at "
    "from public.orders o join public.touchpoints t on t.id = o.touchpoint_id "
)


async def staff_role(conn: Conn, user_id: UUID, venue_id: UUID) -> str | None:
    cur = await conn.execute(
        "select role::text from public.staff_members where user_id = %s and venue_id = %s",
        (user_id, venue_id),
    )
    row = await cur.fetchone()
    return str(row[0]) if row else None


async def list_for_staff(conn: Conn, user_id: UUID, venue_id: UUID) -> list[StaffOrder]:
    """Paid orders of the venue that this user's role may see (app.can_read_order, the same
    rule RLS applies to direct reads)."""
    # Transaction-local, so the claim never outlives this request's transaction.
    await conn.execute(
        "select set_config('request.jwt.claims', %s, true)",
        (json.dumps({"sub": str(user_id), "role": "authenticated"}),),
    )
    async with conn.cursor(row_factory=class_row(StaffOrder)) as cur:
        await cur.execute(
            _STAFF_SELECT + "where o.venue_id = %s and o.paid_at is not null "
            "and app.can_read_order(o.venue_id, o.status, o.paid_at, o.status_updated_at, "
            "o.service_mode) "
            "order by o.paid_at, o.ticket_number",
            (venue_id,),
        )
        return await cur.fetchall()


async def get_for_staff(conn: Conn, user_id: UUID, order_id: UUID) -> tuple[StaffOrder, str] | None:
    """A paid order of one of the user's venues (locked), with the user's role there."""
    async with conn.cursor(row_factory=class_row(StaffOrder)) as cur:
        await cur.execute(
            _STAFF_SELECT + "join public.staff_members s "
            "on s.venue_id = o.venue_id and s.user_id = %s "
            "where o.id = %s and o.paid_at is not null for update of o",
            (user_id, order_id),
        )
        order = await cur.fetchone()
    if order is None:
        return None
    role = await staff_role(conn, user_id, order.venue_id)
    return (order, role) if role else None


async def update_status(conn: Conn, order_id: UUID, *, current: str, target: str) -> bool:
    """Compare-and-set; the DB guard stamps the timestamp and re-checks the transition."""
    cur = await conn.execute(
        "update public.orders set status = %s::public.order_status "
        "where id = %s and status = %s::public.order_status",
        (target, order_id, current),
    )
    return cur.rowcount == 1


async def get_by_id_for_staff(conn: Conn, order_id: UUID) -> StaffOrder | None:
    async with conn.cursor(row_factory=class_row(StaffOrder)) as cur:
        await cur.execute(_STAFF_SELECT + "where o.id = %s", (order_id,))
        return await cur.fetchone()


async def items_for(conn: Conn, order_ids: list[UUID]) -> list[StaffOrderItem]:
    if not order_ids:
        return []
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "select order_id, name_snapshot as name, quantity, unit_price_cents, "
            "line_total_cents, notes, modifiers_snapshot as modifiers "
            "from public.order_items where order_id = any(%s) order by order_id, id",
            (order_ids,),
        )
        rows = await cur.fetchall()
    return [StaffOrderItem(**r) for r in rows]
