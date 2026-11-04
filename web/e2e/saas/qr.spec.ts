import { expect, test } from "@playwright/test";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { reachSetupStep } from "./helpers";

test("@saas a generated QR decodes to the real link format", async ({ page }) => {
  await reachSetupStep(page, "breweries", "Harbour Taproom");
  await page.getByRole("button", { name: "Create my QR codes" }).click();

  const qr = page.getByTestId("qr-code").first();
  await expect(qr).toBeVisible();
  const png = PNG.sync.read(await qr.screenshot());
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);

  expect(decoded?.data).toBeTruthy();
  expect(decoded?.data).toMatch(
    /^http:\/\/127\.0\.0\.1:3100\/v\/harbour-taproom\/p\/[0-9a-f-]{36}\?token=demo$/,
  );
  expect(decoded?.data).toBe(await qr.getAttribute("data-url"));
});

test("@saas 500 codes run onto extra pages", async ({ page }) => {
  await reachSetupStep(page, "breweries", "Harbour Taproom");
  await page.getByLabel("How many?").fill("500");
  await page.getByRole("button", { name: "Create my QR codes" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download printable PDF" }).click();
  const { readFile } = await import("node:fs/promises");
  const pdf = await readFile(await (await downloadPromise).path());
  expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(34);
});
