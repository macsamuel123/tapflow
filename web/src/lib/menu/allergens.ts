import type { AllergenId } from "@/services/types";

export const ALLERGENS: readonly { id: AllergenId; label: string; csv: readonly string[] }[] = [
  { id: "milk", label: "Milk", csv: ["milk"] },
  { id: "egg", label: "Eggs", csv: ["eggs", "egg"] },
  { id: "fish", label: "Fish", csv: ["fish"] },
  { id: "crustacean", label: "Crustacean shellfish", csv: ["crustacean shellfish", "crustacean_shellfish", "crustacean", "crustaceans"] },
  { id: "shellfish", label: "Molluscs", csv: ["molluscs", "mollusks", "mollusc", "mollusk"] },
  { id: "tree_nut", label: "Tree nuts", csv: ["tree nuts", "tree_nuts", "tree nut", "tree_nut"] },
  { id: "peanut", label: "Peanuts", csv: ["peanuts", "peanut"] },
  { id: "gluten", label: "Wheat/gluten", csv: ["wheat", "gluten", "wheat/gluten"] },
  { id: "soy", label: "Soy", csv: ["soy"] },
  { id: "sesame", label: "Sesame", csv: ["sesame"] },
  { id: "mustard", label: "Mustard", csv: ["mustard"] },
  { id: "sulphites", label: "Sulphites", csv: ["sulphites", "sulfites"] },
];

export const SAMPLE_ALLERGENS_NOTE = "Sample data, not a real allergen claim";
export const NO_ALLERGENS_LABEL = "No listed allergens";
export const ALLERGEN_CHOICE_MESSAGE = `Tick the allergens, or tick ${NO_ALLERGENS_LABEL}.`;

/** Nothing ticked is not the same as "none": the owner has to say which it is. */
export function allergenChoiceError(allergens: AllergenId[], noAllergens: boolean): string | undefined {
  return allergens.length > 0 || noAllergens ? undefined : ALLERGEN_CHOICE_MESSAGE;
}

export function allergenLabel(id: AllergenId): string {
  return ALLERGENS.find((a) => a.id === id)?.label ?? id;
}

/** Everyday words that map to the checklist. "shellfish" covers both shellfish groups. */
const SYNONYMS: Record<string, AllergenId[]> = {
  dairy: ["milk"],
  lactose: ["milk"],
  nuts: ["tree_nut"],
  nut: ["tree_nut"],
  shellfish: ["crustacean", "shellfish"],
  soya: ["soy"],
  soybean: ["soy"],
  soybeans: ["soy"],
  "sesame seeds": ["sesame"],
};

export const ASK_STAFF_NOTE = "Ask staff about allergens";
export const NOT_DECLARED_LABEL = "Allergens not declared";

/** The allergens a CSV word means, and whether it was a synonym. Null: an unknown word. */
export function allergensFromCsv(value: string): { ids: AllergenId[]; synonym: boolean } | null {
  const wanted = value.trim().toLowerCase();
  const exact = ALLERGENS.find((a) => a.csv.includes(wanted));
  if (exact) return { ids: [exact.id], synonym: false };
  const mapped = SYNONYMS[wanted];
  return mapped ? { ids: mapped, synonym: true } : null;
}
