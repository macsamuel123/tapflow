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

const MAX_IMPORT_CENTS = 100_000_000;

/** A forgiving price for imports: "\$1,200.50", "12 .50", "1 200" and "12,50" all read. Null means
 *  negative or unreadable. Forms stay strict, with parseDollars. */
export function parseImportPrice(raw: string): number | null {
  const text = raw.replace(/[\s\u00a0$]/g, "");
  let plain: string;
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(text)) plain = text.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(text)) plain = text.replace(",", ".");
  else plain = text;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(plain);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents <= MAX_IMPORT_CENTS ? cents : null;
}

/** 1250 → "12.50", for prefilling a price field. */
export function centsToInput(cents: number): string {
  const rem = cents % 100;
  return `${(cents - rem) / 100}.${String(rem).padStart(2, "0")}`;
}
