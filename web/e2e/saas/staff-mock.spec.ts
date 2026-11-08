import { expect, test, type Page } from "@playwright/test";
import { expectNoSideScroll, logIn, openPage } from "./helpers";

const STAFF_MODE = "/staff/demo-brewery";

async function enterPin(page: Page, pin: string) {
  for (const digit of pin) await page.getByRole("button", { name: digit, exact: true }).click();
}

function member(page: Page, name: string) {
  return page.getByRole("list", { name: "Team" }).getByRole("listitem").filter({ hasText: name });
}

test("@saas staff screen: add with PIN or invite link, matrix, edit role, reset PIN, deactivate", async ({ page }) => {
  await logIn(page);
  await openPage(page, "Staff", "Staff");
  const table = page.getByRole("table", { name: "Permissions" });
  await expect(table.getByRole("columnheader")).toHaveText(["Action", "Owner", "Manager", "Cook", "Bartender", "Server", "Runner", "Host"]);
  await expectNoSideScroll(page);

  // PIN roles get a PIN field. Owner and Manager get an invite link instead.
  for (const role of ["Cook", "Bartender", "Server", "Runner", "Host"]) {
    await page.getByLabel("Role", { exact: true }).selectOption({ label: role });
    await expect(page.getByLabel("4-digit PIN")).toBeVisible();
  }
  for (const role of ["Owner", "Manager"]) {
    await page.getByLabel("Role", { exact: true }).selectOption({ label: role });
    await expect(page.getByLabel("4-digit PIN")).toHaveCount(0);
    await expect(page.getByText("Real email invites when accounts go live").first()).toBeVisible();
  }
  await page.getByLabel("Name", { exact: true }).fill("Pat Morgan");
  await page.getByRole("button", { name: "Add staff" }).click();
  const invite = page.getByRole("status").filter({ hasText: "Invite link for Pat Morgan" });
  await expect(invite.getByLabel("Invite link")).toHaveValue(/\/signup\/invite\?invite=/);
  await expect(invite.getByRole("button", { name: "Copy invite link" })).toBeVisible();

  // PINs are exactly 4 digits and unique in the venue.
  await page.getByLabel("Role", { exact: true }).selectOption({ label: "Cook" });
  await page.getByLabel("Name", { exact: true }).fill("Sam Ortiz");
  await page.getByLabel("4-digit PIN").fill("12");
  await page.getByRole("button", { name: "Add staff" }).click();
  await expect(page.getByText("Use exactly 4 digits.")).toBeVisible();
  await page.getByLabel("4-digit PIN").fill("1111"); // Mina's sample PIN
  await page.getByRole("button", { name: "Add staff" }).click();
  await expect(page.getByText("That PIN is already in use.")).toBeVisible();
  await page.getByLabel("4-digit PIN").fill("6789");
  await page.getByRole("button", { name: "Add staff" }).click();
  await expect(member(page, "Sam Ortiz")).toContainText("Cook");
  await expect(member(page, "Sam Ortiz")).toContainText("Signs in with a PIN");

  // Edit role: Cook to Server.
  await page.getByRole("button", { name: "Edit role for Sam Ortiz" }).click();
  await page.getByLabel("New role for Sam Ortiz").selectOption({ label: "Server" });
  await page.getByRole("button", { name: "Save role" }).click();
  await expect(member(page, "Sam Ortiz")).toContainText("Server");

  // Reset PIN, then deactivate.
  await page.getByRole("button", { name: "Reset PIN for Sam Ortiz" }).click();
  await page.getByLabel("New 4-digit PIN for Sam Ortiz").fill("2222"); // Kai's
  await page.getByRole("button", { name: "Save PIN" }).click();
  await expect(page.getByText("That PIN is already in use.")).toBeVisible();
  await page.getByLabel("New 4-digit PIN for Sam Ortiz").fill("8642");
  await page.getByRole("button", { name: "Save PIN" }).click();
  await expect(page.getByLabel("New 4-digit PIN for Sam Ortiz")).toHaveCount(0);
  await page.getByRole("button", { name: "Deactivate Sam Ortiz" }).click();
  await expect(member(page, "Sam Ortiz")).toContainText("Deactivated");
  await expect(page.getByRole("button", { name: "Edit role for Sam Ortiz" })).toHaveCount(0);

  // The account owner can't be changed here.
  await expect(page.getByRole("button", { name: "Deactivate Sam Rivera" })).toHaveCount(0);
});

test("@saas staff mode: Cook marks ready with no Delivered, Server delivers, Host is view-only, rename shows everywhere", async ({ page, context }) => {
  await logIn(page);
  await openPage(page, "Staff", "Staff");
  await page.getByLabel("Display name for Cook").fill("Chef");
  await page.getByRole("button", { name: "Save name for Cook" }).click();
  await expect(member(page, "Mina Park")).toContainText("Chef");
  await expect(page.getByRole("table", { name: "Permissions" }).getByRole("columnheader", { name: "Chef" })).toBeVisible();

  const device = await context.newPage();
  await device.goto(STAFF_MODE);
  await expect(device.getByRole("heading", { name: "Demo Brewery" })).toBeVisible();
  await expect(device.getByText("Chef, Bartender, Server, Runner and Host sign in with their 4-digit PIN.")).toBeVisible();

  await enterPin(device, "1111");
  await expect(device.getByRole("status")).toHaveText("Signed in as Chef");
  await expect(device.getByTestId("staff-header")).toHaveText("Mina Park · Chef");
  await expect(device.getByRole("heading", { name: "New and in progress" })).toBeVisible();
  const ready = device.getByRole("button", { name: "Mark ready" });
  const before = await ready.count();
  expect(before).toBeGreaterThan(0);
  await ready.first().click();
  await expect(ready).toHaveCount(before - 1);
  await expect(device.getByRole("button", { name: "Delivered" })).toHaveCount(0);
  await expect(device.getByRole("button", { name: "Picked up" })).toHaveCount(0);
  await expectNoSideScroll(device);

  await device.getByRole("button", { name: "Switch user" }).click();
  await expect(device.getByRole("img", { name: /PIN, 0 of 4/ })).toBeVisible();

  await enterPin(device, "3333");
  await expect(device.getByTestId("staff-header")).toHaveText("Ava Chen · Server");
  await expect(device.getByRole("heading", { name: "Ready to deliver" })).toBeVisible();
  await expect(device.getByRole("button", { name: "Mark ready" })).toHaveCount(0);
  await expect(device.getByRole("button", { name: "Accept" })).toHaveCount(0);
  const close = device.getByRole("button", { name: /^(Delivered|Picked up)$/ });
  const readyCount = await close.count();
  expect(readyCount).toBeGreaterThan(0);
  await close.first().click();
  await expect(close).toHaveCount(readyCount - 1);

  await device.getByRole("button", { name: "Switch user" }).click();
  await enterPin(device, "5555");
  await expect(device.getByTestId("staff-header")).toHaveText("Rosa Diaz · Host");
  await expect(device.getByRole("heading", { name: "Open orders" })).toBeVisible();
  await expect(device.getByRole("heading", { name: "Touchpoints" })).toBeVisible();
  await expect(device.getByRole("listitem").filter({ hasText: "Open" }).first()).toBeVisible();
  await expect(device.getByRole("button", { name: /^(Accept|Mark ready|Delivered|Picked up|Cancel)$/ })).toHaveCount(0);
  await expect(device.getByText("Mark items sold out")).toHaveCount(0);
});

test("@saas staff mode: deactivating or resetting a PIN signs the device out at once", async ({ page, context }) => {
  await logIn(page);
  const device = await context.newPage();
  await device.goto(STAFF_MODE);
  await enterPin(device, "4444");
  await expect(device.getByTestId("staff-header")).toHaveText("Theo Grant · Runner");

  await openPage(page, "Staff", "Staff");
  await page.getByRole("button", { name: "Reset PIN for Theo Grant" }).click();
  await page.getByLabel("New 4-digit PIN for Theo Grant").fill("4321");
  await page.getByRole("button", { name: "Save PIN" }).click();
  await expect(device.getByText("You've been signed out. Enter your PIN again.")).toBeVisible();
  await enterPin(device, "4444");
  await expect(device.getByText("That PIN didn't match. 4 tries left.")).toBeVisible();
  await enterPin(device, "4321");
  await expect(device.getByTestId("staff-header")).toHaveText("Theo Grant · Runner");

  await page.getByRole("button", { name: "Deactivate Theo Grant" }).click();
  await expect(device.getByText("You've been signed out. Enter your PIN again.")).toBeVisible();
  await enterPin(device, "4321");
  await expect(device.getByText("That PIN didn't match. 4 tries left.")).toBeVisible();
  await expect(device.getByTestId("staff-header")).toHaveCount(0);
});

test("@saas staff mode: 5 wrong PINs lock PIN login, even for the right PIN", async ({ page }) => {
  await page.goto(STAFF_MODE);
  for (let i = 0; i < 4; i += 1) await enterPin(page, "9999");
  await expect(page.getByText("That PIN didn't match. 1 try left.")).toBeVisible();
  await enterPin(page, "9999");
  await expect(page.getByText("Too many tries. PIN login is locked for 1 minute.")).toBeVisible();
  await enterPin(page, "1111");
  await expect(page.getByText("Too many tries. PIN login is locked for 1 minute.")).toBeVisible();
  await expect(page.getByTestId("staff-header")).toHaveCount(0);
});
