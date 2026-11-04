import { expect, test } from "@playwright/test";
import { reachSetupStep } from "./helpers";

test("@saas setup blocks continue when neither tables nor pickup is chosen", async ({ page }) => {
  await reachSetupStep(page, "breweries", "Harbour Taproom");
  await page.getByRole("group", { name: "Do guests sit at tables or spots?" }).getByText("No").click();
  await page.getByRole("button", { name: "Create my QR codes" }).click();

  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Choose at least one: tables or spots, or a pickup point.");
  await expect(page.getByRole("heading", { name: "How do guests get their order?" })).toBeVisible();
  await expect(page).not.toHaveURL(/ready/);
});

for (const bad of ["0", "501", "-3", "12.5", "abc", ""]) {
  test(`@saas setup rejects a table count of "${bad}"`, async ({ page }) => {
    await reachSetupStep(page, "breweries", "Harbour Taproom");
    await page.getByLabel("How many?").fill(bad);
    await page.getByRole("button", { name: "Create my QR codes" }).click();

    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Enter a whole number from 1 to 500.");
    await expect(page).not.toHaveURL(/ready/);
  });
}

for (const good of ["1", "500"]) {
  test(`@saas setup accepts a table count of ${good}`, async ({ page }) => {
    await reachSetupStep(page, "breweries", "Harbour Taproom");
    await page.getByLabel("How many?").fill(good);
    await page.getByRole("button", { name: "Create my QR codes" }).click();
    await expect(page.getByRole("heading", { name: "Your QR codes are ready" })).toBeVisible();
  });
}

test("@saas account step rejects bad details and mismatched passwords", async ({ page }) => {
  await page.goto("/signup?industry=breweries");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Your name").fill("Riley");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByLabel("Confirm password").fill("different");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
  await expect(page.getByText("Passwords don't match.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
});

test("@saas industry defaults: seats for stadiums, loungers, carts, pickup for food halls", async ({ page }) => {
  const cases = [
    ["stadiums", "seat", "You'll get 12 seat QR codes."],
    ["resorts", "lounger", "You'll get 12 lounger QR codes."],
    ["golf", "cart", "You'll get 12 cart QR codes."],
  ] as const;
  for (const [industry, type, preview] of cases) {
    await reachSetupStep(page, industry, "Test Venue");
    await expect(page.getByLabel("Spot type")).toHaveValue(type);
    await expect(page.getByRole("status")).toHaveText(preview);
    await page.evaluate(() => window.sessionStorage.clear());
  }
  await reachSetupStep(page, "food-halls", "Test Venue");
  await expect(page.getByRole("status")).toHaveText("You'll get 1 pickup QR code.");
});

test("@saas /dashboard without a mock session goes to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});

test("@saas passwords never reach browser storage", async ({ page }) => {
  await reachSetupStep(page, "breweries", "Harbour Taproom");
  await page.getByRole("button", { name: "Create my QR codes" }).click();
  await expect(page.getByRole("heading", { name: "Your QR codes are ready" })).toBeVisible();
  const stored = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));
  expect(stored).toContain("Harbour Taproom");
  expect(stored).not.toContain("correct-horse");
});
