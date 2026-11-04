"""Order pricing. Pure functions, integer cents only (PLAN.md §4).

    unit       = item.price + sum(modifier.price_delta)
    line       = unit * quantity
    subtotal_c = sum(line for lines in tax category c)
    tax_c      = round_half_up(subtotal_c * rate_c / 10000)     # per category, half-up
    tax        = sum(tax_c)                                      # summed, not re-rounded
    subtotal   = sum(subtotal_c)
    fee        = round_half_up(subtotal * platform_fee_bps / 10000)   # on the pre-tax subtotal
    total      = subtotal + tax + tip                            # prices are tax-exclusive

Every amount the API returns or charges comes from these functions, fed with DB prices.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from uuid import UUID

from app.domain.money import BPS_DENOMINATOR, Cents, apply_bps_round_half_up

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
class TaxableLine:
    """One priced line, tagged with the tax category it is taxed under."""

    amount_cents: Cents
    tax_category_id: UUID
    tax_category_name: str
    tax_rate_bps: int


@dataclass(frozen=True, slots=True)
class TaxLine:
    tax_category_id: UUID
    name: str
    rate_bps: int
    subtotal_cents: Cents
    tax_cents: Cents


@dataclass(frozen=True, slots=True)
class OrderQuote:
    subtotal_cents: Cents
    tax_cents: Cents
    tip_cents: Cents
    platform_fee_cents: Cents
    total_cents: Cents
    tax_lines: tuple[TaxLine, ...]


def quote(
    lines: Iterable[TaxableLine],
    *,
    platform_fee_bps: int,
    tip: Cents = ZERO,
) -> OrderQuote:
    subtotals: dict[UUID, int] = {}
    meta: dict[UUID, tuple[str, int]] = {}
    for line in lines:
        amount = _require_cents("line total", line.amount_cents)
        if not 0 <= line.tax_rate_bps <= BPS_DENOMINATOR:
            raise ValueError("tax rate must be between 0 and 10000 bps")
        known = meta.setdefault(line.tax_category_id, (line.tax_category_name, line.tax_rate_bps))
        if known != (line.tax_category_name, line.tax_rate_bps):
            raise ValueError(f"tax category {line.tax_category_id} has conflicting definitions")
        subtotals[line.tax_category_id] = subtotals.get(line.tax_category_id, 0) + amount

    tax_lines = tuple(
        TaxLine(
            tax_category_id=cid,
            name=meta[cid][0],
            rate_bps=meta[cid][1],
            subtotal_cents=Cents(sub),
            tax_cents=apply_bps_round_half_up(Cents(sub), meta[cid][1]),
        )
        for cid, sub in subtotals.items()
    )
    subtotal = Cents(sum(subtotals.values()))
    tax = Cents(sum(tl.tax_cents for tl in tax_lines))
    _require_cents("tip", tip)
    fee = apply_bps_round_half_up(subtotal, platform_fee_bps)
    return OrderQuote(
        subtotal_cents=subtotal,
        tax_cents=tax,
        tip_cents=tip,
        platform_fee_cents=fee,
        total_cents=Cents(subtotal + tax + tip),
        tax_lines=tax_lines,
    )
