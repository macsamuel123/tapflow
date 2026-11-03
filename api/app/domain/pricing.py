"""Order pricing. Pure functions, integer cents only (PLAN.md §4).

    unit     = item.price + sum(modifier.price_delta)
    line     = unit * quantity
    subtotal = sum(line)
    tax      = round_half_up(subtotal * tax_rate_bps / 10000)       # on the order subtotal
    fee      = round_half_up(subtotal * platform_fee_bps / 10000)   # on the pre-tax subtotal
    total    = subtotal + tax + tip                                 # prices are tax-exclusive

Every amount the API returns or charges comes from these functions, fed with DB prices.
"""

from collections.abc import Iterable
from dataclasses import dataclass

from app.domain.money import Cents, apply_bps_round_half_up

MIN_QUANTITY = 1
MAX_QUANTITY = 20
ZERO = Cents(0)


def _require_cents(name: str, value: object) -> int:
    # bool is an int subclass and float would silently creep in: reject both at runtime.
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(f"{name} must be int cents, got {type(value).__name__}")
    if value < 0:
        raise ValueError(f"{name} must be non-negative")
    return value


def unit_price(base_price: Cents, modifier_deltas: Iterable[Cents]) -> Cents:
    total = _require_cents("base_price", base_price)
    for delta in modifier_deltas:
        total += _require_cents("modifier delta", delta)
    return Cents(total)


def line_total(unit: Cents, quantity: int) -> Cents:
    _require_cents("unit price", unit)
    if isinstance(quantity, bool) or not isinstance(quantity, int):
        raise TypeError("quantity must be an int")
    if not MIN_QUANTITY <= quantity <= MAX_QUANTITY:
        raise ValueError(f"quantity must be between {MIN_QUANTITY} and {MAX_QUANTITY}")
    return Cents(unit * quantity)


@dataclass(frozen=True, slots=True)
class OrderQuote:
    subtotal_cents: Cents
    tax_cents: Cents
    tip_cents: Cents
    platform_fee_cents: Cents
    total_cents: Cents


def quote(
    line_totals: Iterable[Cents],
    *,
    tax_rate_bps: int,
    platform_fee_bps: int,
    tip: Cents = ZERO,
) -> OrderQuote:
    subtotal = Cents(sum(_require_cents("line total", lt) for lt in line_totals))
    _require_cents("tip", tip)
    tax = apply_bps_round_half_up(subtotal, tax_rate_bps)
    fee = apply_bps_round_half_up(subtotal, platform_fee_bps)
    return OrderQuote(
        subtotal_cents=subtotal,
        tax_cents=tax,
        tip_cents=tip,
        platform_fee_cents=fee,
        total_cents=Cents(subtotal + tax + tip),
    )
