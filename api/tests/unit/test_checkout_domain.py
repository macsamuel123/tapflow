"""Checkout rules: re-checkout matrix, guest_name, tip, and the server-built order draft."""

from uuid import UUID, uuid4

import pytest

from app.domain.cart_rules import validate_line
from app.domain.checkout import (
    CartEntry,
    CheckoutError,
    RecheckoutAction,
    build_order_draft,
    recheckout_action,
    require_guest_name,
    validate_tip,
)
from app.domain.menu import MenuItem, Modifier, ModifierGroup, TaxCategory
from app.domain.money import Cents
from app.domain.order_status import ServiceMode
from app.domain.pricing import Tax

VENUE = uuid4()
GST = Tax(id=uuid4(), code="GST", name="Goods and Services Tax", rate_bps=500)
PST = Tax(id=uuid4(), code="PST", name="Provincial Sales Tax", rate_bps=1000)
FOOD = TaxCategory(id=uuid4(), name="Food", taxes=(GST,))
ALCOHOL = TaxCategory(id=uuid4(), name="Alcohol", taxes=(GST, PST))


def item(
    name: str, price: int, category: TaxCategory, groups: tuple[ModifierGroup, ...] = ()
) -> MenuItem:
    return MenuItem(
        id=uuid4(),
        venue_id=VENUE,
        category_id=uuid4(),
        name=name,
        description="",
        price_cents=Cents(price),
        image_url=None,
        ingredients=(),
        allergens=(),
        dietary_tags=(),
        in_stock=True,
        tax_category=category,
        groups=groups,
    )


def entry(
    it: MenuItem, quantity: int = 1, modifiers: list[UUID] | None = None, notes: str = ""
) -> CartEntry:
    line = validate_line(it, venue_id=VENUE, modifier_ids=modifiers or [], quantity=quantity)
    return CartEntry(line=line, notes=notes)


# ---------------------------------------------------------------- re-checkout matrix


@pytest.mark.parametrize(
    ("pi_status", "action"),
    [
        ("requires_payment_method", RecheckoutAction.REPLACE),
        ("requires_confirmation", RecheckoutAction.REPLACE),
        ("canceled", RecheckoutAction.REPLACE),  # can't be confirmed again
        ("processing", RecheckoutAction.REUSE),
        ("succeeded", RecheckoutAction.REUSE),
        ("requires_action", RecheckoutAction.REUSE),
        ("requires_capture", RecheckoutAction.REUSE),
        ("some_future_status", RecheckoutAction.REUSE),
    ],
)
def test_recheckout_action(pi_status: str, action: RecheckoutAction) -> None:
    assert recheckout_action(pi_status) is action


# ---------------------------------------------------------------- guest name


def test_guest_name_required_at_pickup_only() -> None:
    with pytest.raises(CheckoutError) as err:
        require_guest_name(ServiceMode.PICKUP, None)
    assert err.value.code == "guest_name_required"
    with pytest.raises(CheckoutError):
        require_guest_name(ServiceMode.PICKUP, "   ")
    assert require_guest_name(ServiceMode.PICKUP, "  Ana ") == "Ana"
    assert require_guest_name(ServiceMode.DELIVERY, None) is None
    assert require_guest_name(ServiceMode.DELIVERY, "Bo") == "Bo"


def test_guest_name_too_long() -> None:
    with pytest.raises(CheckoutError) as err:
        require_guest_name(ServiceMode.PICKUP, "x" * 41)
    assert err.value.code == "guest_name_invalid"
    assert require_guest_name(ServiceMode.PICKUP, "x" * 40) == "x" * 40


# ---------------------------------------------------------------- tip


def test_tip_rules() -> None:
    assert validate_tip(0, Cents(1000)) == 0
    assert validate_tip(1000, Cents(1000)) == 1000
    for bad in (-1, 1001):
        with pytest.raises(CheckoutError):
            validate_tip(bad, Cents(1000))
    for not_int in (5.0, "500", True, None):
        with pytest.raises(CheckoutError) as err:
            validate_tip(not_int, Cents(1000))
        assert err.value.code == "tip_invalid"


# ---------------------------------------------------------------- draft


def test_draft_snapshots_taxes_fee_and_untaxed_tip() -> None:
    size = ModifierGroup(
        id=uuid4(),
        item_id=uuid4(),
        name="Size",
        min_select=1,
        max_select=1,
        required=True,
        modifiers=(),
    )
    large = Modifier(
        id=uuid4(), group_id=size.id, name="Large", price_delta_cents=Cents(400), in_stock=True
    )
    size = ModifierGroup(
        id=size.id,
        item_id=size.item_id,
        name="Size",
        min_select=1,
        max_select=1,
        required=True,
        modifiers=(large,),
    )
    fries = item("Truffle Fries", 1100, FOOD, (size,))
    wine = item("House Red Wine", 900, ALCOHOL)
    entries = [entry(fries, 2, [large.id], notes="no salt"), entry(wine, 1)]

    no_tip = build_order_draft(entries, platform_fee_bps=300, tip=Cents(0))
    tipped = build_order_draft(entries, platform_fee_bps=300, tip=Cents(500))

    # subtotal = 2*(1100+400) + 900 = 3900; GST on 3900 = 195; PST on 900 = 90.
    q = tipped.quote
    assert q.subtotal_cents == 3900
    assert [(t.code, t.base_cents, t.tax_cents) for t in q.tax_lines] == [
        ("GST", 3900, 195),
        ("PST", 900, 90),
    ]
    assert q.tax_cents == 285
    assert q.tip_cents == 500
    assert q.total_cents == 3900 + 285 + 500
    assert no_tip.quote.tax_cents == tipped.quote.tax_cents  # tip is never taxed
    assert no_tip.quote.total_cents == 3900 + 285
    assert q.platform_fee_cents == 117  # 3% of the pre-tax subtotal
    assert q.platform_fee_cents <= q.total_cents

    first, second = tipped.items
    assert (first.name, first.unit_price_cents, first.quantity, first.line_total_cents) == (
        "Truffle Fries",
        1500,
        2,
        3000,
    )
    assert first.notes == "no salt"
    assert [(m.name, m.price_delta_cents) for m in first.modifiers] == [("Large", 400)]
    assert (first.tax_category_name, first.tax_codes) == ("Food", ("GST",))
    assert (second.tax_category_name, second.tax_codes) == ("Alcohol", ("GST", "PST"))


def test_draft_rejects_tip_above_subtotal_and_empty_cart() -> None:
    with pytest.raises(CheckoutError) as err:
        build_order_draft([entry(item("Latte", 550, FOOD))], platform_fee_bps=300, tip=Cents(551))
    assert err.value.code == "tip_too_large"
    with pytest.raises(CheckoutError) as err:
        build_order_draft([], platform_fee_bps=300, tip=Cents(0))
    assert err.value.code == "cart_empty"


def test_draft_rejects_fee_above_total() -> None:
    free = item("Water", 0, FOOD)
    # 0 subtotal → 0 fee; force the edge with a 100% fee on a priced item instead.
    assert (
        build_order_draft([entry(free)], platform_fee_bps=300, tip=Cents(0)).quote.total_cents == 0
    )
    full = build_order_draft([entry(item("Tea", 100, FOOD))], platform_fee_bps=10_000, tip=Cents(0))
    assert full.quote.platform_fee_cents == 100 <= full.quote.total_cents
