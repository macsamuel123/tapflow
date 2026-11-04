import { expect, test } from "@playwright/test";
import { openPage, reachSetupStep, skipFirstItems } from "./helpers";

test("@saas food truck path: pickup only", async ({ page }) => {
  await reachSetupStep(page, "food-trucks", "Taco Window");

  await expect(page.getByLabel("How many?")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("You'll get 1 pickup QR code.");
  await skipFirstItems(page);

  await expect(page.getByRole("heading", { name: "Your QR codes are ready" })).toBeVisible();
  await expect(page.getByText("1 code for Taco Window")).toBeVisible();
  await page.getByRole("link", { name: "Continue to dashboard" }).click();

  await openPage(page, "Orders", "Orders");
  await expect(page.getByText(/^#\d+ · (Amara|Noah|Priya|Leo|Sofia|Mateo|Hana|Owen|Zoe)$/).first()).toBeVisible();
  await expect(page.getByText(/Deliver/)).toHaveCount(0);

  const ready = page.getByText(/^Ready — #\d+ · \w+, collect at Pickup counter$/);
  await expect(ready).toHaveCount(1);
  await page.getByRole("button", { name: "Picked up" }).click();
  await expect(ready).toHaveCount(0);

  await openPage(page, "Touchpoints", "Touchpoints & QR");
  await page.getByRole("button", { name: /Pickup counter/ }).click();
  await page.getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("A venue needs at least one active touchpoint.");
});

test("@saas personas: switch between the brewery and the food truck", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("tester@example.test");
  await page.getByLabel("Password").fill("anything");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();

  await expect(page.getByLabel("Switch demo venue")).toHaveValue("demo-brewery");
  await openPage(page, "Orders", "Orders");
  await expect(page.getByText(/^Ticket #\d+ · Deliver(ed)? to Table \d+$/).first()).toBeVisible();
  await expect(page.getByText(/collect at Bar counter|Pickup at Bar counter/).first()).toBeVisible();

  await page.getByLabel("Switch demo venue").selectOption("demo-food-truck");
  await expect(page.getByText(/collect at Pickup window|Pickup at Pickup window/).first()).toBeVisible();
  await expect(page.getByText(/Table \d+/)).toHaveCount(0);

  await openPage(page, "Touchpoints", "Touchpoints & QR");
  await expect(page.getByText("1 active code.")).toBeVisible();
});
