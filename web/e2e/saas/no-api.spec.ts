import { expect, test } from "@playwright/test";
import { fillAccount, fillVenue, openPage } from "./helpers";

test("@saas demo mode makes no API or third-party requests", async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith("data:") && !url.startsWith("blob:")) requests.push(url);
  });

  await page.goto("/");
  await page.goto("/pricing");
  await page.goto("/signup?industry=breweries");
  await page.getByRole("button", { name: "Continue" }).click();
  await fillAccount(page);
  await fillVenue(page, { venueName: "Harbour Taproom" });
  await page.getByRole("button", { name: "Create my QR codes" }).click();
  await page.getByRole("button", { name: "Download printable PDF" }).click();
  await page.getByRole("link", { name: "Continue to dashboard" }).click();
  for (const [label, heading] of [
    ["Orders", "Orders"],
    ["Menu", "Menu"],
    ["Touchpoints", "Touchpoints & QR"],
    ["Staff", "Staff"],
    ["Payments", "Payments"],
    ["Settings", "Settings"],
  ] as const) {
    await openPage(page, label, heading);
  }
  await openPage(page, "Orders", "Orders");
  await page.getByRole("button", { name: "Accept" }).first().click();
  await page.goto("/login");
  await page.goto("/forgot-password");

  expect(requests.length).toBeGreaterThan(20);
  const offsite = requests.filter((url) => new URL(url).origin !== origin);
  expect(offsite, "requests that left this site").toEqual([]);
  const toApi = requests.filter((url) => /\/api\//.test(new URL(url).pathname));
  expect(toApi, "requests to the API").toEqual([]);
});

test("@saas /api is not routed in demo mode", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(404);
});

test("@saas a scanned demo QR lands on the explanation page", async ({ page }) => {
  await page.goto("/v/demo-brewery/p/c0000000-0000-4000-8000-000000000001?token=demo");
  await expect(page).toHaveURL(/\/demo\/scan/);
  await expect(page.getByRole("heading", { name: "Your QR code works" })).toBeVisible();
});
