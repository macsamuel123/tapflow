import type { OptionGroup } from "@/services/types";
import { parseDollars } from "./price";

export const MAX_ITEM_NAME = 80;
export const MAX_DESCRIPTION = 300;
export const MAX_CATEGORY_NAME = 80;
export const MAX_PICKS = 20; // modifier_groups.max_select

/** Matching ignores upper/lower case and extra spaces. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function sameName(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

export function menuKey(category: string, name: string): string {
  return `${normalizeName(category)}\n${normalizeName(name)}`;
}

export const PRICE_MESSAGE = "Enter a price from 0 to 10,000.00, like 12.50.";

export function itemNameError(name: string): string | undefined {
  if (!name.trim()) return "Enter a name.";
  return name.trim().length > MAX_ITEM_NAME ? `Use ${MAX_ITEM_NAME} characters or fewer.` : undefined;
}

export function descriptionError(description: string): string | undefined {
  return description.trim().length > MAX_DESCRIPTION ? `Use ${MAX_DESCRIPTION} characters or fewer.` : undefined;
}

export function categoryNameError(name: string): string | undefined {
  if (!name.trim()) return "Enter a category.";
  return name.trim().length > MAX_CATEGORY_NAME ? `Use ${MAX_CATEGORY_NAME} characters or fewer.` : undefined;
}

export function priceError(price: string): string | undefined {
  return parseDollars(price) === null ? PRICE_MESSAGE : undefined;
}

/** Numbers stay as typed so invalid input can be shown and rejected. */
export type OptionForm = { id: string; name: string; price: string };

export type OptionGroupForm = {
  id: string;
  name: string;
  required: boolean;
  minPicks: string;
  maxPicks: string;
  options: OptionForm[];
};

function wholeNumber(raw: string): number | null {
  return /^\d{1,3}$/.test(raw.trim()) ? Number(raw.trim()) : null;
}

/** The rules are the database's: required ⇔ min ≥ 1, optional ⇔ min = 0, max from 1 to 20. */
export function optionGroupError(group: OptionGroupForm): string | undefined {
  if (!group.name.trim()) return "Give this group a name.";
  if (group.options.length === 0) return "Add at least one option.";
  if (group.options.some((o) => !o.name.trim())) return "Give every option a name.";
  if (group.options.some((o) => parseDollars(o.price) === null)) return `Option prices: ${PRICE_MESSAGE}`;
  const min = wholeNumber(group.minPicks);
  const max = wholeNumber(group.maxPicks);
  if (min === null || max === null) return "Min and max picks must be whole numbers.";
  if (max < 1) return "Max picks must be at least 1.";
  if (min > max) return "Min picks can't be more than max picks.";
  if (max > group.options.length) return "Max picks can't be more than the number of options.";
  if (max > MAX_PICKS) return `Max picks can't be more than ${MAX_PICKS}.`;
  if (group.required && min < 1) return "A required group needs at least 1 pick.";
  if (!group.required && min !== 0) return "An optional group must have 0 min picks.";
  return undefined;
}

export function toOptionGroup(group: OptionGroupForm): OptionGroup {
  return {
    id: group.id,
    name: group.name.trim(),
    required: group.required,
    minPicks: wholeNumber(group.minPicks) ?? 0,
    maxPicks: wholeNumber(group.maxPicks) ?? 1,
    options: group.options.map((o) => ({
      id: o.id,
      name: o.name.trim(),
      priceDeltaCents: parseDollars(o.price) ?? 0,
    })),
  };
}
