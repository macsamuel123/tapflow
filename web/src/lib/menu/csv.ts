import type { AllergenId, MenuImportRow, TaxCategory } from "@/services/types";
import { allergenFromCsv } from "./allergens";
import { parseDollars } from "./price";
import { descriptionError, itemNameError, categoryNameError, menuKey } from "./rules";

export const MAX_CSV_BYTES = 1_000_000;
export const MAX_CSV_ROWS = 1_000;
export const TEMPLATE_NAME = "tapflow-menu-template.csv";

const COLUMNS = ["category", "name", "description", "price", "tax_type", "sold_out", "allergens"];
const REQUIRED_COLUMNS = ["category", "name", "price", "tax_type"];
const NOT_CSV = "That doesn't look like a CSV file. Choose a .csv file.";

export const TEMPLATE_CSV = [
  COLUMNS.join(","),
  'Mains,Smash burger,"Double patty, pickles, house sauce",18.00,food,no,milk|wheat',
  "Drinks,Harbour Lager,Crisp and clean,8.00,alcohol,no,wheat",
  "Desserts,Lemon tart,,7.50,food,yes,eggs|milk|wheat",
].join("\r\n") + "\r\n";

export type PreviewRow = {
  line: number;
  raw: Record<string, string>;
  row: MenuImportRow | null;
  reason: string | null;
  duplicate: boolean;
};

export type CsvPreview = { error: string; rows?: undefined } | { error?: undefined; rows: PreviewRow[] };

function parseTax(value: string): TaxCategory | null {
  const tax = value.trim().toLowerCase();
  if (tax === "food") return "Food";
  return tax === "alcohol" ? "Alcohol" : null;
}

function parseSoldOut(value: string): boolean | null | "bad" {
  const text = value.trim().toLowerCase();
  if (!text) return null;
  if (text === "yes") return true;
  return text === "no" ? false : "bad";
}

function parseAllergens(value: string): { ids: AllergenId[] | null; unknown: string[] } {
  if (!value.trim()) return { ids: null, unknown: [] };
  const parts = value.split("|").map((p) => p.trim()).filter(Boolean);
  const ids = parts.map(allergenFromCsv);
  return {
    ids: [...new Set(ids.filter((id): id is AllergenId => id !== null))],
    unknown: parts.filter((_, i) => ids[i] === null),
  };
}

function checkRow(raw: Record<string, string>, extraColumns: boolean) {
  const get = (column: string) => raw[column] ?? "";
  const reasons: string[] = [];
  if (extraColumns) reasons.push("Too many columns (check for an unquoted comma)");
  if (!get("category").trim()) reasons.push("Missing category");
  else if (categoryNameError(get("category"))) reasons.push("Category name too long");
  if (!get("name").trim()) reasons.push("Missing name");
  else if (itemNameError(get("name"))) reasons.push("Name too long (80 characters max)");
  if (descriptionError(get("description"))) reasons.push("Description too long (300 characters max)");
  const priceCents = parseDollars(get("price"));
  if (priceCents === null) reasons.push("Bad price");
  const taxCategory = parseTax(get("tax_type"));
  if (!taxCategory) reasons.push("Unknown tax_type");
  const soldOut = parseSoldOut(get("sold_out"));
  if (soldOut === "bad") reasons.push("sold_out must be yes or no");
  const allergens = parseAllergens(get("allergens"));
  if (allergens.unknown.length) reasons.push(`Unknown allergen: ${allergens.unknown.join(", ")}`);

  if (reasons.length || priceCents === null || !taxCategory || soldOut === "bad") {
    return { row: null, reason: reasons.join("; ") };
  }
  const row: MenuImportRow = {
    category: get("category").trim(),
    name: get("name").trim(),
    priceCents,
    taxCategory,
    description: get("description").trim() || null,
    soldOut,
    allergens: allergens.ids,
  };
  return { row, reason: null };
}

/** Rejects by name and size before reading, then by content in parseMenuCsv. */
export function fileError(file: Pick<File, "name" | "size">): string | null {
  if (!file.name.toLowerCase().endsWith(".csv")) return NOT_CSV;
  return file.size > MAX_CSV_BYTES ? "That file is over the 1 MB limit." : null;
}

export async function parseMenuCsv(text: string, existingKeys: ReadonlySet<string>): Promise<CsvPreview> {
  if (text.includes("\u0000")) return { error: NOT_CSV };
  const Papa = (await import("papaparse")).default;
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim().toLowerCase(),
  });
  const headers = parsed.meta.fields ?? [];
  const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  if (missing.length) return { error: `This file is missing a column: ${missing.join(", ")}.` };
  if (parsed.data.length === 0) return { error: "This file has no items in it." };
  if (parsed.data.length > MAX_CSV_ROWS) {
    return { error: `This file has ${parsed.data.length} rows. The limit is ${MAX_CSV_ROWS}.` };
  }

  const seen = new Set<string>();
  const rows = parsed.data.map((record, i): PreviewRow => {
    const { __parsed_extra: extra, ...raw } = record as Record<string, string> & { __parsed_extra?: unknown };
    const checked = checkRow(raw, extra !== undefined);
    let { row, reason } = checked;
    let duplicate = false;
    if (row) {
      const key = menuKey(row.category, row.name);
      if (seen.has(key)) {
        reason = "Same category and name as an earlier row";
        row = null;
      } else {
        seen.add(key);
        duplicate = existingKeys.has(key);
      }
    }
    return { line: i + 2, raw, row, reason, duplicate };
  });
  return { rows };
}

/** The rows left out of an import, with why, so they can be fixed and uploaded again. */
export async function skippedCsv(rows: { raw: Record<string, string>; reason: string }[]): Promise<string> {
  const Papa = (await import("papaparse")).default;
  return Papa.unparse({
    fields: [...COLUMNS, "reason"],
    data: rows.map(({ raw, reason }) => [...COLUMNS.map((c) => raw[c] ?? ""), reason]),
  });
}
