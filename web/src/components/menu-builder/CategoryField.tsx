"use client";

import { useId, type ComponentProps } from "react";
import { TextField } from "@/components/ui";

/** Pick an existing category or type a new one. */
export function CategoryField({
  categories,
  ...props
}: { categories: string[]; label?: string; error?: string } & Omit<ComponentProps<typeof TextField>, "label" | "list">) {
  const listId = useId();
  return (
    <>
      <TextField label="Category" autoComplete="off" list={listId} {...props} />
      <datalist id={listId}>
        {categories.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  );
}
