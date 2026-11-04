"""Pricing in integer cents (CLAUDE.md invariant 1). Tax is per category, rounded half-up.

Seed categories: Food 5% (500 bps), Alcohol 15% (1500 bps); platform fee 3% (300 bps)."""

from uuid import UUID

import pytest

from app.domain.money import Cents
from app.domain.pricing import TaxableLine, line_total, quote, unit_price

FOOD = UUID("90000000-0000-4000-8000-000000000001")
ALCOHOL = UUID("90000000-0000-4000-8000-000000000002")
FOOD_BPS = 500
ALCOHOL_BPS = 1500
FEE_BPS = 300


def c(n: int) -> Cents:
    return Cents(n)


def food(amount: int) -> TaxableLine:
    return TaxableLine(
        amount_cents=c(amount),
        tax_category_id=FOOD,
        tax_category_name="Food",
        tax_rate_bps=FOOD_BPS,
    )


def alcohol(amount: int) -> TaxableLine:
    return TaxableLine(
        amount_cents=c(amount),
        tax_category_id=ALCOHOL,
        tax_category_name="Alcohol",
        tax_rate_bps=ALCOHOL_BPS,
    )


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


# ---------------------------------------------------------------- tax rounding (half-up)


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
def test_food_tax_is_5_percent_rounded_half_up(subtotal: int, tax: int) -> None:
    q = quote([food(subtotal)], platform_fee_bps=FEE_BPS)
    assert q.tax_cents == tax
    assert q.total_cents == subtotal + tax


def test_tax_is_computed_on_the_category_subtotal_not_per_line() -> None:
    # Per line: 10.10 * 5% = 0.505 -> 0.51, twice = 1.02. On the subtotal: 20.20 * 5% = 1.01.
    q = quote([food(1010), food(1010)], platform_fee_bps=FEE_BPS)
    assert q.subtotal_cents == 2020
    assert q.tax_cents == 101


def test_each_category_rounds_on_its_own_then_sums() -> None:
    # Food 0.10 * 5% = 0.005 -> 0.01. Alcohol 0.10 * 15% = 0.015 -> 0.02. Sum 0.03.
    q = quote([food(10), alcohol(10)], platform_fee_bps=FEE_BPS)
    assert [(tl.name, tl.subtotal_cents, tl.tax_cents) for tl in q.tax_lines] == [
        ("Food", 10, 1),
        ("Alcohol", 10, 2),
    ]
    assert q.tax_cents == 3
    assert q.subtotal_cents == 20


def test_mixed_cart_priced_per_category() -> None:
    # Food: Truffle Fries Large $15.00 + Latte Oat $6.25 x2 = $27.50 -> tax 1.375 -> 138.
    # Alcohol: House Lager $6.50 x2 = $13.00 -> tax 1.95 -> 195 (exact).
    fries = line_total(unit_price(c(1100), [c(400)]), 1)
    lattes = line_total(unit_price(c(550), [c(75)]), 2)
    lager = line_total(unit_price(c(650), []), 2)
    q = quote(
        [
            TaxableLine(fries, FOOD, "Food", FOOD_BPS),
            TaxableLine(lattes, FOOD, "Food", FOOD_BPS),
            TaxableLine(lager, ALCOHOL, "Alcohol", ALCOHOL_BPS),
        ],
        platform_fee_bps=FEE_BPS,
    )
    assert (q.subtotal_cents, q.tax_cents, q.tip_cents, q.total_cents) == (4050, 333, 0, 4383)
    assert [(tl.name, tl.subtotal_cents, tl.tax_cents) for tl in q.tax_lines] == [
        ("Food", 2750, 138),
        ("Alcohol", 1300, 195),
    ]
    # 3% platform fee on the pre-tax subtotal: 4050 * 300 / 10000 = 121.5 -> 122 cents (half-up).
    assert q.platform_fee_cents == 122


def test_platform_fee_is_on_pre_tax_subtotal_and_not_added_to_total() -> None:
    q = quote([food(10000)], platform_fee_bps=FEE_BPS)
    assert q.platform_fee_cents == 300  # 3% of $100.00, not of $105.00
    assert q.total_cents == 10500


def test_empty_cart_is_all_zero() -> None:
    q = quote([], platform_fee_bps=FEE_BPS)
    assert (q.subtotal_cents, q.tax_cents, q.platform_fee_cents, q.total_cents) == (0, 0, 0, 0)
    assert q.tax_lines == ()


def test_tip_is_added_to_total_but_not_taxed() -> None:
    q = quote([food(1000)], platform_fee_bps=FEE_BPS, tip=c(200))
    assert (q.tax_cents, q.tip_cents, q.total_cents) == (50, 200, 1250)


def test_zero_rate_category() -> None:
    q = quote(
        [TaxableLine(c(1234), FOOD, "Zero-rated", 0)],
        platform_fee_bps=FEE_BPS,
    )
    assert (q.tax_cents, q.total_cents) == (0, 1234)


def test_same_category_must_have_one_definition() -> None:
    with pytest.raises(ValueError):
        quote(
            [food(100), TaxableLine(c(100), FOOD, "Food", 1000)],
            platform_fee_bps=FEE_BPS,
        )


# ---------------------------------------------------------------- no floats, ever


def test_every_amount_is_an_int() -> None:
    q = quote([food(1099), alcohol(1)], platform_fee_bps=FEE_BPS)
    amounts = (q.subtotal_cents, q.tax_cents, q.tip_cents, q.platform_fee_cents, q.total_cents)
    for amount in amounts:
        assert type(amount) is int
    for tl in q.tax_lines:
        assert type(tl.tax_cents) is int and type(tl.subtotal_cents) is int


@pytest.mark.parametrize("bad", [10.5, 10.0, "1000", True, None])
def test_non_int_amounts_are_rejected(bad: object) -> None:
    with pytest.raises(TypeError):
        unit_price(bad, [])  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        unit_price(c(100), [bad])  # type: ignore[list-item]
    with pytest.raises(TypeError):
        quote(
            [TaxableLine(bad, FOOD, "Food", FOOD_BPS)],  # type: ignore[arg-type]
            platform_fee_bps=FEE_BPS,
        )


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
        quote([food(-1)], platform_fee_bps=FEE_BPS)
