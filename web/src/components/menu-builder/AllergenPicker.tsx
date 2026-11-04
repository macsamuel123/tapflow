"use client";

import { ALLERGENS, NO_ALLERGENS_LABEL } from "@/lib/menu/allergens";
import type { AllergenId } from "@/services/types";

export type AllergenChoice = { allergens: AllergenId[]; noAllergens: boolean };

/** Ticking an allergen clears "No listed allergens", and the other way round. */
export function AllergenPicker({
  legend = "Allergens",
  allergens,
  noAllergens,
  error,
  onChange,
}: AllergenChoice & { legend?: string; error?: string; onChange: (choice: AllergenChoice) => void }) {
  return (
    <fieldset>
      <legend className="font-semibold text-ink">{legend}</legend>
      <div className="mt-2 grid grid-cols-2 gap-x-2">
        {ALLERGENS.map((allergen) => (
          <label key={allergen.id} className="flex min-h-11 items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="size-5 shrink-0 accent-brand-700"
              checked={allergens.includes(allergen.id)}
              onChange={(e) =>
                onChange({
                  noAllergens: false,
                  allergens: e.target.checked
                    ? [...allergens, allergen.id]
                    : allergens.filter((a) => a !== allergen.id),
                })
              }
            />
            {allergen.label}
          </label>
        ))}
      </div>
      <label className="mt-1 flex min-h-11 items-center gap-2 border-t border-gray-200 pt-1 text-sm font-semibold text-ink">
        <input
          type="checkbox"
          className="size-5 shrink-0 accent-brand-700"
          checked={noAllergens}
          onChange={(e) => onChange({ noAllergens: e.target.checked, allergens: [] })}
        />
        {NO_ALLERGENS_LABEL}
      </label>
      {error ? <p role="alert" className="mt-1 text-sm font-medium text-red-700">{error}</p> : null}
    </fieldset>
  );
}
