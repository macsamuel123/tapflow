import { expect, test } from "@playwright/test";
import { addLager, goTo, openCart, openDashboard, phone, qr, SECRET, TABLE_7, WINDOW, nextIp } from "./helpers";

test.beforeEach(async ({ request }) => {
  const res = await request.post("/demo/api/clear", { data: { secret: SECRET }, headers: { "x-forwarded-for": nextIp() } });
  expect(res.ok()).toBe(true);
});

test("@cloud Demo Brewery Table 7: guest to dashboard and back, across two devices", async ({ browser, baseURL }) => {
  const staffContext = await phone(browser, baseURL);
  const guestContext = await phone(browser, baseURL);
  const staff = await staffContext.newPage();
  const guest = await guestContext.newPage();

  await openDashboard(staff);
  await goTo(staff, "Orders");
  await expect(staff.getByText("No orders yet.", { exact: false })).toBeVisible();
  await expect(staff.getByTestId("shared-note")).toHaveText("Shared demo — other testers may see these orders");

  await guest.goto(qr("demo-brewery", TABLE_7));
  await addLager(guest);
  await openCart(guest);
  await expect(guest.getByText("Demo — don't enter real personal information.")).toBeVisible();
  await guest.getByRole("button", { name: "Pay $11.50 (demo)" }).click();
  await expect(guest.getByRole("heading", { name: "Bringing it to Table 7" })).toBeVisible();

  await expect(staff.getByText("1 x Harbour Lager (Pint)")).toBeVisible({ timeout: 3000 });
  await expect(staff.getByText("$11.50")).toBeVisible();
  await expect(staff.getByText(/Deliver to Table 7/)).toBeVisible();

  const step = guest.locator("[aria-current=step]");
  await staff.getByRole("button", { name: "Accept" }).click();
  await expect(step).toHaveText("Being prepared", { timeout: 3000 });
  await staff.getByRole("button", { name: "Mark ready" }).click();
  await expect(step).toHaveText("On its way", { timeout: 3000 });
  await staff.getByRole("button", { name: "Delivered" }).click();
  await expect(guest.getByRole("heading", { name: "Delivered to Table 7" })).toBeVisible({ timeout: 3000 });
});

test("@cloud Demo Food Truck pickup: name and number across two devices", async ({ browser, baseURL }) => {
  const staffContext = await phone(browser, baseURL);
  const guestContext = await phone(browser, baseURL);
  const staff = await staffContext.newPage();
  const guest = await guestContext.newPage();

  await openDashboard(staff, "demo-food-truck");
  await goTo(staff, "Orders");
  await guest.goto(qr("demo-food-truck", WINDOW));
  await guest.getByRole("button", { name: /^Horchata/ }).click();
  await guest.getByRole("button", { name: /^Add to cart/ }).click();
  await openCart(guest);
  await guest.getByLabel("Your first name").fill("  Am<a>ra  ");
  await guest.getByRole("button", { name: /^Pay/ }).click();
  await expect(guest.getByRole("heading", { name: /^#\d+ · Amara$/ })).toBeVisible();

  await expect(staff.getByText(/^#\d+ · Amara$/)).toBeVisible({ timeout: 3000 });
  await staff.getByRole("button", { name: "Accept" }).click();
  await staff.getByRole("button", { name: "Mark ready" }).click();
  await expect(guest.getByRole("heading", { name: /^Ready — #\d+ · Amara, collect at Pickup window$/ })).toBeVisible({ timeout: 3000 });
  await expect(staff.getByText(/^Ready — #\d+ · Amara, collect at Pickup window$/)).toBeVisible();
  await staff.getByRole("button", { name: "Picked up" }).click();
  await expect(guest.getByRole("heading", { name: /^Picked up — #\d+ · Amara$/ })).toBeVisible({ timeout: 3000 });
});

test("@cloud sold-out on the dashboard reaches a guest phone live, and the server refuses it", async ({ browser, baseURL }) => {
  const staffContext = await phone(browser, baseURL);
  const guestContext = await phone(browser, baseURL);
  const staff = await staffContext.newPage();
  const guest = await guestContext.newPage();
  await openDashboard(staff);
  await goTo(staff, "Menu");

  await guest.goto(qr("demo-brewery", TABLE_7));
  await addLager(guest);
  await expect(guest.getByRole("button", { name: /^Harbour Lager/ })).toBeEnabled();

  await staff.getByRole("switch", { name: "Harbour Lager sold out" }).click();
  await expect(guest.getByRole("button", { name: /^Harbour Lager/ })).toBeDisabled({ timeout: 3000 });
  await openCart(guest);
  await expect(guest.getByText("Harbour Lager is sold out.", { exact: false })).toBeVisible();
  await expect(guest.getByRole("button", { name: /^Pay/ })).toBeDisabled();

  await staff.getByRole("switch", { name: "Harbour Lager sold out" }).click();
  await expect(guest.getByRole("button", { name: /^Pay/ })).toBeEnabled({ timeout: 3000 });
  await expect(guest.getByText("Harbour Lager is sold out.", { exact: false })).toHaveCount(0);
});

test("@cloud with Realtime off, polling delivers the order and the badge says Polling", async ({ browser, baseURL }) => {
  const staffContext = await phone(browser, baseURL);
  await staffContext.routeWebSocket(/\/realtime\//, (socket) => socket.close());
  const guestContext = await phone(browser, baseURL);
  const staff = await staffContext.newPage();
  const guest = await guestContext.newPage();

  await staff.goto("/login");
  await staff.getByLabel("Email").fill("staff@example.test");
  await staff.getByLabel("Password").fill("anything");
  await staff.getByRole("button", { name: "Log in" }).click();
  await expect(staff.getByTestId("connection")).toHaveText("Polling");
  await goTo(staff, "Orders");

  await guest.goto(qr("demo-brewery", TABLE_7));
  await addLager(guest);
  await openCart(guest);
  await guest.getByRole("button", { name: /^Pay/ }).click();
  await expect(guest.getByRole("heading", { name: "Bringing it to Table 7" })).toBeVisible();

  await expect(staff.getByText("1 x Harbour Lager (Pint)")).toBeVisible({ timeout: 7000 });
  await expect(staff.getByTestId("connection")).toHaveText("Polling");

  await staff.route("**/rest/v1/**", (route) => route.abort());
  await expect(staff.getByTestId("connection")).toHaveText("Offline", { timeout: 10_000 });
  await staff.unroute("**/rest/v1/**");
  await expect(staff.getByTestId("connection")).toHaveText("Polling", { timeout: 10_000 });
});

test("@cloud demo venues are read-only, and your own venue is not", async ({ browser, baseURL }) => {
  const context = await phone(browser, baseURL);
  const page = await context.newPage();
  await openDashboard(page);

  await goTo(page, "Menu");
  await expect(page.getByRole("link", { name: "Sign up to edit your own venue" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add item" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Edit Harbour Lager" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete On tap" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clear sample menu" })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Harbour Lager sold out" })).toBeVisible();

  await goTo(page, "Touchpoints");
  await expect(page.getByRole("link", { name: "Sign up to edit your own venue" })).toBeVisible();
  await page.getByRole("button", { name: "Table 7" }).click();
  await expect(page.getByTestId("qr-code")).toBeVisible();
  await expect(page.getByRole("button", { name: "Regenerate QR" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Deactivate" })).toBeHidden();

  await page.goto("/signup?industry=breweries");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Your name").fill("Riley");
  await page.getByLabel("Email").fill("riley@example.test");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse");
  await page.getByLabel("Confirm password").fill("correct-horse");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Venue name").fill("Harbour Taproom");
  await page.getByLabel("Province or territory").selectOption("British Columbia");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("link", { name: "Continue to dashboard" }).click();
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  await expect(page.getByTestId("connection")).toHaveCount(0);
  await goTo(page, "Menu");
  await expect(page.getByRole("button", { name: "Add item" })).toBeVisible();
});

test("@cloud Clear demo orders needs the secret, and clears every device", async ({ browser, baseURL }) => {
  const staffContext = await phone(browser, baseURL);
  const guestContext = await phone(browser, baseURL);
  const staff = await staffContext.newPage();
  const guest = await guestContext.newPage();
  await openDashboard(staff);
  await goTo(staff, "Orders");
  await guest.goto(qr("demo-brewery", TABLE_7));
  await addLager(guest);
  await openCart(guest);
  await guest.getByRole("button", { name: /^Pay/ }).click();
  await expect(staff.getByText("1 x Harbour Lager (Pint)")).toBeVisible({ timeout: 3000 });

  await staff.getByRole("button", { name: "Clear demo orders" }).click();
  const dialog = staff.getByRole("dialog");
  await dialog.getByLabel("Admin secret").fill("wrong");
  await dialog.getByRole("button", { name: "Clear all orders" }).click();
  await expect(dialog.getByText("That secret isn't right.")).toBeVisible();
  await dialog.getByLabel("Admin secret").fill(SECRET);
  await dialog.getByRole("button", { name: "Clear all orders" }).click();
  await expect(staff.getByText("No orders yet.", { exact: false })).toBeVisible({ timeout: 3000 });
});
