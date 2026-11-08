// WCAG 2.x contrast. Pure: used by the Profile page, the guest header and the server.

export const AA_RATIO = 4.5;
const BLACK = "#000000";
const WHITE = "#ffffff";

export function normalizeHex(input: string): string | null {
  const raw = input.trim().toLowerCase().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/.test(raw)) return `#${[...raw].map((c) => c + c).join("")}`;
  return /^[0-9a-f]{6}$/.test(raw) ? `#${raw}` : null;
}

function channels(hex: string): [number, number, number] {
  const value = normalizeHex(hex);
  if (!value) throw new Error(`Not a hex colour: ${hex}`);
  return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as [number, number, number];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export function passesAA(background: string, text: string): boolean {
  return contrastRatio(background, text) >= AA_RATIO;
}

/** Black or white, whichever reads better on the background. */
export function textOn(background: string): string {
  return contrastRatio(background, WHITE) >= contrastRatio(background, BLACK) ? WHITE : BLACK;
}

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  const hue = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const rgb = s === 0 ? [l, l, l] : [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
  return `#${rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** Brand buttons use white text. A colour too light for that is darkened, keeping its hue,
 *  until white text reaches AA. */
export function ensureAA(input: string): { color: string; adjusted: boolean } {
  const start = normalizeHex(input);
  if (!start) throw new Error(`Not a hex colour: ${input}`);
  if (passesAA(start, WHITE)) return { color: start, adjusted: false };
  const [h, s, l] = toHsl(start);
  for (let lightness = l; lightness > 0; lightness -= 0.01) {
    const candidate = fromHsl(h, s, Math.max(0, lightness));
    if (passesAA(candidate, WHITE)) return { color: candidate, adjusted: true };
  }
  return { color: BLACK, adjusted: true };
}
