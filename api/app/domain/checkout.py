"""Checkout rules. Pure: the router loads rows, these decide.

- re-checkout: what to do with a session's existing pending order, by its PaymentIntent status;
- guest_name: required at pickup touchpoints only (non-financial);
- tip: a diner-chosen amount in int cents, 0..subtotal, never taxed;
- the order draft: item and tax snapshots plus every amount, from DB prices only.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum
from uuid import UUID

from app.domain.cart_rules import ValidatedLine
from app.domain.money import Cents
from app.domain.order_status import ServiceMode
from app.domain.pricing import OrderQuote, TaxableLine, TaxLine, quote

MAX_GUEST_NAME = 40


class RecheckoutAction(StrEnum):
    REPLACE = "replace"  # cancel the old PaymentIntent and order, create new ones
    REUSE = "reuse"  # hand back the existing order and PaymentIntent, create nothing


# The diner hasn't committed to paying yet, so the cart may have changed: start over.
# `canceled` can't be confirmed again, so it is replaced too.
_REPLACE_STATUSES = frozenset({"requires_payment_method", "requires_confirmation", "canceled"})


def recheckout_action(payment_intent_status: str) -> RecheckoutAction:
    """`processing`, `succeeded` and anything else (requires_action, requires_capture, ...)
    reuse: money may already be moving, so never create a second charge."""
    if payment_intent_status in _REPLACE_STATUSES:
        return RecheckoutAction.REPLACE
    return RecheckoutAction.REUSE


class CheckoutError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def require_guest_name(mode: ServiceMode, name: str | None) -> str | None:
    cleaned = name.strip() if name is not None else None
    if cleaned == "":
        cleaned = None
    if cleaned is not None and len(cleaned) > MAX_GUEST_NAME:
        raise CheckoutError(
            "guest_name_invalid", f"Your name can be at most {MAX_GUEST_NAME} characters."
        )
    if mode is ServiceMode.PICKUP and cleaned is None:
        raise CheckoutError(
            "guest_name_required", "Add a name so we can call you when your order is ready."
        )
    return cleaned


def validate_tip(tip: object, subtotal: Cents) -> Cents:
    if isinstance(tip, bool) or not isinstance(tip, int):
        raise CheckoutError("tip_invalid", "The tip must be a whole number of cents.")
    if tip < 0:
        raise CheckoutError("tip_invalid", "The tip can't be negative.")
    if tip > subtotal:
        raise CheckoutError("tip_too_large", "The tip can't be more than the order subtotal.")
    return Cents(tip)


@dataclass(frozen=True, slots=True)
class CartEntry:
    line: ValidatedLine
    notes: str


@dataclass(frozen=True, slots=True)
class ModifierSnapshot:
    id: UUID
    name: str
    price_delta_cents: Cents


@dataclass(frozen=True, slots=True)
class OrderItemDraft:
    item_id: UUID
    name: str
    unit_price_cents: Cents
    quantity: int
    notes: str
    line_total_cents: Cents
    modifiers: tuple[ModifierSnapshot, ...]
    tax_category_name: str
    tax_codes: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class OrderDraft:
    items: tuple[OrderItemDraft, ...]
    quote: OrderQuote

    @property
    def tax_lines(self) -> tuple[TaxLine, ...]:
        return self.quote.tax_lines


def build_order_draft(
    entries: Sequence[CartEntry], *, platform_fee_bps: int, tip: Cents
) -> OrderDraft:
    if not entries:
        raise CheckoutError("cart_empty", "Your cart is empty.")
    items = tuple(
        OrderItemDraft(
            item_id=e.line.item.id,
            name=e.line.item.name,
            unit_price_cents=e.line.unit_price_cents,
            quantity=e.line.quantity,
            notes=e.notes,
            line_total_cents=e.line.line_total_cents,
            modifiers=tuple(
                ModifierSnapshot(id=m.id, name=m.name, price_delta_cents=m.price_delta_cents)
                for m in e.line.modifiers
            ),
            tax_category_name=e.line.item.tax_category.name,
            tax_codes=tuple(t.code for t in e.line.item.tax_category.taxes),
        )
        for e in entries
    )
    q = quote(
        (
            TaxableLine(amount_cents=e.line.line_total_cents, taxes=e.line.item.tax_category.taxes)
            for e in entries
        ),
        platform_fee_bps=platform_fee_bps,
        tip=validate_tip(tip, Cents(sum(e.line.line_total_cents for e in entries))),
    )
    # A check constraint can't span orders and order_payments, so it is enforced here.
    if q.platform_fee_cents > q.total_cents:
        raise CheckoutError("fee_exceeds_total", "The platform fee exceeds the order total.")
    return OrderDraft(items=items, quote=q)
