import { expect, test } from "@playwright/test";
import { expectNoSideScroll, fillAccount, fillVenue, openPage, reachSetupStep } from "./helpers";
import { pngFile } from "./menu-helpers";

const SPOTS = "Do guests sit at tables or spots?";
const PICKUP = "Do you also have a pickup counter or window?";

test("@saas onboarding Other: venue type, unanswered setup, per-item entry with photos, no CSV until the Menu page", async ({ page }) => {
  await page.goto("/signup");
  await page.getByText("Other", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Tell us what kind of venue it is.")).toBeVisible();
  await expect(page.getByText("Step 1 of 5")).toBeVisible();
  await page.getByLabel("Venue type").fill("Bowling alley");
  await page.getByRole("button", { name: "Continue" }).click();

  await fillAccount(page);
  await fillVenue(page, { venueName: "Lucky Lanes" });
  await expect(page.getByRole("heading", { name: "How do guests get their order?" })).toBeVisible();

  // No defaults for Other: neither question has an answer, and Continue is blocked.
  for (const legend of [SPOTS, PICKUP]) {
    await expect(page.getByRole("group", { name: legend }).getByRole("radio", { checked: true })).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Choose yes or no for both questions.")).toBeVisible();
  await page.getByRole("group", { name: SPOTS }).getByText("Yes").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Choose yes or no for both questions.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "How do guests get their order?" })).toBeVisible();
  await page.getByRole("group", { name: PICKUP }).getByText("No").click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Add your first items" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload CSV" })).toHaveCount(0);
  await expect(page.getByLabel("Choose CSV file")).toHaveCount(0);

  await page.getByLabel("Item 1 name").fill("Lane fries");
  await page.getByLabel("Item 1 description").fill("Crispy, with house dip.");
  await page.getByLabel("Item 1 price").fill("7.50");
  await page.getByLabel("Item 1 category").fill("Snacks");
  await page.getByRole("group", { name: "Item 1 allergens" }).getByLabel("No listed allergens").check();
  await page.getByLabel("Item 1 photo").setInputFiles({ name: "fries.png", mimeType: "image/png", buffer: pngFile(60, 40) });
  await expect(page.getByRole("img", { name: "Item 1 photo preview" })).toBeVisible();

  await page.getByRole("button", { name: "Add another item" }).click();
  await page.getByLabel("Item 2 name").fill("Strike lager");
  await page.getByLabel("Item 2 description").fill("Our pale lager, 4.8%.");
  await page.getByLabel("Item 2 price").fill("8.00");
  await page.getByLabel("Item 2 tax type").selectOption("Alcohol");
  await page.getByLabel("Item 2 category").fill("Drinks");
  await page.getByRole("group", { name: "Item 2 allergens" }).getByLabel("Wheat/gluten").check();
  await page.getByLabel("Item 2 photo").setInputFiles({ name: "beer.png", mimeType: "image/png", buffer: pngFile(40, 60) });
  await expect(page.getByRole("img", { name: "Item 2 photo preview" })).toBeVisible();

  // The same file checks as the Menu page.
  await page.getByLabel("Item 2 photo").setInputFiles({ name: "menu.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF") });
  await expect(page.getByText("Use a JPG, PNG or WebP photo.")).toBeVisible();
  await expectNoSideScroll(page);

  await page.getByRole("button", { name: "Create my QR codes" }).click();
  await page.getByRole("link", { name: "Continue to dashboard" }).click();
  await openPage(page, "Menu", "Menu");
  await expect(page.getByRole("button", { name: "Upload CSV" })).toBeVisible();
  await expect(page.getByTestId("item-photo")).toHaveCount(2);
  await expect(page.getByText("Crispy, with house dip.")).toBeVisible();
  await expect(page.getByText("Our pale lager, 4.8%.")).toBeVisible();
});

test("@saas onboarding: a listed industry still pre-fills its setup answers", async ({ page }) => {
  await reachSetupStep(page, "food-trucks", "Taco Window");
  await expect(page.getByRole("group", { name: SPOTS }).getByRole("radio", { name: "No" })).toBeChecked();
  await expect(page.getByRole("group", { name: PICKUP }).getByRole("radio", { name: "Yes" })).toBeChecked();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Add your first items" })).toBeVisible();
});
