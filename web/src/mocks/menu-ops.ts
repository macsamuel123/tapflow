import { menuKey, sameName } from "@/lib/menu/rules";
import type {
  DuplicateMode,
  ImportResult,
  MenuCategory,
  MenuImportRow,
} from "@/services/types";

export function findCategory(menu: MenuCategory[], name: string): MenuCategory | undefined {
  return menu.find((c) => sameName(c.name, name));
}

export function ensureCategory(menu: MenuCategory[], name: string): MenuCategory {
  const existing = findCategory(menu, name);
  if (existing) return existing;
  const created: MenuCategory = { id: crypto.randomUUID(), name: name.trim(), items: [] };
  menu.push(created);
  return created;
}

export function applyImport(
  menu: MenuCategory[],
  rows: MenuImportRow[],
  onDuplicate: DuplicateMode,
): ImportResult {
  const result: ImportResult = { imported: 0, updated: 0, skipped: 0 };
  const known = new Map(
    menu.flatMap((c) => c.items.map((item) => [menuKey(c.name, item.name), item] as const)),
  );
  for (const row of rows) {
    const key = menuKey(row.category, row.name);
    const existing = known.get(key);
    if (existing && onDuplicate === "skip") {
      result.skipped += 1;
      continue;
    }
    if (existing) {
      existing.priceCents = row.priceCents;
      existing.taxCategory = row.taxCategory;
      existing.description = row.description ?? existing.description;
      existing.inStock = row.soldOut === null ? existing.inStock : !row.soldOut;
      existing.allergens = row.allergens ?? existing.allergens;
      result.updated += 1;
      continue;
    }
    const item = {
      id: crypto.randomUUID(),
      name: row.name.trim(),
      description: row.description ?? "",
      priceCents: row.priceCents,
      taxCategory: row.taxCategory,
      inStock: !(row.soldOut ?? false),
      allergens: row.allergens ?? [],
      optionGroups: [],
      photoUrl: null,
    };
    ensureCategory(menu, row.category).items.push(item);
    known.set(key, item);
    result.imported += 1;
  }
  return result;
}
