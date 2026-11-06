import type { AllergenId, MenuImportRow } from "@/services/types";
import { allergenLabel, allergensFromCsv, NOT_DECLARED_LABEL } from "./allergens";
import { MAX_PRICE_CENTS, parseImportPrice } from "./price";
import { MAX_CATEGORY_NAME, MAX_DESCRIPTION, MAX_ITEM_NAME, menuKey } from "./rules";

export const MAX_CSV_BYTES = 1_000_000;
export const MAX_CSV_ROWS = 1_000;
export const TEMPLATE_NAME = "tapflow-menu-template.csv";

const COLUMNS = ["category", "name", "description", "price", "tax_type", "sold_out", "allergens"];
const REQUIRED_COLUMNS = ["name", "price"];
export const UNCATEGORISED = "Uncategorised";
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
  /** Null when the row is rejected. */
  row: MenuImportRow | null;
  /** Why it was rejected. Only a missing name or an unreadable price. */
  reason: string | null;
  /** What was assumed or changed. The row still imports. */
  warnings: string[];
  duplicate: boolean;
};

export type CsvPreview = { error: string; rows?: undefined } | { error?: undefined; rows: PreviewRow[] };

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

function parseAllergens(value: string) {
  const parts = value.split(/[|,]/).map(cleanValue).filter(Boolean);
  const warnings: string[] = [];
  if (parts.length === 0) {
    warnings.push(NOT_DECLARED_LABEL);
    return { ids: null, other: "", warnings };
  }
  const ids = new Set<AllergenId>();
  const other: string[] = [];
  for (const part of parts) {
    if (part === "none") continue;
    const known = allergensFromCsv(part);
    if (!known) {
      other.push(part);
      continue;
    }
    known.ids.forEach((id) => ids.add(id));
    if (known.synonym) warnings.push(`${part} read as ${known.ids.map(allergenLabel).join(" and ")}`);
  }
  if (other.length) warnings.push(`Kept as a note: ${other.join(", ")}`);
  // A stated allergen always beats "none".
  if (parts.includes("none") && parts.length > 1) warnings.push("Ignored none, because allergens are listed");
  return { ids: [...ids], other: other.join(", "), warnings };
}

function clip(value: string, max: number, label: string, warnings: string[]): string {
  if (value.length <= max) return value;
  warnings.push(`${label} shortened to ${max} characters`);
  return value.slice(0, max).trimEnd();
}

/** An unquoted 1,200.50 splits into "1" and "200.50". Importing that as $1.00 would be far worse
 *  than rejecting it, so a row with extra cells and 3 digits after the price is unreadable. */
function priceWasSplit(cellAfterPrice: string | undefined, hasExtraCells: boolean): boolean {
  return hasExtraCells && /^\d{3}(\.\d{1,2})?$/.test(cellAfterPrice?.trim() ?? "");
}

function checkRow(raw: Record<string, string>, extraColumns: boolean, splitPrice: boolean) {
  const get = (column: string) => raw[column] ?? "";
  const name = get("name").trim();
  const priceCents = splitPrice ? null : parseImportPrice(get("price"));
  const reasons = [
    ...(name ? [] : ["Missing name"]),
    ...(splitPrice ? ["Bad price: put quotes around prices with commas"] : priceCents === null ? ["Bad price"] : []),
  ];
  if (reasons.length || priceCents === null) return { row: null, reason: reasons.join("; "), warnings: [] };

  const warnings: string[] = [];
  if (priceCents > MAX_PRICE_CENTS) warnings.push("Price is over $10,000.00: check it");
  if (extraColumns) warnings.push("Extra columns ignored");

  let category = get("category").trim();
  if (!category) {
    category = UNCATEGORISED;
    warnings.push(`Category blank: put in ${UNCATEGORISED}`);
  }

  const taxText = cleanValue(get("tax_type"));
  const taxCategory = taxText === "food" ? "Food" : taxText === "alcohol" ? "Alcohol" : null;
  if (!taxCategory) {
    warnings.push(taxText ? `Unknown tax_type "${taxText.slice(0, 30)}": set to Food` : "Tax type blank: set to Food");
  }

  const parsedSoldOut = parseSoldOut(get("sold_out"));
  if (parsedSoldOut === "bad") {
    warnings.push(`Unknown sold_out value "${get("sold_out").trim().slice(0, 30)}": set to available (use ${SOLD_OUT_HELP})`);
  }

  const allergens = parseAllergens(get("allergens"));
  warnings.push(...allergens.warnings);

  const row: MenuImportRow = {
    category: clip(category, MAX_CATEGORY_NAME, "Category", warnings),
    name: clip(name, MAX_ITEM_NAME, "Name", warnings),
    priceCents,
    taxCategory,
    description: clip(get("description").trim(), MAX_DESCRIPTION, "Description", warnings) || null,
    soldOut: parsedSoldOut === "bad" ? null : parsedSoldOut,
    allergens: allergens.ids,
    otherAllergens: allergens.other,
  };
  return { row, reason: null, warnings };
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

  // A repeat of an earlier row in the file is a duplicate like any other: the owner chooses.
  const seen = new Set<string>(existingKeys);
  const rows = parsed.data.map((record, i): PreviewRow => {
    const { __parsed_extra: rawExtra, ...raw } = record as Record<string, string> & { __parsed_extra?: string[] };
    const extra = (rawExtra ?? []).filter((cell) => cell.trim());
    // An unquoted "milk, wheat" in a last allergens column spills into extra cells.
    const spilled = extra.length > 0 && headers.at(-1) === "allergens";
    const cellAfterPrice = raw[headers[headers.indexOf("price") + 1] ?? ""];
    const splitPrice = priceWasSplit(cellAfterPrice, extra.length > 0);
    if (spilled) raw.allergens = [raw.allergens ?? "", ...extra].join(",");
    const { row, reason, warnings } = checkRow(raw, extra.length > 0 && !spilled, splitPrice);
    let duplicate = false;
    if (row) {
      const key = menuKey(row.category, row.name);
      duplicate = seen.has(key);
      seen.add(key);
    }
    return { line: i + 2, raw, row, reason, warnings, duplicate };
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
