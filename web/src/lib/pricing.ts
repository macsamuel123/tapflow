// The TypeScript twin of api/app/domain/pricing.py. Integer cents only. Both pass the cases in
// testdata/pricing-cases.json. Used for demo mode: with a real API, every amount comes from it.
import { assertCents } from "./money";

export type PricingTax = { code: string; name: string; rateBps: number };
export type PricingLine = { amountCents: number; taxes: readonly PricingTax[] };
export type TaxLine = PricingTax & { baseCents: number; taxCents: number };

export type Quote = {
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  platformFeeCents: number;
  totalCents: number;
  taxLines: TaxLine[];
};

const BPS = 10_000;

export function applyBpsHalfUp(cents: number, bps: number): number {
  const scaled = cents * bps + BPS / 2;
  return (scaled - (scaled % BPS)) / BPS;
}

export function quote(lines: readonly PricingLine[], platformFeeBps: number, tipCents = 0): Quote {
  let subtotalCents = 0;
  const bases = new Map<string, { tax: PricingTax; base: number }>();
  for (const line of lines) {
    subtotalCents += assertCents(line.amountCents);
    for (const tax of line.taxes) {
      const entry = bases.get(tax.code) ?? { tax, base: 0 };
      entry.base += line.amountCents;
      bases.set(tax.code, entry);
    }
  }
  // Sorted by code so cart order can't change it. Taxes with no taxable amount are left out.
  const taxLines = [...bases.values()]
    .filter(({ base }) => base > 0)
    .sort((a, b) => (a.tax.code < b.tax.code ? -1 : 1))
    .map(({ tax, base }) => ({ ...tax, baseCents: base, taxCents: applyBpsHalfUp(base, tax.rateBps) }));
  const taxCents = taxLines.reduce((sum, t) => sum + t.taxCents, 0);
  return {
    subtotalCents,
    taxCents,
    tipCents,
    platformFeeCents: applyBpsHalfUp(subtotalCents, platformFeeBps),
    totalCents: subtotalCents + taxCents + tipCents,
    taxLines,
  };
}
