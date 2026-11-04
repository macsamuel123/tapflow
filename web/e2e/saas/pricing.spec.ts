import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { quote } from "../../src/lib/pricing";

type Case = {
  name: string;
  fee_bps: number;
  tip?: number;
  lines: [number, string[]][];
  subtotal: number;
  tax: number;
  fee: number;
  total: number;
  tax_lines: [string, number, number][];
};

// The same file runs against api/app/domain/pricing.py in test_pricing_shared.py.
const data = JSON.parse(readFileSync(join(process.cwd(), "../testdata/pricing-cases.json"), "utf8")) as {
  taxes: Record<string, { name: string; rate_bps: number }>;
  cases: Case[];
};

for (const c of data.cases) {
  test(`@saas shared pricing: ${c.name}`, () => {
    const lines = c.lines.map(([amountCents, codes]) => ({
      amountCents,
      taxes: codes.map((code) => ({ code, name: data.taxes[code]!.name, rateBps: data.taxes[code]!.rate_bps })),
    }));
    const q = quote(lines, c.fee_bps, c.tip ?? 0);
    expect([q.subtotalCents, q.taxCents, q.platformFeeCents, q.totalCents]).toEqual([c.subtotal, c.tax, c.fee, c.total]);
    expect(q.taxLines.map((t) => [t.code, t.baseCents, t.taxCents])).toEqual(c.tax_lines);
  });
}
