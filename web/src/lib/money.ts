// Money is integer cents everywhere. Formatting uses integer arithmetic only (no `/ 100`
// producing a float), so a display can never disagree with the API by a rounding cent.

const SYMBOLS: Record<string, string> = { CAD: "$", USD: "$" };

export function assertCents(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error(`Expected integer cents, got ${value}`);
  return value;
}

export function formatCents(cents: number, currency = "CAD"): string {
  assertCents(cents);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const rem = abs % 100;
  const dollars = (abs - rem) / 100; // exact: abs - rem is a multiple of 100
  const symbol = SYMBOLS[currency] ?? `${currency} `;
  return `${sign}${symbol}${dollars.toLocaleString("en-CA")}.${String(rem).padStart(2, "0")}`;
}

/** "+$0.75" for a modifier delta, "" when it's free. */
export function formatDelta(cents: number, currency = "CAD"): string {
  return cents === 0 ? "" : `+${formatCents(cents, currency)}`;
}

/** Display-only preview for the add button. The cart total always comes from the API. */
export function previewLineCents(basePrice: number, deltas: number[], quantity: number): number {
  const unit = deltas.reduce((sum, d) => sum + assertCents(d), assertCents(basePrice));
  return assertCents(unit * quantity);
}
