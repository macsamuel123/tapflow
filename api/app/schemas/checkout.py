from uuid import UUID

from pydantic import Field

from app.domain.checkout import MAX_GUEST_NAME
from app.schemas.base import Inbound, Outbound

MAX_TIP_CENTS = 1_000_000


class CheckoutRequest(Inbound):
    """No amounts but the diner's own tip choice. Totals, prices and fees are rejected
    (extra="forbid"): the API computes them from DB prices."""

    tip_cents: int = Field(default=0, strict=True, ge=0, le=MAX_TIP_CENTS)
    # Required at pickup touchpoints (checked server-side), optional elsewhere.
    guest_name: str | None = Field(default=None, min_length=1, max_length=MAX_GUEST_NAME)


class CheckoutResponse(Outbound):
    order_id: UUID
    client_secret: str
    currency: str
    total_cents: int
    # True when the session's pending order and PaymentIntent were handed back unchanged.
    reused: bool
