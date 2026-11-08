import type { CSSProperties } from "react";
import { ensureAA, normalizeHex, textOn } from "./contrast";

/** CSS variables for a venue's brand colour. The colour is made AA-safe even if stored data isn't. */
export function brandStyle(color: string | null | undefined): CSSProperties {
  const hex = color ? normalizeHex(color) : null;
  if (!hex) return {};
  const safe = ensureAA(hex).color;
  return { "--brand": safe, "--brand-text": textOn(safe) } as CSSProperties;
}
