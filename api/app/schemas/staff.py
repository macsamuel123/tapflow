from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from app.schemas.base import Inbound, Outbound

# `paid` is deliberately absent: only the payment webhook sets it.
StaffTarget = Literal["accepted", "ready", "delivered", "picked_up", "cancelled"]


class StatusUpdateRequest(Inbound):
    status: StaffTarget


class StaffOrderItemOut(Outbound):
    name: str
    quantity: int
    unit_price_cents: int
    line_total_cents: int
    notes: str
    modifiers: list[dict[str, Any]]


class StaffOrderOut(Outbound):
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
    items: list[StaffOrderItemOut]


class StaffOrdersResponse(Outbound):
    role: str
    orders: list[StaffOrderOut]


class StatusUpdateResponse(Outbound):
    order: StaffOrderOut
    timestamp_field: str
