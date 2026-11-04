// The TypeScript twin of api/app/domain/cart_rules.py, for demo mode.
import type { MenuItem, MenuOption } from "@/services/types";

export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 20;
export const MAX_CART_LINES = 20;

export type CheckedLine = { options: MenuOption[]; unitPriceCents: number; lineTotalCents: number };

/** A checked line, or the reason it can't be ordered. Run on every read, so a cart always
 *  reflects the current menu. */
export function checkLine(
  item: MenuItem | undefined,
  optionIds: readonly string[],
  quantity: number,
): CheckedLine | string {
  if (!item) return "That item isn't on this menu.";
  if (!item.inStock) return `${item.name} is sold out.`;
  if (quantity < MIN_QUANTITY || quantity > MAX_QUANTITY) {
    return `Quantity must be between ${MIN_QUANTITY} and ${MAX_QUANTITY}.`;
  }
  const known = new Set(item.optionGroups.flatMap((g) => g.options.map((o) => o.id)));
  if (optionIds.some((id) => !known.has(id))) return `That option isn't available for ${item.name}.`;

  const chosen = new Set(optionIds);
  const options: MenuOption[] = [];
  for (const group of item.optionGroups) {
    const picks = group.options.filter((o) => chosen.has(o.id));
    if (picks.length === 0 && (group.required || group.minPicks > 0)) return `Choose an option for ${group.name}.`;
    if (picks.length < group.minPicks) return `Choose at least ${group.minPicks} for ${group.name}.`;
    if (picks.length > group.maxPicks) return `Choose at most ${group.maxPicks} for ${group.name}.`;
    options.push(...picks);
  }
  const unitPriceCents = options.reduce((sum, o) => sum + o.priceDeltaCents, item.priceCents);
  return { options, unitPriceCents, lineTotalCents: unitPriceCents * quantity };
}
