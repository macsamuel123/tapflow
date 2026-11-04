"""Server-side cart rules (CLAUDE.md invariant 2). Pure: callers load the item from the DB.

A cart line is valid when:
- the item exists, belongs to this venue, and is in stock;
- every modifier id is unique, belongs to one of that item's groups, and is in stock;
- every group's selection count is within [min_select, max_select] (required implies min >= 1);
- quantity is 1-20.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum
from uuid import UUID

from app.domain.menu import MenuItem, Modifier
from app.domain.money import Cents
from app.domain.pricing import MAX_QUANTITY, MIN_QUANTITY, line_total, unit_price


class RuleCode(StrEnum):
    ITEM_NOT_FOUND = "item_not_found"
    ITEM_OUT_OF_STOCK = "item_out_of_stock"
    MODIFIER_NOT_FOUND = "modifier_not_found"
    MODIFIER_OUT_OF_STOCK = "modifier_out_of_stock"
    DUPLICATE_MODIFIER = "duplicate_modifier"
    REQUIRED_GROUP_MISSING = "required_group_missing"
    TOO_FEW_SELECTIONS = "too_few_selections"
    TOO_MANY_SELECTIONS = "too_many_selections"
    INVALID_QUANTITY = "invalid_quantity"


class CartRuleError(Exception):
    def __init__(self, code: RuleCode, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True, slots=True)
class ValidatedLine:
    item: MenuItem
    modifiers: tuple[Modifier, ...]  # in menu order (group sort, then modifier sort)
    quantity: int
    unit_price_cents: Cents
    line_total_cents: Cents


def validate_line(
    item: MenuItem | None,
    *,
    venue_id: UUID,
    modifier_ids: Sequence[UUID],
    quantity: int,
) -> ValidatedLine:
    # An item from another venue is reported as "not found": don't confirm it exists.
    if item is None or item.venue_id != venue_id:
        raise CartRuleError(RuleCode.ITEM_NOT_FOUND, "That item isn't on this menu.")
    if not item.in_stock:
        raise CartRuleError(RuleCode.ITEM_OUT_OF_STOCK, f"{item.name} is sold out.")
    if not MIN_QUANTITY <= quantity <= MAX_QUANTITY:
        raise CartRuleError(
            RuleCode.INVALID_QUANTITY,
            f"Quantity must be between {MIN_QUANTITY} and {MAX_QUANTITY}.",
        )
    if len(set(modifier_ids)) != len(modifier_ids):
        raise CartRuleError(RuleCode.DUPLICATE_MODIFIER, "A modifier was selected twice.")

    by_id = {m.id: m for g in item.groups for m in g.modifiers}
    for mid in modifier_ids:
        # Unknown ids, another item's modifiers and another venue's all land here.
        if mid not in by_id:
            raise CartRuleError(
                RuleCode.MODIFIER_NOT_FOUND, f"That option isn't available for {item.name}."
            )
        if not by_id[mid].in_stock:
            raise CartRuleError(RuleCode.MODIFIER_OUT_OF_STOCK, f"{by_id[mid].name} is sold out.")

    chosen = set(modifier_ids)
    selected: list[Modifier] = []
    for group in item.groups:
        picks = [m for m in group.modifiers if m.id in chosen]
        n = len(picks)
        if n == 0 and (group.required or group.min_select > 0):
            raise CartRuleError(
                RuleCode.REQUIRED_GROUP_MISSING, f"Choose an option for {group.name}."
            )
        if n < group.min_select:
            raise CartRuleError(
                RuleCode.TOO_FEW_SELECTIONS,
                f"Choose at least {group.min_select} for {group.name}.",
            )
        if n > group.max_select:
            raise CartRuleError(
                RuleCode.TOO_MANY_SELECTIONS,
                f"Choose at most {group.max_select} for {group.name}.",
            )
        selected.extend(picks)

    unit = unit_price(item.price_cents, (m.price_delta_cents for m in selected))
    return ValidatedLine(
        item=item,
        modifiers=tuple(selected),
        quantity=quantity,
        unit_price_cents=unit,
        line_total_cents=line_total(unit, quantity),
    )
