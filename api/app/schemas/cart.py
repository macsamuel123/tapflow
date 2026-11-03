from uuid import UUID

from pydantic import Field

from app.domain.pricing import MAX_QUANTITY, MIN_QUANTITY
from app.schemas.base import Inbound, Outbound

MAX_NOTES = 200
MAX_MODIFIERS_PER_LINE = 50


class AddCartItemRequest(Inbound):
    """The only things a client may say about a line. No prices, names or totals."""

    item_id: UUID
    modifier_ids: list[UUID] = Field(default_factory=list, max_length=MAX_MODIFIERS_PER_LINE)
    quantity: int = Field(strict=True, ge=MIN_QUANTITY, le=MAX_QUANTITY)
    notes: str = Field(default="", max_length=MAX_NOTES)


class UpdateCartItemRequest(Inbound):
    quantity: int = Field(strict=True, ge=MIN_QUANTITY, le=MAX_QUANTITY)
    notes: str | None = Field(default=None, max_length=MAX_NOTES)


class CartModifierOut(Outbound):
    id: UUID
    name: str
    price_delta_cents: int


class CartLineOut(Outbound):
    id: UUID
    item_id: UUID
    name: str
    modifiers: list[CartModifierOut]
    quantity: int
    notes: str
    unit_price_cents: int
    line_total_cents: int
    # False when the line no longer passes the cart rules (item 86'd, option removed, ...).
    # Unavailable lines are excluded from the totals and must be removed before checkout.
    available: bool
    problem: str | None


class CartResponse(Outbound):
    currency: str
    lines: list[CartLineOut]
    item_count: int
    subtotal_cents: int
    tax_rate_bps: int
    tax_cents: int
    tip_cents: int
    total_cents: int
    verified: bool
    can_checkout: bool
