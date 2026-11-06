import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const SECRET = "local-test-secret";
export const TABLE_7 = "d0000b01-0000-4000-8000-000000000007";
export const WINDOW = "d0000f01-0000-4000-8000-000000000101";
export const qr = (slug: string, id: string) => `/v/${slug}/p/${id}?token=demo`;

/** Random, because rate limits outlive a test run: some are per day. */
export function nextIp(): string {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  return `10.${octet()}.${octet()}.${octet()}`;
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
  await page.getByLabel("Switch demo venue").selectOption("demo-brewery");
  if (venue !== "demo-brewery") await page.getByLabel("Switch demo venue").selectOption(venue);
  await expect(page.getByTestId("connection")).toHaveText("Live");
}

export async function goTo(page: Page, label: "Orders" | "Menu" | "Touchpoints") {
  await page.getByRole("navigation", { name: "Dashboard mobile" }).getByRole("link", { name: label, exact: true }).click();
}

export const RECOVERY_CODE = /^TF(-[A-Z2-9]{4}){4}$/;

/** Sign-up through to the QR-ready screen. Returns the recovery code. */
export async function signUp(page: Page, venueName: string, spots = "12"): Promise<string> {
  await page.goto("/signup?industry=breweries");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Your name").fill("Riley");
  await page.getByLabel("Email").fill("riley@example.test");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse");
  await page.getByLabel("Confirm password").fill("correct-horse");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Venue name").fill(venueName);
  await page.getByLabel("Province or territory").selectOption("British Columbia");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("How many?").fill(spots);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByRole("heading", { name: "Your QR codes are ready" })).toBeVisible();
  const code = await page.getByTestId("recovery-code").innerText();
  expect(code).toMatch(RECOVERY_CODE);
  return code;
}

export async function toDashboard(page: Page) {
  await page.getByRole("link", { name: "Continue to dashboard" }).click();
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  await expect(page.getByTestId("connection")).toHaveText("Live");
}

export async function clearSample(page: Page) {
  await page.getByRole("button", { name: "Clear sample menu" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Clear menu" }).click();
  await expect(page.getByText("No items yet.", { exact: false })).toBeVisible();
}

export async function importCsv(page: Page, text: string, count: number) {
  await page.getByRole("button", { name: "Upload CSV" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Choose CSV file").setInputFiles({ name: "menu.csv", mimeType: "text/csv", buffer: Buffer.from(text) });
  await dialog.getByRole("button", { name: `Import ${count} ${count === 1 ? "item" : "items"}`, exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText(`Imported ${count}`);
  await dialog.getByRole("button", { name: "Done" }).click();
}

const adminHeaders = () => ({
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
  "Accept-Profile": "demo",
  "Content-Profile": "demo",
  "Content-Type": "application/json",
});

/** Reads or changes demo tables as the server would. For test setup only. */
export async function demoTable(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...adminHeaders(), Prefer: "return=representation" },
  });
  return res.json();
}

export async function publicRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, authorization: `Bearer ${key}`, "Accept-Profile": "demo", "Content-Profile": "demo", "Content-Type": "application/json" },
  });
}

export async function addLager(page: Page) {
  await page.getByRole("button", { name: /^Harbour Lager/ }).click();
  await page.getByLabel(/Pint/).check();
  await page.getByRole("button", { name: /^Add to cart/ }).click();
}

export async function openCart(page: Page) {
  await page.getByRole("button", { name: /^View cart/ }).click();
}
