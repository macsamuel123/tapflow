import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const SECRET = "local-test-secret";
export const TABLE_7 = "d0000b01-0000-4000-8000-000000000007";
export const WINDOW = "d0000f01-0000-4000-8000-000000000101";
export const qr = (slug: string, id: string) => `/v/${slug}/p/${id}?token=demo`;

let ipCounter = 0;
export function nextIp(): string {
  ipCounter += 1;
  return `10.${process.pid % 250}.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

/** A separate phone: no shared storage, and its own IP for the rate limits. */
export async function phone(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const ip = nextIp();
  await context.route("**/demo/api/**", (route) =>
    route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": ip } }),
  );
  return context;
}

export async function openDashboard(page: Page, venue: "demo-brewery" | "demo-food-truck" = "demo-brewery") {
  await page.goto("/login");
  await page.getByLabel("Email").fill("staff@example.test");
  await page.getByLabel("Password").fill("anything");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  if (venue !== "demo-brewery") await page.getByLabel("Switch demo venue").selectOption(venue);
  await expect(page.getByTestId("connection")).toHaveText("Live");
}

export async function goTo(page: Page, label: "Orders" | "Menu" | "Touchpoints") {
  await page.getByRole("navigation", { name: "Dashboard mobile" }).getByRole("link", { name: label, exact: true }).click();
}

export async function addLager(page: Page) {
  await page.getByRole("button", { name: /^Harbour Lager/ }).click();
  await page.getByLabel(/Pint/).check();
  await page.getByRole("button", { name: /^Add to cart/ }).click();
}

export async function openCart(page: Page) {
  await page.getByRole("button", { name: /^View cart/ }).click();
}
