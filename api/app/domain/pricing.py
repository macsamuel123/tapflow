"""Order pricing. Pure functions, integer cents only (PLAN.md §4).

    unit       = item.price + sum(modifier.price_delta)
    line       = unit * quantity
    subtotal   = sum(line)
    base_t     = sum(line for lines taxed by t)              # pre-tax, so never tax on tax
    tax_t      = round_half_up(base_t * rate_t / 10000)      # per tax, half-up
    tax        = sum(tax_t)                                  # summed, not re-rounded
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
class Tax:
    """One tax of a venue, such as GST or PST."""

    id: UUID
    code: str
    name: str
    rate_bps: int


@dataclass(frozen=True, slots=True)
class TaxableLine:
    """One priced line, with the taxes its tax category maps to. No taxes means tax-exempt."""

    amount_cents: Cents
    taxes: tuple[Tax, ...]


@dataclass(frozen=True, slots=True)
class TaxLine:
    tax_id: UUID
    code: str
    name: str
    rate_bps: int
    base_cents: Cents
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
    subtotal = 0
    bases: dict[UUID, int] = {}
    defined: dict[UUID, Tax] = {}
    for line in lines:
        amount = _require_cents("line total", line.amount_cents)
        subtotal += amount
        if len({tax.id for tax in line.taxes}) != len(line.taxes):
            raise ValueError("a line cannot carry the same tax twice")
        for tax in line.taxes:
            if not 0 <= tax.rate_bps <= BPS_DENOMINATOR:
                raise ValueError("tax rate must be between 0 and 10000 bps")
            if defined.setdefault(tax.id, tax) != tax:
                raise ValueError(f"tax {tax.id} has conflicting definitions")
            bases[tax.id] = bases.get(tax.id, 0) + amount

    # Sorted by code so the breakdown does not depend on cart order. Taxes with no taxable
    # amount are left out, so a food-only cart shows GST alone.
    tax_lines = tuple(
        TaxLine(
            tax_id=tax.id,
            code=tax.code,
            name=tax.name,
            rate_bps=tax.rate_bps,
            base_cents=Cents(bases[tax.id]),
            tax_cents=apply_bps_round_half_up(Cents(bases[tax.id]), tax.rate_bps),
        )
        for tax in sorted(defined.values(), key=lambda t: t.code)
        if bases[tax.id] > 0
    )
    tax_total = Cents(sum(tl.tax_cents for tl in tax_lines))
    _require_cents("tip", tip)
    fee = apply_bps_round_half_up(Cents(subtotal), platform_fee_bps)
    return OrderQuote(
        subtotal_cents=Cents(subtotal),
        tax_cents=tax_total,
        tip_cents=tip,
        platform_fee_cents=fee,
        total_cents=Cents(subtotal + tax_total + tip),
        tax_lines=tax_lines,
    )
