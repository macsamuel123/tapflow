"use client";

import { useMemo, useState, type DragEvent, type FormEvent } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { CsvImporter } from "@/components/menu-builder/CsvImporter";
import { ItemEditor } from "@/components/menu-builder/ItemEditor";
import { ConfirmDialog, Sheet } from "@/components/menu-builder/Sheet";
import { Button, Card, FormError, Pill, TextField } from "@/components/ui";
import { allergenLabel, NO_ALLERGENS_LABEL } from "@/lib/menu/allergens";
import { categoryNameError, menuKey } from "@/lib/menu/rules";
import { formatCents } from "@/lib/money";
import { useData } from "@/lib/use-data";
import { getServices, type MenuCategory, type MenuItem } from "@/services";

const EXPAND_ALL_UP_TO = 30;

async function load() {
  const { menu } = getServices();
  const [categories, sample] = await Promise.all([menu.list(), menu.isSample()]);
  return { categories, sample };
}

function ItemCard({
  item,
  currency,
  onEdit,
  onSoldOut,
}: {
  item: MenuItem;
  currency: string;
  onEdit: () => void;
  onSoldOut: () => void;
}) {
  return (
    <Card className="flex items-start gap-3">
      {item.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local blob URL, which next/image can't optimise
        <img src={item.photoUrl} alt="" data-testid="item-photo" className="size-16 shrink-0 rounded-xl object-cover" />
      ) : null}
      <div className="min-w-0 flex-1">
        <button type="button" onClick={onEdit} aria-label={`Edit ${item.name}`} className="min-h-6 w-full text-left font-semibold text-ink">
          {item.name} {item.inStock ? null : <Pill tone="red">Sold out</Pill>}
        </button>
        {item.description ? <p className="text-sm text-gray-600">{item.description}</p> : null}
        <p className="mt-1 text-sm font-medium text-ink">
          {formatCents(item.priceCents, currency)}
          <span className="font-normal text-gray-600"> · {item.taxCategory === "Alcohol" ? "Alcohol (GST + PST)" : "Food (GST)"}</span>
        </p>
        {item.optionGroups.length ? (
          <p className="text-sm text-gray-600">
            Options: {item.optionGroups.map((g) => `${g.name}${g.required ? " (required)" : ""}`).join(", ")}
          </p>
        ) : null}
        <ul aria-label={`Allergens in ${item.name}`} className="mt-1 flex flex-wrap gap-1">
          {item.allergens.map((allergen) => (
            <li key={allergen}><Pill tone="amber">{allergenLabel(allergen)}</Pill></li>
          ))}
          {item.allergens.length === 0 ? <li><Pill>{NO_ALLERGENS_LABEL}</Pill></li> : null}
        </ul>
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1">
        <button
          type="button"
          role="switch"
          aria-checked={!item.inStock}
          aria-label={`${item.name} sold out`}
          onClick={onSoldOut}
          className={`relative h-8 w-14 rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 ${
            item.inStock ? "bg-gray-300" : "bg-red-600"
          }`}
        >
          <span className={`absolute top-1 left-1 size-6 rounded-full bg-white transition ${item.inStock ? "" : "translate-x-6"}`} />
        </button>
        <span aria-hidden className="text-xs text-gray-600">Sold out</span>
      </div>
    </Card>
  );
}

export default function MenuPage() {
  const { venue } = useDashboard();
  const { data, error, reload, run } = useData(load);
  const [editing, setEditing] = useState<{ item: MenuItem | null; category: string } | null>(null);
  const [naming, setNaming] = useState<{ id: string | null; name: string } | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [dragId, setDragId] = useState<string | null>(null);

  const categories = useMemo(() => data?.categories ?? [], [data]);
  const names = categories.map((c) => c.name);
  const total = categories.reduce((sum, c) => sum + c.items.length, 0);
  const keys = useMemo(
    () => new Set(categories.flatMap((c) => c.items.map((i) => menuKey(c.name, i.name)))),
    [categories],
  );
  const { menu } = getServices();

  const isOpen = (category: MenuCategory, index: number) =>
    toggled[category.id] ?? (total <= EXPAND_ALL_UP_TO || index === 0);

  function reorder(id: string, target: number) {
    const ids = categories.map((c) => c.id).filter((c) => c !== id);
    ids.splice(target, 0, id);
    void run(() => menu.reorderCategories(ids));
  }

  function onDrop(event: DragEvent, index: number) {
    event.preventDefault();
    if (dragId) reorder(dragId, index);
    setDragId(null);
  }

  async function saveCategory(event: FormEvent) {
    event.preventDefault();
    if (!naming) return;
    const problem = categoryNameError(naming.name);
    setNameError(problem ?? null);
    if (problem) return;
    const { id, name } = naming;
    if (await run(() => (id ? menu.renameCategory(id, name) : menu.addCategory(name)))) setNaming(null);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-ink">Menu</h1>
        <p className="text-gray-600">Changes show right away. Sold-out items can&apos;t be ordered.</p>
      </div>
      <FormError message={error} />
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button className="col-span-2 sm:col-span-1" onClick={() => setEditing({ item: null, category: names[0] ?? "" })}>Add item</Button>
        <Button variant="secondary" onClick={() => setNaming({ id: null, name: "" })}>Add category</Button>
        <Button variant="secondary" onClick={() => setImporting(true)}>Upload CSV</Button>
      </div>

      {data?.sample ? (
        <Card className="space-y-2 bg-brand-50">
          <p className="text-sm text-ink">This is a sample menu. Start fresh when you&apos;re ready to add your own.</p>
          <Button variant="secondary" onClick={() => setClearing(true)}>Clear sample menu</Button>
        </Card>
      ) : null}

      {data && categories.length === 0 ? (
        <Card><p className="text-gray-600">No items yet. Add one, or upload a CSV.</p></Card>
      ) : null}

      {categories.map((category, index) => {
        const open = isOpen(category, index);
        return (
          <section
            key={category.id}
            aria-label={category.name}
            data-testid="menu-category"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, index)}
            className={`space-y-2 rounded-2xl ${dragId && dragId !== category.id ? "outline-2 outline-dashed outline-gray-300" : ""}`}
          >
            <div className="flex flex-wrap items-center gap-x-1">
              <span
                draggable
                role="button"
                aria-label={`Drag ${category.name}`}
                data-testid="category-drag"
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", category.name); // Firefox won't drag without data
                  e.dataTransfer.effectAllowed = "move";
                  setDragId(category.id);
                }}
                onDragEnd={() => setDragId(null)}
                className="hidden cursor-grab px-1 text-gray-400 select-none md:inline"
              >
                ⋮⋮
              </span>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setToggled((t) => ({ ...t, [category.id]: !open }))}
                className="min-h-11 min-w-0 flex-1 basis-full truncate text-left text-lg font-bold text-ink md:basis-0"
              >
                {category.name} <span className="text-sm font-normal text-gray-500">({category.items.length})</span>
              </button>
              <Button variant="ghost" className="px-2" aria-label={`Move ${category.name} up`} disabled={index === 0} onClick={() => reorder(category.id, index - 1)}>↑</Button>
              <Button variant="ghost" className="px-2" aria-label={`Move ${category.name} down`} disabled={index === categories.length - 1} onClick={() => reorder(category.id, index + 1)}>↓</Button>
              <Button variant="ghost" className="px-2" aria-label={`Rename ${category.name}`} onClick={() => setNaming({ id: category.id, name: category.name })}>Rename</Button>
              <Button variant="ghost" className="px-2 text-red-700" aria-label={`Delete ${category.name}`} onClick={() => void run(() => menu.deleteCategory(category.id))}>Delete</Button>
            </div>
            {open ? (
              <ul className="space-y-2">
                {category.items.map((item) => (
                  <li key={item.id}>
                    <ItemCard
                      item={item}
                      currency={venue.currency}
                      onEdit={() => setEditing({ item, category: category.name })}
                      onSoldOut={() => void run(() => menu.setInStock(item.id, !item.inStock))}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}

      {editing ? (
        <ItemEditor
          item={editing.item}
          categoryName={editing.category}
          categories={names}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      ) : null}

      {naming ? (
        <Sheet
          title={naming.id ? "Rename category" : "Add category"}
          onClose={() => setNaming(null)}
          footer={<Button type="submit" form="category-form" className="flex-1">Save category</Button>}
        >
          <form id="category-form" onSubmit={(e) => void saveCategory(e)} noValidate className="space-y-3">
            <TextField
              label="Category name"
              maxLength={100}
              value={naming.name}
              error={nameError ?? undefined}
              onChange={(e) => setNaming({ ...naming, name: e.target.value })}
            />
            <FormError message={error} />
          </form>
        </Sheet>
      ) : null}

      {importing ? (
        <CsvImporter
          existingKeys={keys}
          currency={venue.currency}
          onImport={async (rows, mode) => {
            const result = await menu.importRows(rows, mode);
            await reload();
            return result;
          }}
          onClose={() => setImporting(false)}
        />
      ) : null}

      {clearing ? (
        <ConfirmDialog
          title="Clear this menu?"
          body="This removes every item and category on this menu, including any you've added."
          confirmLabel="Clear menu"
          onCancel={() => setClearing(false)}
          onConfirm={() => {
            setClearing(false);
            void run(() => menu.clearSample());
          }}
        />
      ) : null}
    </div>
  );
}
