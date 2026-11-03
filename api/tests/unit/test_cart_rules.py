"""Cart/modifier rules (CLAUDE.md invariant 2). Fixtures mirror the seed menu."""

from dataclasses import replace
from uuid import UUID, uuid4

import pytest

from app.domain.cart_rules import CartRuleError, RuleCode, validate_line
from app.domain.menu import MenuItem, Modifier, ModifierGroup
from app.domain.money import Cents

RESTAURANT = UUID("b0000000-0000-4000-8000-000000000001")
OTHER_RESTAURANT = UUID("b0000000-0000-4000-8000-000000000099")
CATEGORY = uuid4()


def mod(group_id: UUID, name: str, delta: int = 0, *, in_stock: bool = True) -> Modifier:
    return Modifier(
        id=uuid4(), group_id=group_id, name=name, price_delta_cents=Cents(delta), in_stock=in_stock
    )


def group(item_id: UUID, name: str, lo: int, hi: int, mods: list[tuple[str, int]]) -> ModifierGroup:
    gid = uuid4()
    return ModifierGroup(
        id=gid,
        item_id=item_id,
        name=name,
        min_select=lo,
        max_select=hi,
        required=lo >= 1,
        modifiers=tuple(mod(gid, n, d) for n, d in mods),
    )


def item(
    name: str,
    price: int,
    groups_spec: list[tuple[str, int, int, list[tuple[str, int]]]] | None = None,
    *,
    in_stock: bool = True,
    restaurant_id: UUID = RESTAURANT,
) -> MenuItem:
    iid = uuid4()
    return MenuItem(
        id=iid,
        restaurant_id=restaurant_id,
        category_id=CATEGORY,
        name=name,
        description="",
        price_cents=Cents(price),
        image_url=None,
        ingredients=(),
        allergens=(),
        dietary_tags=(),
        in_stock=in_stock,
        groups=tuple(group(iid, *spec) for spec in groups_spec or []),
    )


BURGER = item(
    "Bistro Burger",
    2200,
    [
        ("Doneness", 1, 1, [("Medium rare", 0), ("Medium", 0), ("Well done", 0)]),
        (
            "Add-ons",
            0,
            3,
            [("Bacon", 300), ("Avocado", 250), ("Fried egg", 200), ("Extra cheddar", 200)],
        ),
    ],
)
LATTE = item(
    "Latte",
    550,
    [
        ("Milk", 1, 1, [("Whole milk", 0), ("Oat milk", 75), ("Almond milk", 75)]),
        ("Extras", 0, 1, [("Extra shot", 100)]),
    ],
)
NANAIMO_BAR = item("Nanaimo Bar", 800, in_stock=False)
AMERICANO = item("Americano", 400)


def m(it: MenuItem, group_name: str, mod_name: str) -> UUID:
    g = next(g for g in it.groups if g.name == group_name)
    return next(x.id for x in g.modifiers if x.name == mod_name)


def ok(it: MenuItem | None, modifier_ids: list[UUID], quantity: int = 1) -> tuple[int, int]:
    v = validate_line(it, restaurant_id=RESTAURANT, modifier_ids=modifier_ids, quantity=quantity)
    return v.unit_price_cents, v.line_total_cents


def rejects(it: MenuItem | None, modifier_ids: list[UUID], quantity: int = 1) -> RuleCode:
    with pytest.raises(CartRuleError) as exc:
        validate_line(it, restaurant_id=RESTAURANT, modifier_ids=modifier_ids, quantity=quantity)
    return exc.value.code


# ---------------------------------------------------------------- happy paths


def test_item_without_groups() -> None:
    assert ok(AMERICANO, []) == (400, 400)


def test_required_group_satisfied_and_price_includes_deltas() -> None:
    ids = [m(BURGER, "Doneness", "Medium"), m(BURGER, "Add-ons", "Bacon")]
    assert ok(BURGER, ids, quantity=2) == (2500, 5000)


def test_optional_group_up_to_max() -> None:
    ids = [
        m(BURGER, "Doneness", "Medium rare"),
        m(BURGER, "Add-ons", "Bacon"),
        m(BURGER, "Add-ons", "Avocado"),
        m(BURGER, "Add-ons", "Fried egg"),
    ]
    assert ok(BURGER, ids) == (2200 + 300 + 250 + 200,) * 2


def test_selected_modifiers_returned_in_menu_order() -> None:
    bacon, egg, done = (
        m(BURGER, "Add-ons", "Bacon"),
        m(BURGER, "Add-ons", "Fried egg"),
        m(BURGER, "Doneness", "Well done"),
    )
    v = validate_line(BURGER, restaurant_id=RESTAURANT, modifier_ids=[egg, bacon, done], quantity=1)
    assert [x.name for x in v.modifiers] == ["Well done", "Bacon", "Fried egg"]


@pytest.mark.parametrize("qty", [1, 20])
def test_quantity_bounds_inclusive(qty: int) -> None:
    assert ok(AMERICANO, [], qty) == (400, 400 * qty)


# ---------------------------------------------------------------- item checks


def test_unknown_item() -> None:
    assert rejects(None, []) is RuleCode.ITEM_NOT_FOUND


def test_item_from_another_restaurant_looks_not_found() -> None:
    foreign = item("Foreign Fries", 900, restaurant_id=OTHER_RESTAURANT)
    assert rejects(foreign, []) is RuleCode.ITEM_NOT_FOUND


def test_nanaimo_bar_is_sold_out_and_cannot_be_added() -> None:
    assert rejects(NANAIMO_BAR, []) is RuleCode.ITEM_OUT_OF_STOCK
    assert rejects(NANAIMO_BAR, [], quantity=5) is RuleCode.ITEM_OUT_OF_STOCK


@pytest.mark.parametrize("qty", [0, -1, 21, 1000])
def test_quantity_out_of_range(qty: int) -> None:
    assert rejects(AMERICANO, [], qty) is RuleCode.INVALID_QUANTITY


# ---------------------------------------------------------------- required groups + min/max


def test_required_group_missing() -> None:
    assert rejects(BURGER, []) is RuleCode.REQUIRED_GROUP_MISSING
    # An optional pick does not satisfy the required group.
    assert rejects(BURGER, [m(BURGER, "Add-ons", "Bacon")]) is RuleCode.REQUIRED_GROUP_MISSING


def test_two_picks_in_a_single_choice_group() -> None:
    ids = [m(BURGER, "Doneness", "Medium"), m(BURGER, "Doneness", "Well done")]
    assert rejects(BURGER, ids) is RuleCode.TOO_MANY_SELECTIONS


def test_more_than_max_in_optional_group() -> None:
    ids = [m(BURGER, "Doneness", "Medium")] + [
        m(BURGER, "Add-ons", n) for n in ("Bacon", "Avocado", "Fried egg", "Extra cheddar")
    ]
    assert rejects(BURGER, ids) is RuleCode.TOO_MANY_SELECTIONS


def test_min_select_above_one() -> None:
    sides = item(
        "Combo", 1500, [("Pick two sides", 2, 3, [("Slaw", 0), ("Fries", 0), ("Salad", 0)])]
    )
    one = [m(sides, "Pick two sides", "Slaw")]
    two = [*one, m(sides, "Pick two sides", "Fries")]
    assert rejects(sides, one) is RuleCode.TOO_FEW_SELECTIONS
    assert ok(sides, two) == (1500, 1500)


def test_duplicate_modifier_id() -> None:
    medium = m(BURGER, "Doneness", "Medium")
    bacon = m(BURGER, "Add-ons", "Bacon")
    # Sending bacon twice must not double-count the delta or sneak past max_select.
    assert rejects(BURGER, [medium, bacon, bacon]) is RuleCode.DUPLICATE_MODIFIER


# ---------------------------------------------------------------- foreign / unknown modifiers


def test_modifier_from_another_item() -> None:
    oat = m(LATTE, "Milk", "Oat milk")
    assert rejects(BURGER, [m(BURGER, "Doneness", "Medium"), oat]) is RuleCode.MODIFIER_NOT_FOUND


def test_another_items_modifier_cannot_satisfy_a_required_group() -> None:
    # Latte's "Whole milk" is not a Burger doneness, even though both groups are 1..1.
    assert rejects(BURGER, [m(LATTE, "Milk", "Whole milk")]) is RuleCode.MODIFIER_NOT_FOUND


def test_unknown_modifier_id() -> None:
    assert rejects(AMERICANO, [uuid4()]) is RuleCode.MODIFIER_NOT_FOUND


def test_modifier_from_another_restaurant() -> None:
    foreign_burger = item(
        "Burger", 1800, [("Doneness", 1, 1, [("Medium", 0)])], restaurant_id=OTHER_RESTAURANT
    )
    foreign_medium = m(foreign_burger, "Doneness", "Medium")
    assert rejects(BURGER, [foreign_medium]) is RuleCode.MODIFIER_NOT_FOUND


def test_out_of_stock_modifier() -> None:
    gid = uuid4()
    oat_out = mod(gid, "Oat milk", 75, in_stock=False)
    whole = mod(gid, "Whole milk")
    base = item("Latte", 550)
    milk = ModifierGroup(
        id=gid,
        item_id=base.id,
        name="Milk",
        min_select=1,
        max_select=1,
        required=True,
        modifiers=(whole, oat_out),
    )
    latte = replace(base, groups=(milk,))
    assert rejects(latte, [oat_out.id]) is RuleCode.MODIFIER_OUT_OF_STOCK
    assert ok(latte, [whole.id]) == (550, 550)
