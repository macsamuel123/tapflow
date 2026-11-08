import { expect, test } from "@playwright/test";
import { AA_RATIO, contrastRatio, ensureAA, normalizeHex, passesAA, relativeLuminance, textOn } from "../../src/lib/brand/contrast";

// Pure helper checks: no browser. The repo's TS unit tests run this way (see pricing.spec.ts).

test("@saas contrast: WCAG luminance and ratios match known values", () => {
  expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  expect(relativeLuminance("#000000")).toBe(0);
  expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5); // order doesn't matter
  expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  expect(passesAA("#777777", "#ffffff")).toBe(false);
  expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThanOrEqual(AA_RATIO);
  expect(normalizeHex("#ABC")).toBe("#aabbcc");
  expect(normalizeHex("12345")).toBeNull();
});

test("@saas contrast: textOn picks whichever of black or white reads better", () => {
  expect(textOn("#000000")).toBe("#ffffff");
  expect(textOn("#ffffff")).toBe("#000000");
  expect(textOn("#ffe066")).toBe("#000000");
  expect(textOn("#1d4ed8")).toBe("#ffffff");
  for (const bg of ["#ffe066", "#1d4ed8", "#777777", "#0a6657", "#f97316"]) {
    const best = textOn(bg);
    const other = best === "#ffffff" ? "#000000" : "#ffffff";
    expect(contrastRatio(bg, best)).toBeGreaterThanOrEqual(contrastRatio(bg, other));
  }
});

test("@saas contrast: ensureAA darkens a too-light colour until white text passes AA", () => {
  const light = ensureAA("#ffe066");
  expect(light.adjusted).toBe(true);
  expect(light.color).not.toBe("#ffe066");
  expect(contrastRatio(light.color, "#ffffff")).toBeGreaterThanOrEqual(AA_RATIO);
  expect(contrastRatio(light.color, textOn(light.color))).toBeGreaterThanOrEqual(AA_RATIO);

  expect(ensureAA("#1d4ed8")).toEqual({ color: "#1d4ed8", adjusted: false });
  expect(ensureAA("#777777").adjusted).toBe(true);

  for (const input of ["#ffffff", "#ffff00", "#00ffff", "#ff99cc", "#cccccc", "#22c55e", "#000000", "#8a4b0f", "#b42318"]) {
    const { color } = ensureAA(input);
    expect(contrastRatio(color, "#ffffff"), input).toBeGreaterThanOrEqual(AA_RATIO);
  }
});
