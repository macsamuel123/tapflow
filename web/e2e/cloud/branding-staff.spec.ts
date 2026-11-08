import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { contrastRatio } from "../../src/lib/brand/contrast";
import { pngFile } from "../saas/menu-helpers";
import { addLager, demoTable, openCart, phone, qr, signUp, TABLE_7, toDashboard, WINDOW } from "./helpers";

const LOCKED = "Too many tries. PIN login is locked for 1 minute.";

function rgbToHex(rgb: string): string {
  const [r, g, b] = rgb.match(/\d+/g)!.map(Number) as [number, number, number];
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

async function openMore(page: Page, label: "Profile" | "Staff") {
  const nav = page.getByRole("navigation", { name: "Dashboard mobile" });
  await nav.getByRole("button", { name: "More" }).click();
  await page.locator("#more-menu").getByRole("link", { name: label }).click();
  await expect(page.getByRole("heading", { name: label, level: 1 })).toBeVisible();
}

/** The table QR the owner would print, as a path on this server. */
async function tableQr(page: Page, label: string): Promise<string> {
  await page.getByRole("navigation", { name: "Dashboard mobile" }).getByRole("link", { name: "Touchpoints", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(`^${label} `) }).click();
  const url = new URL((await page.getByTestId("qr-code").first().getAttribute("data-url"))!);
  return `${url.pathname}${url.search}`;
}

async function venueOf(path: string): Promise<{ id: string; slug: string }> {
  const slug = path.split("/")[2]!;
  const [row] = (await demoTable(`venues?slug=eq.${slug}&select=id,slug`)) as { id: string; slug: string }[];
  return row!;
}

async function enterPin(page: Page, pin: string) {
  for (const digit of pin) await page.getByRole("button", { name: digit, exact: true }).click();
}

function member(page: Page, name: string) {
  return page.getByRole("list", { name: "Team" }).getByRole("listitem").filter({ hasText: name });
}

async function login(request: APIRequestContext, slug: string, pin: string) {
  return request.post("/demo/api/staff/login", { data: { slug, pin } });
}

async function tokenFor(request: APIRequestContext, slug: string, pin: string): Promise<string> {
  const res = await login(request, slug, pin);
  expect(res.status()).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

async function guestOrder(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await addLager(page);
  await openCart(page);
  await page.getByRole("button", { name: /^Pay/ }).click();
  await expect(page.getByRole("heading", { name: /^#\d+/ })).toBeVisible();
}

test("@cloud brand profile: logo, cover and an AA-safe colour reach a guest's phone; saves need the code", async ({ browser, baseURL, request }) => {
  test.setTimeout(120_000);
  const a = await (await phone(browser, baseURL)).newPage();
  const b = await (await phone(browser, baseURL)).newPage();

  await signUp(a, "Brand Bistro");
  await toDashboard(a);
  const path = await tableQr(a, "Table 3");
  await openMore(a, "Profile");
  await a.getByLabel("Logo", { exact: true }).setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: pngFile(600, 600) });
  await expect(a.getByRole("img", { name: "Logo preview" })).toHaveAttribute("src", /\/demo-branding\//);
  await a.getByLabel("Cover photo", { exact: true }).setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: pngFile(1200, 400) });
  await expect(a.getByRole("img", { name: "Cover photo preview" })).toHaveAttribute("src", /\/demo-branding\//);

  await a.getByLabel("Hex colour").fill("#ffe066");
  const warning = a.getByText(/Too light for readable buttons, darkened to #[0-9a-f]{6}/);
  await expect(warning).toBeVisible();
  const darkened = (await warning.textContent())!.match(/#[0-9a-f]{6}/)![0];
  await a.getByRole("button", { name: "Save colour" }).click();
  await expect(a.getByText(`Saved ${darkened}.`)).toBeVisible();

  // B is another phone: no shared storage, so all of this came from the server.
  await b.goto(path);
  await expect(b.getByRole("img", { name: "Brand Bistro logo" })).toHaveAttribute("src", /\/storage\/v1\/object\/public\/demo-branding\//);
  await expect(b.getByRole("img", { name: "Brand Bistro cover" })).toHaveAttribute("src", /\/demo-branding\//);
  await b.getByRole("button", { name: /^Harbour Lager/ }).click();
  await b.getByLabel(/Pint/).check();
  const add = b.getByRole("button", { name: /^Add to cart/ });
  const bg = rgbToHex(await add.evaluate((el) => getComputedStyle(el).backgroundColor));
  const fg = rgbToHex(await add.evaluate((el) => getComputedStyle(el).color));
  expect(bg).toBe(darkened);
  expect(contrastRatio(bg, fg)).toBeGreaterThanOrEqual(4.5);

  // The fixed demos ship with sample branding.
  await b.goto(qr("demo-brewery", TABLE_7));
  await expect(b.getByRole("img", { name: "Demo Brewery logo" })).toHaveAttribute("src", "/demo-brand/brewery-logo.svg");
  await b.goto(qr("demo-food-truck", WINDOW));
  await expect(b.getByRole("img", { name: "Demo Food Truck logo" })).toHaveAttribute("src", "/demo-brand/truck-logo.svg");

  // Saving without the recovery code, or with a wrong one, is refused by the server.
  const { id } = await venueOf(path);
  const missing = await request.post(`/demo/api/venues/${id}/branding`, { data: { color: "#000000" } });
  expect(missing.status()).toBe(403);
  const wrong = await request.post(`/demo/api/venues/${id}/branding`, {
    data: { color: "#000000" },
    headers: { "x-venue-key": "TF-AAAA-BBBB-CCCC-DDDD" },
  });
  expect(wrong.status()).toBe(403);
  const [row] = (await demoTable(`venues?id=eq.${id}&select=branding`)) as { branding: { color: string } }[];
  expect(row!.branding.color).toBe(darkened);
});

test("@cloud staff mode: rename, Cook marks ready, Server delivers, roles enforced on the server, lock", async ({ browser, baseURL, request }) => {
  test.setTimeout(180_000);
  const a = await (await phone(browser, baseURL)).newPage();
  const guest = await (await phone(browser, baseURL)).newPage();
  const device = await (await phone(browser, baseURL)).newPage();

  const code = await signUp(a, "Staff Kitchen");
  await toDashboard(a);
  const path = await tableQr(a, "Table 2");
  const { id, slug } = await venueOf(path);

  // The owner renames Cook to Chef and adds a Chef with a PIN.
  await openMore(a, "Staff");
  await a.getByLabel("Display name for Cook").fill("Chef");
  await a.getByRole("button", { name: "Save name for Cook" }).click();
  await expect(member(a, "Mina Park")).toContainText("Chef");
  await expect(a.getByRole("table", { name: "Permissions" }).getByRole("columnheader", { name: "Chef" })).toBeVisible();
  await a.getByLabel("Role", { exact: true }).selectOption({ label: "Chef" });
  await a.getByLabel("Name", { exact: true }).fill("Sam Ortiz");
  await a.getByLabel("4-digit PIN").fill("1111"); // Mina's sample PIN
  await a.getByRole("button", { name: "Add staff" }).click();
  await expect(a.getByText("That PIN is already in use.")).toBeVisible();
  await a.getByLabel("4-digit PIN").fill("6789");
  await a.getByRole("button", { name: "Add staff" }).click();
  await expect(member(a, "Sam Ortiz")).toContainText("Chef");
  const [stored] = (await demoTable(`staff?venue_id=eq.${id}&name=eq.Sam%20Ortiz&select=pin_hash`)) as { pin_hash: string }[];
  expect(stored!.pin_hash).toMatch(/^[0-9a-f]{64}$/);

  // A guest orders.
  await guestOrder(guest, path);

  // A shared staff device in another context: the Chef sees the order, marks it ready.
  await device.goto(`/staff/${slug}`);
  await expect(device.getByRole("heading", { name: "Staff Kitchen" })).toBeVisible();
  await expect(device.getByText("Chef, Bartender, Server, Runner and Host sign in with their 4-digit PIN.")).toBeVisible();
  await enterPin(device, "6789");
  await expect(device.getByRole("status")).toHaveText("Signed in as Chef");
  await expect(device.getByTestId("staff-header")).toHaveText("Sam Ortiz · Chef");
  await device.getByRole("button", { name: "Accept" }).click();
  await device.getByRole("button", { name: "Mark ready" }).click();
  await expect(device.getByRole("button", { name: "Mark ready" })).toHaveCount(0);
  await expect(device.getByRole("button", { name: "Delivered" })).toHaveCount(0);

  await device.getByRole("button", { name: "Switch user" }).click();
  await expect(device.getByRole("img", { name: /PIN, 0 of 4/ })).toBeVisible();
  await enterPin(device, "3333");
  await expect(device.getByTestId("staff-header")).toHaveText("Ava Chen · Server");
  await expect(device.getByRole("heading", { name: "Ready to deliver" })).toBeVisible();
  await expect(device.getByRole("button", { name: "Mark ready" })).toHaveCount(0);
  await device.getByRole("button", { name: "Delivered" }).click();
  await expect(device.getByRole("button", { name: "Delivered" })).toHaveCount(0);
  const [order] = (await demoTable(`orders?venue_slug=eq.${slug}&select=id,status`)) as { id: string; status: string }[];
  expect(order!.status).toBe("delivered");
  // The owner's dashboard sees it too.
  await a.getByRole("navigation", { name: "Dashboard mobile" }).getByRole("link", { name: "Orders", exact: true }).click();
  await expect(a.getByText("Delivered", { exact: true }).first()).toBeVisible();

  // Calling the endpoints directly: the server checks the role, not the UI.
  await guestOrder(guest, path);
  const fresh = ((await demoTable(`orders?venue_slug=eq.${slug}&status=eq.paid&select=id`)) as { id: string }[])[0]!.id;
  const server = await tokenFor(request, slug, "3333");
  const cook = await tokenFor(request, slug, "6789");
  const status = (orderId: string, value: string, token: string) =>
    request.post(`/demo/api/orders/${orderId}/status`, { data: { status: value }, headers: { "x-staff-token": token } });
  expect((await status(fresh, "accepted", server)).status()).toBe(403);
  expect((await status(fresh, "accepted", cook)).status()).toBe(200);
  expect((await status(fresh, "ready", server)).status()).toBe(403);
  expect((await status(fresh, "ready", cook)).status()).toBe(200);
  expect((await status(fresh, "delivered", cook)).status()).toBe(403);
  const stock = (token: string) =>
    request.post("/demo/api/stock", { data: { slug, itemId: "nope", soldOut: true }, headers: { "x-staff-token": token } });
  expect((await stock(server)).status()).toBe(403);
  expect((await stock(cook)).status()).toBe(404); // allowed, but there's no such item
  expect((await status(fresh, "delivered", "forged.token")).status()).toBe(403);
  expect((await status(fresh, "delivered", server)).status()).toBe(200);

  // Staff management needs the recovery code.
  expect((await request.get(`/demo/api/venues/${id}/staff`)).status()).toBe(403);
  expect((await request.post(`/demo/api/venues/${id}/staff`, { data: { name: "X", role: "host", pin: "4545" } })).status()).toBe(403);
  const owner = { "x-venue-key": code };
  const team = ((await (await request.get(`/demo/api/venues/${id}/staff`, { headers: owner })).json()) as {
    staff: { id: string; name: string }[];
  }).staff;
  const idOf = (name: string) => team.find((s) => s.name === name)!.id;

  // A PIN reset and a deactivation take effect at once.
  const runner = await tokenFor(request, slug, "4444");
  const view = (token: string) => request.get(`/demo/api/staff/view?slug=${slug}&kind=orders`, { headers: { "x-staff-token": token } });
  expect((await view(runner)).status()).toBe(200);
  const reset = await request.patch(`/demo/api/venues/${id}/staff`, { data: { op: "reset_pin", id: idOf("Theo Grant"), pin: "4321" }, headers: owner });
  expect(reset.status()).toBe(200);
  expect((await view(runner)).status()).toBe(403);
  expect((await login(request, slug, "4444")).status()).toBe(401);
  expect((await login(request, slug, "4321")).status()).toBe(200);
  const deactivate = await request.patch(`/demo/api/venues/${id}/staff`, { data: { op: "deactivate", id: idOf("Sam Ortiz") }, headers: owner });
  expect(deactivate.status()).toBe(200);
  expect((await status(fresh, "cancelled", cook)).status()).toBe(403);
  expect((await login(request, slug, "6789")).status()).toBe(401);
  expect((await login(request, slug, "3333")).status()).toBe(200); // clears the wrong-PIN count

  // 5 wrong PINs lock the venue's PIN login, even for the right PIN.
  await device.getByRole("button", { name: "Switch user" }).click();
  for (let i = 0; i < 5; i += 1) await enterPin(device, "9999");
  await expect(device.getByText(LOCKED)).toBeVisible();
  await enterPin(device, "3333");
  await expect(device.getByText(LOCKED)).toBeVisible();
  await expect(device.getByTestId("staff-header")).toHaveCount(0);
  expect((await login(request, slug, "3333")).status()).toBe(423);
});
