"use client";

import { useMemo, useState } from "react";
import { Button, buttonClass, FormError, Pill } from "@/components/ui";
import { fileError, parseMenuCsv, skippedCsv, TEMPLATE_CSV, TEMPLATE_NAME, type PreviewRow } from "@/lib/menu/csv";
import { downloadText } from "@/lib/download";
import { formatCents } from "@/lib/money";
import type { DuplicateMode, ImportResult, MenuImportRow } from "@/services/types";
import { Sheet } from "./Sheet";

const PREVIEW_LIMIT = 100;

function RowCard({ row, currency }: { row: PreviewRow; currency: string }) {
  const name = row.raw.name?.trim() || "(no name)";
  if (row.reason) {
    return (
      <li data-testid="csv-invalid" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm">
        <p className="font-semibold text-red-900">Row {row.line}: {name}</p>
        <p className="text-red-800">{row.reason}</p>
      </li>
    );
  }
  return (
    <li data-testid="csv-valid" className="rounded-xl border border-gray-200 p-3 text-sm">
      <p className="flex justify-between gap-2 font-semibold text-ink">
        <span className="min-w-0 truncate">{name}</span>
        <span className="tabular-nums">{row.row ? formatCents(row.row.priceCents, currency) : ""}</span>
      </p>
      <p className="text-gray-600">
        {row.row?.category} · {row.row?.taxCategory}
        {row.duplicate ? <> · <Pill tone="amber">Already on menu</Pill></> : null}
      </p>
    </li>
  );
}

export function CsvImporter({
  existingKeys,
  currency,
  onImport,
  onClose,
}: {
  existingKeys: ReadonlySet<string>;
  currency: string;
  onImport: (rows: MenuImportRow[], mode: DuplicateMode) => Promise<ImportResult>;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<DuplicateMode | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const invalid = useMemo(() => rows?.filter((r) => r.reason) ?? [], [rows]);
  const valid = useMemo(() => rows?.filter((r) => r.row) ?? [], [rows]);
  const duplicates = valid.filter((r) => r.duplicate);
  const ordered = [...invalid, ...valid];

  async function choose(file: File | undefined) {
    if (!file) return;
    setRows(null);
    setMode(null);
    const problem = fileError(file);
    setError(problem);
    if (problem) return;
    const preview = await parseMenuCsv(await file.text(), existingKeys);
    if (preview.error !== undefined) setError(preview.error);
    else setRows(preview.rows);
  }

  async function runImport() {
    const chosen = mode ?? "skip";
    const outcome = await onImport(valid.flatMap((r) => (r.row ? [r.row] : [])), chosen);
    setResult({ ...outcome, skipped: outcome.skipped + invalid.length });
  }

  async function downloadSkipped() {
    const skippedDuplicates = mode === "update" ? [] : duplicates;
    const text = await skippedCsv([
      ...invalid.map((r) => ({ raw: r.raw, reason: r.reason ?? "" })),
      ...skippedDuplicates.map((r) => ({ raw: r.raw, reason: "Already on the menu" })),
    ]);
    downloadText("tapflow-skipped-rows.csv", text);
  }

  if (result) {
    const parts = [`Imported ${result.imported} ${result.imported === 1 ? "item" : "items"}`];
    if (result.updated) parts.push(`updated ${result.updated}`);
    parts.push(`${result.skipped} skipped`);
    return (
      <Sheet title="Import finished" onClose={onClose} footer={<Button className="flex-1" onClick={onClose}>Done</Button>}>
        <p role="status" className="font-semibold text-ink">{parts.join(", ")}</p>
        {result.skipped > 0 ? (
          <Button variant="secondary" className="mt-4" onClick={() => void downloadSkipped()}>Download skipped rows</Button>
        ) : null}
      </Sheet>
    );
  }

  const needsChoice = duplicates.length > 0 && mode === null;
  return (
    <Sheet
      title="Upload CSV"
      onClose={onClose}
      footer={
        rows ? (
          <Button className="flex-1" disabled={valid.length === 0 || needsChoice} onClick={() => void runImport()}>
            Import {valid.length} {valid.length === 1 ? "item" : "items"}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {rows ? null : (
          <>
            <p className="text-gray-600">
              Columns: category, name, description, price, tax_type, allergens. Add options and photos
              afterwards, and mark items sold out with the toggle. Up to 1,000 rows and 1 MB.
            </p>
            <Button variant="secondary" onClick={() => downloadText(TEMPLATE_NAME, TEMPLATE_CSV)}>Download template</Button>
          </>
        )}
        <label className={buttonClass(rows ? "secondary" : "primary", "w-full cursor-pointer has-focus-visible:outline-2")}>
          {rows ? "Choose a different file" : "Choose CSV file"}
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <FormError message={error} />

        {rows ? (
          <>
            <p role="status" className="font-semibold text-ink">
              {valid.length} ready to import, {invalid.length} with problems
            </p>
            {duplicates.length > 0 ? (
              <fieldset className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                <legend className="px-1 text-sm font-semibold text-ink">
                  {duplicates.length} {duplicates.length === 1 ? "item is" : "items are"} already on your menu
                </legend>
                <ul className="mt-1 text-sm text-gray-700">
                  {duplicates.slice(0, 5).map((r) => (
                    <li key={r.line}>{r.row?.category}: {r.row?.name}</li>
                  ))}
                  {duplicates.length > 5 ? <li>and {duplicates.length - 5} more</li> : null}
                </ul>
                <div className="mt-2 grid gap-1">
                  {(["skip", "update"] as const).map((option) => (
                    <label key={option} className="flex min-h-11 items-center gap-2 text-sm font-medium text-ink">
                      <input
                        type="radio"
                        name="duplicates"
                        className="size-5 accent-brand-700"
                        checked={mode === option}
                        onChange={() => setMode(option)}
                      />
                      {option === "skip" ? "Skip them" : "Update them"}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <ul className="space-y-2">
              {ordered.slice(0, PREVIEW_LIMIT).map((row) => (
                <RowCard key={row.line} row={row} currency={currency} />
              ))}
            </ul>
            {ordered.length > PREVIEW_LIMIT ? (
              <p className="text-sm text-gray-600">Showing the first {PREVIEW_LIMIT} of {ordered.length} rows.</p>
            ) : null}
          </>
        ) : null}
      </div>
    </Sheet>
  );
}
