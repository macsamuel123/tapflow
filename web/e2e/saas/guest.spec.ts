import { expect, test, type Browser, type Page } from "@playwright/test";
import { logIn, openPage, reachSetupStep, skipFirstItems } from "./helpers";

const TABLE_7 = "d0000b01-0000-4000-8000-000000000007";
const BAR = "d0000b01-0000-4000-8000-000000000101";
const WINDOW = "d0000f01-0000-4000-8000-000000000101";
const qr = (slug: string, id: string, token = "demo") => `/v/${slug}/p/${id}?token=${token}`;
const NOTE = "Demo: your venue lives in this browser until you go live.";

function freshPhone(browser: Browser, baseURL: string | undefined) {
  return browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
}

async function addLager(page: Page) {
  await page.getByRole("button", { name: /^Harbour Lager/ }).click();
  await page.getByLabel(/Pint/).check();
  await page.getByRole("button", { name: /^Add to cart/ }).click();
}

async function openCart(page: Page) {
  await page.getByRole("button", { name: /^View cart/ }).click();
}

test("@saas a Demo Brewery QR in a fresh browser shows the full menu and completes an order", async ({ browser, baseURL }) => {
  const context = await freshPhone(browser, baseURL);
  const page = await context.newPage();
  await page.goto(qr("demo-brewery", TABLE_7));
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);

  await expect(page).toHaveURL(new RegExp(`/demo/v/demo-brewery/p/${TABLE_7}\\?token=demo$`));
  await expect(page.getByRole("heading", { name: "Demo Brewery", level: 1 })).toBeVisible();
  await expect(page.getByText("Table 7")).toBeVisible();
  for (const name of ["On tap", "Bites", "No alcohol"]) {
    await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
  }
  for (const item of ["Harbour Lager", "Cedar IPA", "Tasting flight", "Soft pretzel", "Smash burger", "Crispy wings", "Sparkling lemonade", "Cold brew"]) {
    await expect(page.getByRole("button", { name: new RegExp(`^${item}`) })).toBeEnabled();
  }
  await expect(page.getByRole("button", { name: /^Night Shift Stout/ })).toBeDisabled();
  await expect(page.getByText("Contains: Wheat/gluten (sample data)").first()).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Allergens shown are sample data, not a real allergen claim.");

  await page.getByRole("button", { name: /^Harbour Lager/ }).click();
  const size = page.getByRole("button", { name: /^Add to cart/ });
  await expect(size).toContainText("$8.00");
  await size.click();
  await expect(page.getByText("Choose an option for Size.")).toBeVisible();
  await page.getByLabel(/Pint/).check();
  await expect(size).toContainText("$10.00");
  await size.click();

  await openCart(page);
  await expect(page.getByText("GST 5%")).toBeVisible();
  await expect(page.getByText("PST 10%")).toBeVisible();
  await page.getByRole("button", { name: "Pay $11.50 (demo)" }).click();

  await expect(page).toHaveURL(/\/demo\/v\/demo-brewery\/order\//);
  await expect(page.getByRole("heading", { name: "Bringing it to Table 7" })).toBeVisible();
  await expect(page.getByText("1 x Harbour Lager (Pint)")).toBeVisible();
  await expect(page.locator("[aria-current=step]")).toHaveText("Paid");
  await expect(page.getByText("$11.50")).toBeVisible();
  await context.close();
});

test("@saas a printed demo QR works the same in two browsers", async ({ browser, baseURL }) => {
  for (const name of ["first phone", "second phone"]) {
    const context = await freshPhone(browser, baseURL);
    const page = await context.newPage();
    await page.goto(qr("demo-food-truck", WINDOW));
    await expect(page.getByRole("heading", { name: "Demo Food Truck", level: 1 }), name).toBeVisible();
    await expect(page.getByText("Pickup window")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Birria tacos/ })).toBeEnabled();
    await context.close();
  }
});

test("@saas pickup: first name required, number issued, simulate runs to Picked up", async ({ page }) => {
  await page.goto(qr("demo-brewery", BAR));
  await addLager(page);
  await openCart(page);
  await page.getByRole("button", { name: /^Pay/ }).click();
  await expect(page.getByRole("dialog").getByText("Enter your first name so we can call your order.")).toBeVisible();

  await page.getByLabel("Your first name").fill("Amara");
  await page.getByRole("button", { name: /^Pay/ }).click();
  await expect(page.getByRole("heading", { name: /^#\d+ · Amara$/ })).toBeVisible();

  await page.getByLabel("Simulate staff (demo)").check();
  await expect(page.getByRole("heading", { name: /^Ready — #\d+ · Amara, collect at Bar counter$/ })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("heading", { name: /^Picked up — #\d+ · Amara$/ })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("[aria-current=step]")).toHaveText("Picked up");
});

test("@saas tokens: missing or wrong means browse only, and order is refused", async ({ page }) => {
  await page.goto(`/v/demo-brewery/p/${TABLE_7}`);
  await expect(page.getByText("You're browsing the menu. Scan the QR on your touchpoint to order.")).toBeVisible();
  await addLager(page);
  await openCart(page);
  await expect(page.getByText("Scan the QR at your touchpoint to check out.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pay/ })).toHaveCount(0);

  await page.goto(qr("demo-brewery", TABLE_7, "forged"));
  await expect(page.getByText("This QR code is out of date. Scan the QR on your touchpoint to order.")).toBeVisible();
});

test("@saas Regenerate QR invalidates the old code, even on an open page", async ({ page, context }) => {
  await logIn(page);
  const guest = await context.newPage();
  await guest.goto(qr("demo-brewery", TABLE_7));
  await addLager(guest);
  await expect(guest.getByRole("button", { name: /^View cart/ })).toBeVisible();

  await openPage(page, "Touchpoints", "Touchpoints & QR");
  await page.getByRole("button", { name: "Table 7" }).click();
  await page.getByRole("button", { name: "Regenerate QR" }).click();
  await expect(page.getByText(/New QR for Table 7/)).toBeVisible();
  const url = await page.getByTestId("qr-code").getAttribute("data-url");
  expect(url).toContain("token=demo-r2");

  await expect(guest.getByText("This QR code is out of date.", { exact: false })).toBeVisible({ timeout: 6000 });
  await guest.goto(url!);
  await expect(guest.getByText("out of date", { exact: false })).toHaveCount(0);
  await openCart(guest);
  await expect(guest.getByRole("button", { name: /^Pay/ })).toBeVisible();
});

test("@saas a deactivated touchpoint stops taking orders", async ({ page, context }) => {
  await logIn(page);
  await openPage(page, "Touchpoints", "Touchpoints & QR");
  await page.getByRole("button", { name: "Table 7" }).click();
  await page.getByRole("button", { name: "Deactivate" }).click();
  const guest = await context.newPage();
  await guest.goto(qr("demo-brewery", TABLE_7));
  await expect(guest.getByText("This spot isn't taking orders right now.", { exact: false })).toBeVisible();
});

test("@saas carts reprice from the current menu, and sold-out items block checkout", async ({ page, context }) => {
  await logIn(page);
  const guest = await context.newPage();
  await guest.goto(qr("demo-brewery", TABLE_7));
  await addLager(guest);
  await expect(guest.getByRole("button", { name: /^View cart/ })).toContainText("$11.50");

  await openPage(page, "Menu", "Menu");
  await page.getByRole("button", { name: "Edit Harbour Lager" }).click();
  await page.getByRole("dialog").getByLabel("Price", { exact: true }).fill("9.00");
  await page.getByRole("button", { name: "Save item" }).click();
  // $9 + $2 Pint = $11, GST 55¢ + PST $1.10.
  await expect(guest.getByRole("button", { name: /^View cart/ })).toContainText("$12.65", { timeout: 6000 });

  await page.getByRole("switch", { name: "Harbour Lager sold out" }).click();
  await expect(guest.getByRole("button", { name: /^Harbour Lager/ })).toBeDisabled({ timeout: 6000 });
  await openCart(guest);
  await expect(guest.getByText("Harbour Lager is sold out.", { exact: false })).toBeVisible();
  await expect(guest.getByRole("button", { name: /^Pay/ })).toBeDisabled();
  await guest.getByRole("button", { name: "Remove" }).click();
  await expect(guest.getByRole("button", { name: /^View cart/ })).toHaveCount(0);
});

test("@saas same browser: guest orders reach the dashboard, and staff steps reach the guest", async ({ page, context }) => {
  await logIn(page);
  await openPage(page, "Orders", "Orders");
  const guest = await context.newPage();
  await guest.goto(qr("demo-brewery", TABLE_7));
  await addLager(guest);
  await openCart(guest);
  await guest.getByRole("button", { name: /^Pay/ }).click();
  await expect(guest.getByRole("heading", { name: "Bringing it to Table 7" })).toBeVisible();

  const card = page.getByRole("main").locator("div", { hasText: "1 x Harbour Lager (Pint)" }).last();
  await expect(page.getByText("1 x Harbour Lager (Pint)")).toBeVisible({ timeout: 6000 });
  await page.getByRole("button", { name: "Accept" }).first().click();
  await expect(guest.locator("[aria-current=step]")).toHaveText("Being prepared", { timeout: 6000 });
  await page.getByRole("button", { name: "Mark ready" }).first().click();
  await expect(guest.locator("[aria-current=step]")).toHaveText("On its way", { timeout: 6000 });
  await expect(card).toBeAttached();
});

test("@saas ticket numbers continue from the venue's daily counter", async ({ page }) => {
  await page.goto(qr("demo-brewery", BAR));
  await addLager(page);
  await openCart(page);
  await page.getByLabel("Your first name").fill("Noah");
  await page.getByRole("button", { name: /^Pay/ }).click();
  await expect(page.getByRole("heading", { name: "#16 · Noah" })).toBeVisible();
});

test("@saas a cancelled order tells the guest to see staff", async ({ page, context }) => {
  await logIn(page);
  const guest = await context.newPage();
  await guest.goto(qr("demo-brewery", TABLE_7));
  await addLager(guest);
  await openCart(guest);
  await guest.getByRole("button", { name: /^Pay/ }).click();
  await expect(guest.getByRole("heading", { name: "Bringing it to Table 7" })).toBeVisible();
  await openPage(page, "Orders", "Orders");
  await page.getByRole("button", { name: "Cancel" }).first().click();
  await expect(guest.getByRole("heading", { name: "Order cancelled" })).toBeVisible({ timeout: 6000 });
  await expect(guest.getByText("Please see staff.")).toBeVisible();
});

test("@saas your own venue: notes on the QR screen and guest page, and it stays in this browser", async ({ page, browser, baseURL }) => {
  await reachSetupStep(page, "breweries", "Harbour Taproom");
  await skipFirstItems(page);
  await expect(page.getByRole("note")).toHaveText(NOTE);

  const url = await page.getByTestId("qr-code").first().getAttribute("data-url");
  const path = new URL(url!).pathname + new URL(url!).search;
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Harbour Taproom", level: 1 })).toBeVisible();
  await expect(page.getByText(NOTE)).toBeVisible();

  await page.goto("/dashboard/touchpoints");
  await expect(page.getByText(NOTE)).toBeVisible();

  const other = await freshPhone(browser, baseURL);
  const elsewhere = await other.newPage();
  await elsewhere.goto(path);
  await expect(elsewhere.getByRole("heading", { name: "We can't find this menu" })).toBeVisible();
  await expect(elsewhere.getByText(NOTE)).toBeVisible();
  await other.close();
});

test("@saas demo venues carry no local-venue note", async ({ page }) => {
  await page.goto(qr("demo-brewery", TABLE_7));
  await expect(page.getByRole("heading", { name: "Demo Brewery", level: 1 })).toBeVisible();
  await expect(page.getByText(NOTE)).toHaveCount(0);
});

test("@saas demo touchpoint QR codes use the fixed ids", async ({ page }) => {
  await logIn(page);
  await openPage(page, "Touchpoints", "Touchpoints & QR");
  await page.getByRole("button", { name: "Table 7" }).click();
  const url = await page.getByTestId("qr-code").getAttribute("data-url");
  expect(url).toMatch(new RegExp(`/v/demo-brewery/p/${TABLE_7}\\?token=demo$`));
});

test("@saas the guest flow makes no API or third-party requests", async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const requests: string[] = [];
  page.on("request", (r) => {
    if (!/^(data|blob):/.test(r.url())) requests.push(r.url());
  });
  await page.goto(qr("demo-brewery", BAR));
  await addLager(page);
  await openCart(page);
  await page.getByLabel("Your first name").fill("Amara");
  await page.getByRole("button", { name: /^Pay/ }).click();
  await expect(page.getByRole("heading", { name: /Amara/ })).toBeVisible();

  expect(requests.length).toBeGreaterThan(5);
  expect(requests.filter((u) => new URL(u).origin !== origin)).toEqual([]);
  expect(requests.filter((u) => new URL(u).pathname.startsWith("/api/"))).toEqual([]);
});

test("@saas an unknown order explains itself", async ({ page }) => {
  await page.goto("/demo/v/demo-brewery/order/00000000-0000-4000-8000-000000000000");
  await expect(page.getByText("We can't find this order.", { exact: false })).toBeVisible();
});
