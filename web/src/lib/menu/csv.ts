import type { AllergenId, MenuImportRow, TaxCategory } from "@/services/types";
import { allergenFromCsv } from "./allergens";
import { parseDollars } from "./price";
import { descriptionError, itemNameError, categoryNameError, menuKey } from "./rules";

export const MAX_CSV_BYTES = 1_000_000;
export const MAX_CSV_ROWS = 1_000;
export const TEMPLATE_NAME = "tapflow-menu-template.csv";

const COLUMNS = ["category", "name", "description", "price", "tax_type", "sold_out", "allergens"];
const REQUIRED_COLUMNS = ["category", "name", "price", "tax_type", "allergens"];
const NOT_CSV = "That doesn't look like a CSV file. Choose a .csv file.";
const SOLD_OUT_HELP = "yes/no, y/n, true/false, 1/0 or sold out/available";

// sold_out is left out of the template: owners set it with the toggle after import.
export const TEMPLATE_CSV = [
  COLUMNS.filter((c) => c !== "sold_out").join(","),
  'Mains,Smash burger,"Double patty, pickles, house sauce",18.00,food,milk|wheat',
  "Drinks,Harbour Lager,Crisp and clean,8.00,alcohol,wheat",
  "Drinks,Sparkling lemonade,,5.00,food,none",
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

// Spreadsheets add spaces, and quotes survive some exports, so these two columns are forgiving.
const EDGE_NOISE = /^[\s"'`“”‘’]+|[\s"'`“”‘’]+$/g;
const SOLD_OUT_VALUES = new Set(["yes", "y", "true", "1", "sold out"]);
const AVAILABLE_VALUES = new Set(["no", "n", "false", "0", "available"]);

function cleanValue(value: string): string {
  return value.replace(EDGE_NOISE, "").replace(/\s+/g, " ").toLowerCase();
}

function parseSoldOut(value: string): boolean | null | "bad" {
  const text = cleanValue(value);
  if (!text) return null;
  if (SOLD_OUT_VALUES.has(text)) return true;
  return AVAILABLE_VALUES.has(text) ? false : "bad";
}

function parseAllergens(value: string): { ids: AllergenId[]; problem: string | null } {
  const parts = value.split(/[|,]/).map(cleanValue).filter(Boolean);
  if (parts.length === 0) return { ids: [], problem: "allergens required — use none if none" };
  if (parts.includes("none")) {
    return { ids: [], problem: parts.length > 1 ? "none can't be combined with allergens" : null };
  }
  const ids = parts.map(allergenFromCsv);
  const unknown = parts.filter((_, i) => ids[i] === null);
  return {
    ids: [...new Set(ids.filter((id): id is AllergenId => id !== null))],
    problem: unknown.length ? `Unknown allergen: ${unknown.join(", ")}` : null,
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
  if (soldOut === "bad") {
    reasons.push(`Unknown sold_out value "${get("sold_out").trim().slice(0, 30)}": use ${SOLD_OUT_HELP}`);
  }
  const allergens = parseAllergens(get("allergens"));
  if (allergens.problem) reasons.push(allergens.problem);

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
    // Not "|": it separates allergens. Semicolons are how Excel saves CSV in some regions.
    delimitersToGuess: [",", ";", "\t"],
    transformHeader: (header) => cleanValue(header).replace(/[ -]/g, "_"),
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
    const { __parsed_extra: rawExtra, ...raw } = record as Record<string, string> & { __parsed_extra?: string[] };
    const extra = (rawExtra ?? []).filter((cell) => cell.trim());
    // An unquoted "milk, wheat" in a last allergens column spills into extra cells.
    const spilled = extra.length > 0 && headers.at(-1) === "allergens";
    if (spilled) raw.allergens = [raw.allergens ?? "", ...extra].join(",");
    const checked = checkRow(raw, extra.length > 0 && !spilled);
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
