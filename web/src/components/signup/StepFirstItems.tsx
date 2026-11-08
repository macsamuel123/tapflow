"use client";

import { useEffect, useMemo } from "react";
import { ImageUpload } from "@/components/ImageUpload";
import { AllergenPicker } from "@/components/menu-builder/AllergenPicker";
import { CategoryField } from "@/components/menu-builder/CategoryField";
import { Button, Card, SelectField, TextField } from "@/components/ui";
import { allergenChoiceError } from "@/lib/menu/allergens";
import { parseDollars } from "@/lib/menu/price";
import { categoryNameError, descriptionError, itemNameError, MAX_DESCRIPTION, priceError } from "@/lib/menu/rules";
import type { AllergenId, MenuImportRow, SignUpInput, TaxCategory } from "@/services/types";

export type QuickItem = {
  id: string;
  name: string;
  description: string;
  price: string;
  category: string;
  taxCategory: TaxCategory;
  allergens: AllergenId[];
  noAllergens: boolean;
};

/** Photos stay in memory, keyed by QuickItem.id: blobs can't go in session storage. */
export type QuickPhotos = Record<string, Blob>;

export function blankQuickItem(category = ""): QuickItem {
  return {
    id: crypto.randomUUID(),
    name: "",
    description: "",
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
    description: descriptionError(item.description),
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
      description: item.description.trim() || null,
      soldOut: null,
      allergens: item.allergens,
      otherAllergens: "",
    }));
}

export function quickPhotos(items: QuickItem[], photos: QuickPhotos): SignUpInput["menuPhotos"] {
  return items.flatMap((item) => {
    const photo = photos[item.id];
    return photo && !isBlankQuickItem(item) ? [{ category: item.category.trim(), name: item.name.trim(), photo }] : [];
  });
}

function usePreviews(photos: QuickPhotos): Record<string, string> {
  const previews = useMemo(
    () => Object.fromEntries(Object.entries(photos).map(([id, blob]) => [id, URL.createObjectURL(blob)])),
    [photos],
  );
  useEffect(() => () => Object.values(previews).forEach((url) => URL.revokeObjectURL(url)), [previews]);
  return previews;
}

export function StepFirstItems({
  quickItems,
  photos,
  showErrors,
  onQuickItems,
  onPhotos,
}: {
  quickItems: QuickItem[];
  photos: QuickPhotos;
  showErrors: boolean;
  onQuickItems: (items: QuickItem[]) => void;
  onPhotos: (photos: QuickPhotos) => void;
}) {
  const categories = [...new Set(quickItems.map((q) => q.category.trim()).filter(Boolean))];
  const previews = usePreviews(photos);

  function setItem(id: string, change: Partial<QuickItem>) {
    onQuickItems(quickItems.map((q) => (q.id === id ? { ...q, ...change } : q)));
  }

  function setPhoto(id: string, photo: Blob | null) {
    const next = { ...photos };
    if (photo) next[id] = photo;
    else delete next[id];
    onPhotos(next);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-ink">Add your first items</h1>
        <p className="mt-1 text-gray-600">
          Optional. Add a few items one at a time. You can import a CSV from the Menu page later.
        </p>
      </div>

      {quickItems.map((item, i) => {
        const errors = showErrors && !isBlankQuickItem(item) ? quickErrors(item) : null;
        const n = i + 1;
        return (
          <Card key={item.id} className="space-y-3">
            <h2 className="text-sm font-semibold text-ink">Item {n}</h2>
            <TextField label={`Item ${n} name`} maxLength={100} value={item.name} error={errors?.name} onChange={(e) => setItem(item.id, { name: e.target.value })} />
            <label className="block">
              <span className="text-sm font-medium text-ink">Item {n} description</span>
              <textarea
                className="mt-1 block min-h-20 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-base text-ink focus-visible:outline-2 focus-visible:outline-brand-700"
                maxLength={MAX_DESCRIPTION + 20}
                placeholder="Optional"
                value={item.description}
                onChange={(e) => setItem(item.id, { description: e.target.value })}
              />
              {errors?.description ? (
                <span role="alert" className="mt-1 block text-sm font-medium text-red-700">{errors.description}</span>
              ) : null}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <TextField label={`Item ${n} price`} inputMode="decimal" placeholder="12.50" value={item.price} error={errors?.price} onChange={(e) => setItem(item.id, { price: e.target.value })} />
              <SelectField label={`Item ${n} tax type`} value={item.taxCategory} onChange={(e) => setItem(item.id, { taxCategory: e.target.value as TaxCategory })}>
                <option value="Food">Food</option>
                <option value="Alcohol">Alcohol</option>
              </SelectField>
            </div>
            <CategoryField
              categories={categories}
              aria-label={`Item ${n} category`}
              value={item.category}
              error={errors?.category}
              onChange={(e) => setItem(item.id, { category: e.target.value })}
            />
            <AllergenPicker
              legend={`Item ${n} allergens`}
              allergens={item.allergens}
              noAllergens={item.noAllergens}
              error={errors?.allergens}
              onChange={(choice) => setItem(item.id, choice)}
            />
            <section className="space-y-1">
              <h3 className="text-sm font-medium text-ink">Photo (optional)</h3>
              <ImageUpload
                name="photo"
                inputLabel={`Item ${n} photo`}
                previewUrl={previews[item.id] ?? null}
                previewClassName="h-24 w-24 rounded-xl object-cover"
                onChoose={(photo) => setPhoto(item.id, photo)}
                onRemove={() => setPhoto(item.id, null)}
              />
            </section>
            {quickItems.length > 1 ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setPhoto(item.id, null);
                  onQuickItems(quickItems.filter((q) => q.id !== item.id));
                }}
              >
                Remove item {n}
              </Button>
            ) : null}
          </Card>
        );
      })}

      <Button
        variant="secondary"
        className="w-full"
        onClick={() => onQuickItems([...quickItems, blankQuickItem(quickItems.at(-1)?.category ?? "")])}
      >
        Add another item
      </Button>
    </div>
  );
}
