import { expect, test } from "@playwright/test";
import { contrastRatio } from "../../src/lib/brand/contrast";
import { expectNoSideScroll, logIn, openPage } from "./helpers";
import { pngFile } from "./menu-helpers";

function rgbToHex(rgb: string): string {
  const [r, g, b] = rgb.match(/\d+/g)!.map(Number) as [number, number, number];
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

test("@saas profile: uploads, colour warning with auto-darkening, live preview and the guest page", async ({ page, context }) => {
  await logIn(page);
  await openPage(page, "Profile", "Profile");
  const preview = page.getByTestId("brand-preview");
  // Demo Brewery ships with sample branding.
  await expect(preview.getByRole("img", { name: "Demo Brewery logo" })).toBeVisible();
  await expect(preview.getByRole("img", { name: "Demo Brewery cover" })).toBeVisible();

  // Same limits as menu photos.
  await page.getByLabel("Logo", { exact: true }).setInputFiles({ name: "x.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF") });
  await expect(page.getByText("Use a JPG, PNG or WebP photo.")).toBeVisible();
  await page.getByLabel("Logo", { exact: true }).setInputFiles({ name: "big.png", mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(page.getByText("That photo is over the 5 MB limit.")).toBeVisible();
  await page.getByLabel("Logo", { exact: true }).setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: pngFile(600, 600) });
  await expect(page.getByRole("img", { name: "Logo preview" })).toBeVisible();
  await page.getByLabel("Cover photo", { exact: true }).setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: pngFile(1200, 400) });
  await expect(page.getByRole("img", { name: "Cover photo preview" })).toBeVisible();
  await expect(preview.getByRole("img", { name: "Demo Brewery logo" })).toHaveAttribute("src", /^blob:/);

  // Too light: a warning, and the preview uses the darkened colour.
  await page.getByLabel("Hex colour").fill("#ffe066");
  const warning = page.getByText(/Too light for readable buttons, darkened to #[0-9a-f]{6}/);
  await expect(warning).toBeVisible();
  const darkened = (await warning.textContent())!.match(/#[0-9a-f]{6}/)![0];
  const button = preview.getByText("View cart · 1 item");
  const bg = rgbToHex(await button.evaluate((el) => getComputedStyle(el).backgroundColor));
  const fg = rgbToHex(await button.evaluate((el) => getComputedStyle(el).color));
  expect(bg).toBe(darkened);
  expect(contrastRatio(bg, fg)).toBeGreaterThanOrEqual(4.5);

  // A colour that passes is used as it is.
  await page.getByLabel("Hex colour").fill("#1d4ed8");
  await expect(warning).toHaveCount(0);
  expect(rgbToHex(await button.evaluate((el) => getComputedStyle(el).backgroundColor))).toBe("#1d4ed8");
  await page.getByRole("button", { name: "Save colour" }).click();
  await expect(page.getByText("Saved #1d4ed8.")).toBeVisible();
  await expectNoSideScroll(page);

  // The guest page in another tab shows the same branding.
  const guest = await context.newPage();
  await guest.goto("/demo/v/demo-brewery/p/d0000b01-0000-4000-8000-000000000001?token=demo");
  await expect(guest.getByRole("img", { name: "Demo Brewery logo" })).toBeVisible();
  await expect(guest.getByRole("img", { name: "Demo Brewery cover" })).toBeVisible();
  await guest.getByRole("button", { name: /Harbour Lager/ }).click();
  const add = guest.getByRole("button", { name: /^Add to cart/ });
  const addBg = rgbToHex(await add.evaluate((el) => getComputedStyle(el).backgroundColor));
  const addFg = rgbToHex(await add.evaluate((el) => getComputedStyle(el).color));
  expect(addBg).toBe("#1d4ed8");
  expect(contrastRatio(addBg, addFg)).toBeGreaterThanOrEqual(4.5);
});

test("@saas profile: the Demo Food Truck guest page shows its sample branding", async ({ page }) => {
  await page.goto("/demo/v/demo-food-truck/p/d0000f01-0000-4000-8000-000000000101?token=demo");
  await expect(page.getByRole("img", { name: "Demo Food Truck logo" })).toHaveAttribute("src", "/demo-brand/truck-logo.svg");
  await expect(page.getByRole("img", { name: "Demo Food Truck cover" })).toBeVisible();
});
