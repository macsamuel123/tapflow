"use client";

import { useState, type FormEvent } from "react";
import { Button, FormError, TextField } from "@/components/ui";
import { allergenChoiceError } from "@/lib/menu/allergens";
import { getServices, ServiceError, type AllergenId, type MenuItem } from "@/services";
import { AllergenPicker } from "./AllergenPicker";
import { Sheet } from "./Sheet";

/** Allergens only, for working through imported items that need them. */
export function QuickAllergens({ item, onClose, onSaved }: { item: MenuItem; onClose: () => void; onSaved: () => void }) {
  const [allergens, setAllergens] = useState<AllergenId[]>(item.allergens);
  const [noAllergens, setNoAllergens] = useState(false);
  const [other, setOther] = useState(item.otherAllergens);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choice = other.trim() ? undefined : allergenChoiceError(allergens, noAllergens);

  async function save(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (choice) return;
    try {
      await getServices().menu.setAllergens(item.id, allergens, other);
      onSaved();
    } catch (err) {
      setError(err instanceof ServiceError ? err.message : "Something went wrong. Try again.");
    }
  }

  return (
    <Sheet
      title={`Allergens: ${item.name}`}
      onClose={onClose}
      footer={<Button type="submit" form="quick-allergens" className="flex-1">Save allergens</Button>}
    >
      <form id="quick-allergens" onSubmit={(e) => void save(e)} noValidate className="space-y-4">
        <AllergenPicker
          allergens={allergens}
          noAllergens={noAllergens}
          error={attempted ? choice : undefined}
          onChange={(next) => {
            setAllergens(next.allergens);
            setNoAllergens(next.noAllergens);
            if (next.noAllergens) setOther("");
          }}
        />
        <TextField
          label="Other allergens"
          maxLength={120}
          value={other}
          onChange={(e) => {
            setOther(e.target.value);
            if (e.target.value.trim()) setNoAllergens(false);
          }}
        />
        <FormError message={error} />
      </form>
    </Sheet>
  );
}
