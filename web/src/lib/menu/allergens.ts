import type { AllergenId } from "@/services/types";

export const ALLERGENS: readonly { id: AllergenId; label: string; csv: readonly string[] }[] = [
  { id: "milk", label: "Milk", csv: ["milk"] },
  { id: "egg", label: "Eggs", csv: ["eggs", "egg"] },
  { id: "fish", label: "Fish", csv: ["fish"] },
  { id: "crustacean", label: "Crustacean shellfish", csv: ["crustacean shellfish", "crustacean_shellfish", "crustacean", "crustaceans"] },
  { id: "tree_nut", label: "Tree nuts", csv: ["tree nuts", "tree_nuts", "tree nut", "tree_nut"] },
  { id: "peanut", label: "Peanuts", csv: ["peanuts", "peanut"] },
  { id: "gluten", label: "Wheat/gluten", csv: ["wheat", "gluten", "wheat/gluten"] },
  { id: "soy", label: "Soy", csv: ["soy"] },
  { id: "sesame", label: "Sesame", csv: ["sesame"] },
  { id: "mustard", label: "Mustard", csv: ["mustard"] },
  { id: "sulphites", label: "Sulphites", csv: ["sulphites", "sulfites"] },
];

export function allergenLabel(id: AllergenId): string {
  return ALLERGENS.find((a) => a.id === id)?.label ?? id;
}

export function allergenFromCsv(value: string): AllergenId | null {
  const wanted = value.trim().toLowerCase();
  return ALLERGENS.find((a) => a.csv.includes(wanted))?.id ?? null;
}
