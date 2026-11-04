/** 500 bps → "5%", 1250 → "12.5%": string formatting of an integer, no float math. */
export function formatBps(bps: number): string {
  const whole = (bps - (bps % 100)) / 100;
  const fraction = String(bps % 100).padStart(2, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}%`;
}
