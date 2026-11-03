"""Pricing in integer cents (CLAUDE.md invariant 1). GST is 5% = 500 bps, half-up."""

import pytest

from app.domain.money import Cents
from app.domain.pricing import line_total, quote, unit_price

GST_BPS = 500
FEE_BPS = 300


def c(n: int) -> Cents:
    return Cents(n)


# ---------------------------------------------------------------- unit + line


def test_unit_price_adds_modifier_deltas() -> None:
    # Bistro Burger $22.00 + Bacon $3.00 + Avocado $2.50
    assert unit_price(c(2200), [c(300), c(250)]) == 2750


def test_unit_price_without_modifiers_is_base_price() -> None:
    assert unit_price(c(800), []) == 800


def test_zero_delta_modifiers_do_not_change_price() -> None:
    assert unit_price(c(2200), [c(0)]) == 2200


@pytest.mark.parametrize(
    ("unit", "qty", "expected"), [(625, 1, 625), (625, 2, 1250), (99, 20, 1980)]
)
def test_line_total_is_unit_times_quantity(unit: int, qty: int, expected: int) -> None:
    assert line_total(c(unit), qty) == expected


@pytest.mark.parametrize("qty", [0, -1, 21])
def test_line_total_rejects_quantity_out_of_range(qty: int) -> None:
    with pytest.raises(ValueError):
        line_total(c(100), qty)


# ---------------------------------------------------------------- GST rounding (half-up)


@pytest.mark.parametrize(
    ("subtotal", "tax"),
    [
        (0, 0),
        (1000, 50),  # exact
        (1090, 55),  # 54.50 -> 55 (half rounds up)
        (1089, 54),  # 54.45 -> 54
        (1110, 56),  # 55.50 -> 56
        (1101, 55),  # 55.05 -> 55
        (2290, 115),  # 114.50 -> 115
        (2750, 138),  # 137.50 -> 138
        (9, 0),  # 0.45 -> 0
        (10, 1),  # 0.50 -> 1
        (19, 1),  # 0.95 -> 1
        (1999999, 100000),  # 99999.95 -> 100000
    ],
)
def test_gst_is_5_percent_rounded_half_up(subtotal: int, tax: int) -> None:
    q = quote([c(subtotal)], tax_rate_bps=GST_BPS, platform_fee_bps=FEE_BPS)
    assert q.tax_cents == tax
    assert q.total_cents == subtotal + tax


def test_tax_is_computed_on_the_order_subtotal_not_per_line() -> None:
    # Per line: 10.10 * 5% = 0.505 -> 0.51, twice = 1.02. On the subtotal: 20.20 * 5% = 1.01.
    q = quote([c(1010), c(1010)], tax_rate_bps=GST_BPS, platform_fee_bps=FEE_BPS)
    assert q.subtotal_cents == 2020
    assert q.tax_cents == 101


def test_realistic_cart() -> None:
    # Truffle Fries, Large ($11.00 + $4.00) x1 and Latte, Oat milk ($5.50 + $0.75) x2.
    fries = line_total(unit_price(c(1100), [c(400)]), 1)
    lattes = line_total(unit_price(c(550), [c(75)]), 2)
    q = quote([fries, lattes], tax_rate_bps=GST_BPS, platform_fee_bps=FEE_BPS)
    assert (q.subtotal_cents, q.tax_cents, q.tip_cents, q.total_cents) == (2750, 138, 0, 2888)
    # 3% platform fee on the pre-tax subtotal: 82.50 -> 83.
    assert q.platform_fee_cents == 83


def test_platform_fee_is_on_pre_tax_subtotal_and_not_added_to_total() -> None:
    q = quote([c(10000)], tax_rate_bps=GST_BPS, platform_fee_bps=FEE_BPS)
    assert q.platform_fee_cents == 300  # 3% of $100.00, not of $105.00
    assert q.total_cents == 10500


def test_empty_cart_is_all_zero() -> None:
    q = quote([], tax_rate_bps=GST_BPS, platform_fee_bps=FEE_BPS)
    assert (q.subtotal_cents, q.tax_cents, q.platform_fee_cents, q.total_cents) == (0, 0, 0, 0)


def test_tip_is_added_to_total_but_not_taxed() -> None:
    q = quote([c(1000)], tax_rate_bps=GST_BPS, platform_fee_bps=FEE_BPS, tip=c(200))
    assert (q.tax_cents, q.tip_cents, q.total_cents) == (50, 200, 1250)


def test_zero_tax_rate() -> None:
    q = quote([c(1234)], tax_rate_bps=0, platform_fee_bps=FEE_BPS)
    assert (q.tax_cents, q.total_cents) == (0, 1234)


# ---------------------------------------------------------------- no floats, ever


def test_every_amount_is_an_int() -> None:
    q = quote([c(1099), c(1)], tax_rate_bps=GST_BPS, platform_fee_bps=FEE_BPS)
    for amount in (q.subtotal_cents, q.tax_cents, q.tip_cents, q.platform_fee_cents, q.total_cents):
        assert type(amount) is int


@pytest.mark.parametrize("bad", [10.5, 10.0, "1000", True, None])
def test_non_int_amounts_are_rejected(bad: object) -> None:
    with pytest.raises(TypeError):
        unit_price(bad, [])  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        unit_price(c(100), [bad])  # type: ignore[list-item]
    with pytest.raises(TypeError):
        quote([bad], tax_rate_bps=GST_BPS, platform_fee_bps=FEE_BPS)  # type: ignore[list-item]


@pytest.mark.parametrize("bad", [2.0, True, "2"])
def test_non_int_quantity_is_rejected(bad: object) -> None:
    with pytest.raises(TypeError):
        line_total(c(100), bad)  # type: ignore[arg-type]


def test_negative_amounts_are_rejected() -> None:
    with pytest.raises(ValueError):
        unit_price(c(-1), [])
    with pytest.raises(ValueError):
        unit_price(c(100), [c(-50)])
    with pytest.raises(ValueError):
        quote([c(-1)], tax_rate_bps=GST_BPS, platform_fee_bps=FEE_BPS)
