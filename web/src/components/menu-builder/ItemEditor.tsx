"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button, buttonClass, FormError, SelectField, TextField, YesNo } from "@/components/ui";
import { allergenChoiceError, SAMPLE_ALLERGENS_NOTE } from "@/lib/menu/allergens";
import { preparePhoto, photoFileError } from "@/lib/menu/photo";
import { centsToInput, parseDollars } from "@/lib/menu/price";
import {
  categoryNameError,
  descriptionError,
  itemNameError,
  MAX_DESCRIPTION,
  optionGroupError,
  priceError,
  toOptionGroup,
  type OptionGroupForm,
} from "@/lib/menu/rules";
import { getServices, ServiceError, type AllergenId, type MenuItem, type TaxCategory } from "@/services";
import { AllergenPicker } from "./AllergenPicker";
import { CategoryField } from "./CategoryField";
import { OptionGroupsEditor } from "./OptionGroupsEditor";
import { ConfirmDialog, Sheet } from "./Sheet";

function toGroupForm(item: MenuItem | null): OptionGroupForm[] {
  return (item?.optionGroups ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    required: g.required,
    minPicks: String(g.minPicks),
    maxPicks: String(g.maxPicks),
    options: g.options.map((o) => ({ id: o.id, name: o.name, price: centsToInput(o.priceDeltaCents) })),
  }));
}

export function ItemEditor({
  item,
  categoryName,
  categories,
  onClose,
  onSaved,
}: {
  item: MenuItem | null;
  categoryName: string;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [price, setPrice] = useState(item ? centsToInput(item.priceCents) : "");
  const [category, setCategory] = useState(categoryName);
  const [taxCategory, setTaxCategory] = useState<TaxCategory>(item?.taxCategory ?? "Food");
  const [soldOut, setSoldOut] = useState(item ? !item.inStock : false);
  const [allergens, setAllergens] = useState<AllergenId[]>(item?.allergens ?? []);
  const [noAllergens, setNoAllergens] = useState(
    item ? item.allergensDeclared && item.allergens.length === 0 && !item.otherAllergens : false,
  );
  const [otherAllergens, setOtherAllergens] = useState(item?.otherAllergens ?? "");
  const [groups, setGroups] = useState(() => toGroupForm(item));
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const previewUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);
  const shownPhoto = previewUrl ?? (photoRemoved ? null : (item?.photoUrl ?? null));

  const errors = {
    name: itemNameError(name),
    description: descriptionError(description),
    price: priceError(price),
    category: categoryNameError(category),
    allergens: otherAllergens.trim() ? undefined : allergenChoiceError(allergens, noAllergens),
  };
  const valid = !Object.values(errors).some(Boolean) && !groups.some((g) => optionGroupError(g));

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    const problem = photoFileError(file);
    setPhotoError(problem);
    if (problem) return;
    try {
      setPhoto(await preparePhoto(file));
      setPhotoRemoved(false);
    } catch {
      setPhotoError("That file couldn't be read as a photo.");
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (!valid) return;
    setBusy(true);
    setError(null);
    const { menu } = getServices();
    const input = {
      name: name.trim(),
      description: description.trim(),
      priceCents: parseDollars(price) ?? 0,
      category: category.trim(),
      taxCategory,
      inStock: !soldOut,
      allergens,
      otherAllergens: otherAllergens.trim(),
      optionGroups: groups.map(toOptionGroup),
    };
    try {
      const id = item?.id ?? (await menu.addItem(input));
      if (item) await menu.updateItem(id, input);
      if (photo) await menu.setPhoto(id, photo);
      else if (photoRemoved && item?.photoUrl) await menu.removePhoto(id);
      onSaved();
    } catch (err) {
      setError(err instanceof ServiceError ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!item) return;
    await getServices().menu.deleteItem(item.id);
    onSaved();
  }

  const formId = "item-editor-form";
  return (
    <>
      <Sheet
        title={item ? `Edit ${item.name}` : "Add item"}
        onClose={onClose}
        footer={
          <>
            {item ? <Button variant="danger" onClick={() => setConfirming(true)}>Delete item</Button> : null}
            <Button type="submit" form={formId} className="flex-1" disabled={busy}>Save item</Button>
          </>
        }
      >
        <form id={formId} onSubmit={(e) => void save(e)} noValidate className="space-y-4">
          <TextField label="Item name" maxLength={100} value={name} error={attempted ? errors.name : undefined} onChange={(e) => setName(e.target.value)} />
          <TextField
            label="Description"
            maxLength={MAX_DESCRIPTION + 50}
            hint={`Up to ${MAX_DESCRIPTION} characters`}
            value={description}
            error={attempted ? errors.description : undefined}
            onChange={(e) => setDescription(e.target.value)}
          />
          <TextField label="Price" inputMode="decimal" placeholder="12.50" value={price} error={attempted ? errors.price : undefined} onChange={(e) => setPrice(e.target.value)} />
          <CategoryField categories={categories} value={category} error={attempted ? errors.category : undefined} onChange={(e) => setCategory(e.target.value)} />
          {item?.taxNote ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-ink">{item.taxNote}. Saving confirms the tax type below.</p>
          ) : null}
          <SelectField label="Tax type" value={taxCategory} onChange={(e) => setTaxCategory(e.target.value as TaxCategory)}>
            <option value="Food">Food (GST)</option>
            <option value="Alcohol">Alcohol (GST + PST)</option>
          </SelectField>
          <YesNo legend="Sold out?" name="sold-out" value={soldOut} onChange={setSoldOut} />

          <section className="space-y-2">
            <h3 className="font-semibold text-ink">Photo</h3>
            {shownPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element -- a local blob URL, which next/image can't optimise
              <img src={shownPhoto} alt="Item preview" className="h-32 w-32 rounded-xl object-cover" />
            ) : null}
            <div className="flex flex-wrap gap-2">
              <label className={buttonClass("secondary", "cursor-pointer has-focus-visible:outline-2")}>
                {shownPhoto ? "Replace photo" : "Upload photo"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    void choosePhoto(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {shownPhoto ? (
                <Button
                  variant="danger"
                  onClick={() => {
                    setPhoto(null);
                    setPhotoRemoved(true);
                  }}
                >
                  Remove photo
                </Button>
              ) : null}
            </div>
            <p className="text-sm text-gray-600">JPG, PNG or WebP, up to 5 MB.</p>
            <FormError message={photoError} />
          </section>

          {item?.sampleAllergens ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-ink">
              {SAMPLE_ALLERGENS_NOTE}. Change the ticks below to set your own.
            </p>
          ) : null}
          <AllergenPicker
            allergens={allergens}
            noAllergens={noAllergens}
            error={attempted ? errors.allergens : undefined}
            onChange={(next) => {
              setAllergens(next.allergens);
              setNoAllergens(next.noAllergens);
              if (next.noAllergens) setOtherAllergens("");
            }}
          />
          <TextField
            label="Other allergens"
            maxLength={120}
            value={otherAllergens}
            onChange={(e) => {
              setOtherAllergens(e.target.value);
              if (e.target.value.trim()) setNoAllergens(false);
            }}
          />

          <OptionGroupsEditor groups={groups} showErrors={attempted} onChange={setGroups} />
          {attempted && !valid ? <FormError message="Fix the highlighted items, then save." /> : null}
          <FormError message={error} />
        </form>
      </Sheet>
      {confirming ? (
        <ConfirmDialog
          title={`Delete ${item?.name}?`}
          body="This can't be undone."
          confirmLabel="Delete"
          onCancel={() => setConfirming(false)}
          onConfirm={() => void remove()}
        />
      ) : null}
    </>
  );
}
