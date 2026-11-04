import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { expectNoSideScroll, fillAccount, fillVenue, openPage, skipFirstItems } from "./helpers";

test("@saas brewery path: landing to every dashboard page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Scan. Order. Serve.").first()).toBeVisible();
  await expectNoSideScroll(page);

  await page.getByRole("link", { name: /Breweries & taprooms/ }).click();
  await expect(page).toHaveURL(/\/signup\?industry=breweries/);
  await expect(page.getByRole("radio", { name: "Breweries & taprooms" })).toBeChecked();
  await page.getByRole("button", { name: "Continue" }).click();

  await fillAccount(page);
  await fillVenue(page, { venueName: "Harbour Taproom" });

  await expect(page.getByLabel("How many?")).toHaveValue("12");
  await expect(page.getByLabel("Spot type")).toHaveValue("table");
  await page.getByRole("group", { name: "Do you also have a pickup counter or window?" })
    .getByText("Yes").click();
  await expect(page.getByLabel("Pickup point name")).toHaveValue("Pickup counter");
  await expect(page.getByRole("status")).toHaveText("You'll get 12 table QR codes + 1 pickup QR code.");
  await expectNoSideScroll(page);
  await skipFirstItems(page);

  await expect(page.getByRole("heading", { name: "Your QR codes are ready" })).toBeVisible();
  await expect(page.getByText("13 codes for Harbour Taproom")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download printable PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("tapflow-qr-codes-harbour-taproom.pdf");
  const pdf = await readFile(await download.path());
  const text = pdf.toString("latin1");
  expect(text.startsWith("%PDF-")).toBe(true);
  expect(text.match(/\/Type \/Page\b/g)).toHaveLength(1); // 13 codes fit on one sheet
  expect(text.match(/\(Scan to order\)/g)).toHaveLength(13);
  expect(text.match(/\(Harbour Taproom\)/g)).toHaveLength(13);
  expect(text).toContain("(Table 1)");
  expect(text).toContain("(Table 12)");
  expect(text).toContain("(Pickup counter)");

  await page.getByRole("link", { name: "Continue to dashboard" }).click();
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  await expect(page.getByRole("note")).toHaveText("Demo mode — sample data");
  await expect(page.getByLabel("Switch demo venue")).toHaveValue("your-venue");

  const pages = [
    ["Orders", "Orders"],
    ["Menu", "Menu"],
    ["Touchpoints", "Touchpoints & QR"],
    ["Staff", "Staff"],
    ["Payments", "Payments"],
    ["Settings", "Settings"],
    ["Overview", "Overview"],
  ] as const;
  for (const [label, heading] of pages) {
    await openPage(page, label, heading);
    await expectNoSideScroll(page);
  }

  await openPage(page, "Touchpoints", "Touchpoints & QR");
  await expect(page.getByRole("button", { name: /^Table \d+/ })).toHaveCount(12);
  await page.getByLabel("Add tables: how many more?").fill("3");
  await page.getByRole("button", { name: "Add tables" }).click();
  await expect(page.getByRole("button", { name: "Table 15" })).toBeVisible();
});
