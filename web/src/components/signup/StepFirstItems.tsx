"use client";

import { useState } from "react";
import { AllergenPicker } from "@/components/menu-builder/AllergenPicker";
import { CategoryField } from "@/components/menu-builder/CategoryField";
import { CsvImporter } from "@/components/menu-builder/CsvImporter";
import { Button, Card, SelectField, TextField } from "@/components/ui";
import { allergenChoiceError } from "@/lib/menu/allergens";
import { parseDollars } from "@/lib/menu/price";
import { categoryNameError, itemNameError, menuKey, priceError } from "@/lib/menu/rules";
import type { AllergenId, DuplicateMode, ImportResult, MenuImportRow, TaxCategory } from "@/services/types";

export type QuickItem = {
  id: string;
  name: string;
  price: string;
  category: string;
  taxCategory: TaxCategory;
  allergens: AllergenId[];
  noAllergens: boolean;
};

export function blankQuickItem(category = ""): QuickItem {
  return {
    id: crypto.randomUUID(),
    name: "",
    price: "",
    category,
    taxCategory: "Food",
    allergens: [],
    noAllergens: false,
  };
}

export function isBlankQuickItem(item: QuickItem): boolean {
  return !item.name.trim() && !item.price.trim();
}

function quickErrors(item: QuickItem) {
  return {
    name: itemNameError(item.name),
    price: priceError(item.price),
    category: categoryNameError(item.category),
    allergens: allergenChoiceError(item.allergens, item.noAllergens),
  };
}

export function hasQuickItemErrors(item: QuickItem): boolean {
  return Object.values(quickErrors(item)).some(Boolean);
}

export function quickRows(items: QuickItem[]): MenuImportRow[] {
  return items
    .filter((item) => !isBlankQuickItem(item))
    .map((item) => ({
      category: item.category.trim(),
      name: item.name.trim(),
      priceCents: parseDollars(item.price) ?? 0,
      taxCategory: item.taxCategory,
      description: null,
      soldOut: null,
      allergens: item.allergens,
    }));
}

function mergeRows(current: MenuImportRow[], rows: MenuImportRow[], mode: DuplicateMode) {
  const merged = new Map(current.map((row) => [menuKey(row.category, row.name), row]));
  const result: ImportResult = { imported: 0, updated: 0, skipped: 0 };
  for (const row of rows) {
    const key = menuKey(row.category, row.name);
    if (!merged.has(key)) result.imported += 1;
    else if (mode === "skip") {
      result.skipped += 1;
      continue;
    } else result.updated += 1;
    merged.set(key, row);
  }
  return { rows: [...merged.values()], result };
}

export function StepFirstItems({
  quickItems,
  csvRows,
  currency,
  showErrors,
  onQuickItems,
  onCsvRows,
}: {
  quickItems: QuickItem[];
  csvRows: MenuImportRow[];
  currency: string;
  showErrors: boolean;
  onQuickItems: (items: QuickItem[]) => void;
  onCsvRows: (rows: MenuImportRow[]) => void;
}) {
  const [importing, setImporting] = useState(false);
  const categories = [
    ...new Set([...csvRows.map((r) => r.category), ...quickItems.map((q) => q.category.trim())].filter(Boolean)),
  ];
  const keys = new Set(csvRows.map((row) => menuKey(row.category, row.name)));

  function setItem(id: string, change: Partial<QuickItem>) {
    onQuickItems(quickItems.map((q) => (q.id === id ? { ...q, ...change } : q)));
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-ink">Add your first items</h1>
        <p className="mt-1 text-gray-600">Optional. You can add more later, with photos and options.</p>
      </div>

      {quickItems.map((item, i) => {
        const errors = showErrors && !isBlankQuickItem(item) ? quickErrors(item) : null;
        return (
          <Card key={item.id} className="space-y-3">
            <h2 className="text-sm font-semibold text-ink">Item {i + 1}</h2>
            <TextField label={`Item ${i + 1} name`} maxLength={100} value={item.name} error={errors?.name} onChange={(e) => setItem(item.id, { name: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label={`Item ${i + 1} price`} inputMode="decimal" placeholder="12.50" value={item.price} error={errors?.price} onChange={(e) => setItem(item.id, { price: e.target.value })} />
              <SelectField label={`Item ${i + 1} tax type`} value={item.taxCategory} onChange={(e) => setItem(item.id, { taxCategory: e.target.value as TaxCategory })}>
                <option value="Food">Food</option>
                <option value="Alcohol">Alcohol</option>
              </SelectField>
            </div>
            <CategoryField
              categories={categories}
              aria-label={`Item ${i + 1} category`}
              value={item.category}
              error={errors?.category}
              onChange={(e) => setItem(item.id, { category: e.target.value })}
            />
            <AllergenPicker
              legend={`Item ${i + 1} allergens`}
              allergens={item.allergens}
              noAllergens={item.noAllergens}
              error={errors?.allergens}
              onChange={(choice) => setItem(item.id, choice)}
            />
            {quickItems.length > 1 ? (
              <Button variant="ghost" onClick={() => onQuickItems(quickItems.filter((q) => q.id !== item.id))}>Remove item {i + 1}</Button>
            ) : null}
          </Card>
        );
      })}

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          onClick={() => onQuickItems([...quickItems, blankQuickItem(quickItems.at(-1)?.category ?? "")])}
        >
          Add another item
        </Button>
        <Button variant="secondary" onClick={() => setImporting(true)}>Upload CSV</Button>
      </div>

      {csvRows.length > 0 ? (
        <p role="status" className="rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-800">
          {csvRows.length} {csvRows.length === 1 ? "item" : "items"} from your CSV will be added.
        </p>
      ) : null}

      {importing ? (
        <CsvImporter
          existingKeys={keys}
          currency={currency}
          onImport={async (rows, mode) => {
            const merged = mergeRows(csvRows, rows, mode);
            onCsvRows(merged.rows);
            return merged.result;
          }}
          onClose={() => setImporting(false)}
        />
      ) : null}
    </div>
  );
}
