"use client";

import { useEffect, useMemo, useState } from "react";
import type { MenuItem, ModifierGroup } from "@/lib/api-types";
import { formatCents, formatDelta, previewLineCents } from "@/lib/money";

const MAX_QTY = 20;
const MAX_NOTES = 200;

type Props = {
  item: MenuItem;
  currency: string;
  onClose: () => void;
  onAdd: (modifierIds: string[], quantity: number, notes: string) => Promise<void>;
};

function groupHint(g: ModifierGroup): string {
  if (g.min_select === g.max_select) return g.required ? `Choose ${g.min_select}` : `Up to ${g.max_select}`;
  if (g.min_select > 0) return `Choose ${g.min_select}–${g.max_select}`;
  return `Optional · up to ${g.max_select}`;
}

export function ModifierSheet({ item, currency, onClose, onAdd }: Props) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggle(group: ModifierGroup, modifierId: string) {
    setError(null);
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      if (current.includes(modifierId)) {
        return { ...prev, [group.id]: current.filter((id) => id !== modifierId) };
      }
      // Single-choice groups behave like radios; multi-choice stop at max_select.
      if (group.max_select === 1) return { ...prev, [group.id]: [modifierId] };
      if (current.length >= group.max_select) return prev;
      return { ...prev, [group.id]: [...current, modifierId] };
    });
  }

  const allSelected = useMemo(() => Object.values(selected).flat(), [selected]);
  const unmet = item.modifier_groups.filter((g) => (selected[g.id]?.length ?? 0) < g.min_select);
  const deltas = item.modifier_groups.flatMap((g) =>
    g.modifiers.filter((m) => allSelected.includes(m.id)).map((m) => m.price_delta_cents),
  );
  const preview = previewLineCents(item.price_cents, deltas, quantity);

  async function submit() {
    if (unmet.length > 0) {
      setError(`Choose an option for ${unmet[0]?.name}.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onAdd(allSelected, quantity, notes.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modifier-sheet-title"
        className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b p-4">
          <div>
            <h2 id="modifier-sheet-title" className="text-lg font-semibold">
              {item.name}
            </h2>
            {item.description && <p className="mt-1 text-sm text-gray-600">{item.description}</p>}
            {item.allergens.length > 0 && (
              <p className="mt-2 text-xs text-gray-500">Contains: {item.allergens.join(", ").replaceAll("_", " ")}</p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-2xl leading-none text-gray-500">
            ×
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {item.modifier_groups.map((g) => {
            const count = selected[g.id]?.length ?? 0;
            const single = g.max_select === 1;
            return (
              <fieldset key={g.id}>
                <legend className="flex w-full items-baseline justify-between">
                  <span className="font-medium">{g.name}</span>
                  <span className={`text-xs ${g.required && count < g.min_select ? "font-semibold text-amber-700" : "text-gray-500"}`}>
                    {g.required ? "Required · " : ""}
                    {groupHint(g)}
                  </span>
                </legend>
                <div className="mt-2 divide-y rounded-lg border">
                  {g.modifiers.map((m) => {
                    const checked = selected[g.id]?.includes(m.id) ?? false;
                    const atMax = !single && !checked && count >= g.max_select;
                    const disabled = !m.in_stock || atMax;
                    return (
                      <label
                        key={m.id}
                        className={`flex items-center justify-between gap-3 px-3 py-3 ${disabled ? "text-gray-400" : "cursor-pointer"}`}
                      >
                        <span className="flex items-center gap-3">
                          <input
                            type={single ? "radio" : "checkbox"}
                            name={g.id}
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggle(g, m.id)}
                            className="h-4 w-4"
                          />
                          {m.name}
                          {!m.in_stock && <span className="text-xs">(sold out)</span>}
                        </span>
                        <span className="text-sm text-gray-600">{formatDelta(m.price_delta_cents, currency)}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}

          <label className="block">
            <span className="font-medium">Notes for the kitchen</span>
            <textarea
              value={notes}
              maxLength={MAX_NOTES}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. no onions"
              className="mt-2 w-full rounded-lg border p-2 text-sm"
            />
          </label>
        </div>

        <div className="space-y-2 border-t p-4">
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-lg border">
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="px-3 py-2 text-lg disabled:text-gray-300"
              >
                −
              </button>
              <span className="w-8 text-center tabular-nums" aria-live="polite">
                {quantity}
              </span>
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={quantity >= MAX_QTY}
                onClick={() => setQuantity((q) => Math.min(MAX_QTY, q + 1))}
                className="px-3 py-2 text-lg disabled:text-gray-300"
              >
                +
              </button>
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="flex-1 rounded-lg bg-gray-900 px-4 py-3 font-medium text-white disabled:opacity-60"
            >
              {submitting ? "Adding…" : `Add to cart · ${formatCents(preview, currency)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
