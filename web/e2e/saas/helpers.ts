import { expect, type Page } from "@playwright/test";

export type Account = { venueName: string; region?: string };

export const PASSWORD = "correct-horse";

export async function fillAccount(page: Page, name = "Riley Chen", email = "riley@example.test") {
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
}

export async function fillVenue(page: Page, { venueName, region = "British Columbia" }: Account) {
  await page.getByLabel("Venue name").fill(venueName);
  await page.getByLabel("Province or territory").selectOption(region);
  await page.getByRole("button", { name: "Continue" }).click();
}

export async function reachSetupStep(page: Page, industry: string, venueName: string) {
  await page.goto(`/signup?industry=${industry}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await fillAccount(page);
  await fillVenue(page, { venueName });
  await expect(page.getByRole("heading", { name: "How do guests get their order?" })).toBeVisible();
}

export async function skipFirstItems(page: Page) {
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Add your first items" })).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
}

export async function logIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("tester@example.test");
  await page.getByLabel("Password").fill("anything");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
}

/** Follows a bottom-nav link, opening the More menu first when the page lives there. */
export async function openPage(page: Page, label: string, heading: string) {
  const nav = page.getByRole("navigation", { name: "Dashboard mobile" });
  if (["Profile", "Staff", "Payments", "Settings"].includes(label)) {
    await nav.getByRole("button", { name: "More" }).click();
    await page.locator("#more-menu").getByRole("link", { name: label }).click();
  } else {
    await nav.getByRole("link", { name: label, exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  await expect(page.getByRole("note")).toHaveText("Demo mode — sample data");
}

export async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page must not scroll sideways at 390px").toBeLessThanOrEqual(0);
}
