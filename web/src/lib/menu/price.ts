export const MAX_PRICE_CENTS = 1_000_000;

/** "12.50" → 1250. Works on the text, so no float ever touches a price. Null when invalid. */
export function parseDollars(raw: string): number | null {
  const match = /^(\d{1,5})(?:\.(\d{1,2}))?$/.exec(raw.trim());
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const cents = whole * 100 + fraction;
  return cents <= MAX_PRICE_CENTS ? cents : null;
}

/** 1250 → "12.50", for prefilling a price field. */
export function centsToInput(cents: number): string {
  const rem = cents % 100;
  return `${(cents - rem) / 100}.${String(rem).padStart(2, "0")}`;
}
