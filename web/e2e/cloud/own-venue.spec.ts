import { readFile } from "node:fs/promises";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import {
  clearSample, demoTable, goTo, importCsv, nextIp, openCart, phone, publicRequest, RECOVERY_CODE, SECRET, signUp, toDashboard,
} from "./helpers";

const NOTE = "Demo venue — deleted after 14 days of inactivity";

function twentyRows(prefix = "Item"): string {
  const rows = Array.from({ length: 20 }, (_, i) => `${i % 2 ? "Mains" : "Sides"},${prefix} ${i},,${10 + i}.50,food,no,${i % 3 ? "none" : "milk"}`);
  return ["category,name,description,price,tax_type,sold_out,allergens", ...rows].join("\n");
}

/** A printed table QR, turned into a path on this server. */
async function tableQr(page: Page, label: string): Promise<string> {
  await goTo(page, "Touchpoints");
  await page.getByRole("button", { name: new RegExp(`^${label} `) }).click(); // "Table 7 Active"
  const url = new URL((await page.getByTestId("qr-code").first().getAttribute("data-url"))!);
  return `${url.pathname}${url.search}`;
}

async function orderOne(page: Page, path: string, item: RegExp) {
  await page.goto(path);
  await page.getByRole("button", { name: item }).click();
  await page.getByRole("button", { name: /^Add to cart/ }).click();
  await openCart(page);
  await page.getByRole("button", { name: /^Pay/ }).click();
}

test("@cloud own venue: sign-up, CSV, QR PDF, guest phone, live orders, recovery code", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const a = await (await phone(browser, baseURL)).newPage();
  const b = await (await phone(browser, baseURL)).newPage();
  const c = await (await phone(browser, baseURL)).newPage();

  // A signs up, and sees the recovery code once.
  const code = await signUp(a, "Harbour Taproom");
  const download = a.waitForEvent("download");
  await a.getByRole("button", { name: "Download printable PDF" }).click();
  const pdf = await readFile(await (await download).path());
  expect(pdf.toString("latin1").match(/\(Scan to order\)/g)).toHaveLength(12);
  await toDashboard(a);
  await expect(a.getByTestId("cloud-venue-note")).toHaveText(NOTE);

  await goTo(a, "Menu");
  await clearSample(a);
  await importCsv(a, twentyRows(), 20);
  const path = await tableQr(a, "Table 7");
  expect(path).toMatch(/^\/v\/harbour-taproom(-\d+)?\/p\/[0-9a-f-]{36}\?token=[0-9a-f]{32}$/);
  await goTo(a, "Orders");
  await expect(a.getByText("No orders yet.", { exact: false })).toBeVisible();

  // B has no storage: everything comes from the cloud.
  await b.goto(path);
  expect(await b.evaluate(() => localStorage.length)).toBeLessThanOrEqual(1);
  await expect(b.getByRole("heading", { name: "Harbour Taproom", level: 1 })).toBeVisible();
  await expect(b.getByText("Table 7")).toBeVisible();
  await expect(b.locator("section ul button")).toHaveCount(20);
  await expect(b.getByText("your venue lives in this browser", { exact: false })).toHaveCount(0);
  await orderOne(b, path, /^Item 3\b/);
  await expect(b.getByRole("heading", { name: "Bringing it to Table 7" })).toBeVisible();
  await expect(b.getByLabel("Simulate staff (demo)")).toHaveCount(0);

  // A sees it live and moves it on. $13.50 plus 5% GST of 67.5¢, rounded up, is $14.18.
  await expect(a.getByText("1 x Item 3")).toBeVisible({ timeout: 3000 });
  await expect(a.getByText("$14.18")).toBeVisible();
  const step = b.locator("[aria-current=step]");
  await a.getByRole("button", { name: "Accept" }).click();
  await expect(step).toHaveText("Being prepared", { timeout: 3000 });
  await a.getByRole("button", { name: "Mark ready" }).click();
  await expect(step).toHaveText("On its way", { timeout: 3000 });
  await a.getByRole("button", { name: "Delivered" }).click();
  await expect(b.getByRole("heading", { name: "Delivered to Table 7" })).toBeVisible({ timeout: 3000 });

  // A wrong code is refused, the right one opens the venue, and C can edit.
  await c.goto("/login");
  await c.getByRole("link", { name: "Open my venue" }).click();
  await c.getByLabel("Venue recovery code").fill("TF-AAAA-BBBB-CCCC-DDDD");
  await c.getByRole("button", { name: "Open venue" }).click();
  await expect(c.getByRole("main").getByRole("alert")).toHaveText("That recovery code isn't right.");
  await c.getByLabel("Venue recovery code").fill(` ${code.toLowerCase()} `);
  await c.getByRole("button", { name: "Open venue" }).click();
  await expect(c.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  await expect(c.getByLabel("Switch demo venue")).toContainText("Harbour Taproom");

  await goTo(c, "Menu");
  await c.getByRole("button", { name: "Edit Item 3", exact: true }).click();
  const editor = c.getByRole("dialog");
  await editor.getByLabel("Item name").fill("Renamed by C");
  await editor.getByLabel("Price", { exact: true }).fill("20.00");
  await editor.getByRole("button", { name: "Save item" }).click();
  await expect(c.getByRole("button", { name: "Edit Renamed by C" })).toBeVisible();

  // The edit reaches the guest and the other owner device.
  await b.goto(path);
  await expect(b.getByRole("button", { name: /^Renamed by C/ })).toContainText("$20.00");
  await goTo(a, "Menu");
  await expect(a.getByRole("button", { name: "Edit Renamed by C" })).toBeVisible();
});

test("@cloud the recovery code shows once", async ({ browser, baseURL }) => {
  const page = await (await phone(browser, baseURL)).newPage();
  await signUp(page, "Once Only");
  await toDashboard(page);
  await page.goto("/signup/ready");
  await expect(page.getByRole("heading", { name: "Your QR codes are ready" })).toBeVisible();
  await expect(page.getByTestId("recovery-code")).toHaveCount(0);
});

test("@cloud sold-out and menu edits reach an open guest phone live", async ({ browser, baseURL }) => {
  const owner = await (await phone(browser, baseURL)).newPage();
  const guest = await (await phone(browser, baseURL)).newPage();
  await signUp(owner, "Live Menu");
  await toDashboard(owner);
  await goTo(owner, "Menu");
  await clearSample(owner);
  await importCsv(owner, "name,price,tax_type,allergens\nSoup,6.00,food,none\nSalad,7.00,food,none\n", 2);
  const path = await tableQr(owner, "Table 1");
  await guest.goto(path);
  await expect(guest.getByRole("button", { name: /^Soup/ })).toBeEnabled();

  await goTo(owner, "Menu");
  await owner.getByRole("switch", { name: "Soup sold out" }).click();
  await expect(guest.getByRole("button", { name: /^Soup/ })).toBeDisabled({ timeout: 3000 });
  await owner.getByRole("switch", { name: "Soup sold out" }).click();
  await expect(guest.getByRole("button", { name: /^Soup/ })).toBeEnabled({ timeout: 3000 });
});

test("@cloud Regenerate QR invalidates the old code on another phone", async ({ browser, baseURL }) => {
  const owner = await (await phone(browser, baseURL)).newPage();
  const guest = await (await phone(browser, baseURL)).newPage();
  await signUp(owner, "New Codes");
  await toDashboard(owner);
  const oldPath = await tableQr(owner, "Table 2");
  await guest.goto(oldPath);
  await expect(guest.getByText("out of date", { exact: false })).toHaveCount(0);

  await owner.getByRole("button", { name: "Regenerate QR" }).click();
  await expect(owner.getByText(/New QR for Table 2/)).toBeVisible();
  await expect(guest.getByText("This QR code is out of date.", { exact: false })).toBeVisible({ timeout: 3000 });

  const url = new URL((await owner.getByTestId("qr-code").first().getAttribute("data-url"))!);
  const newPath = `${url.pathname}${url.search}`;
  expect(newPath).not.toBe(oldPath);
  await guest.goto(newPath);
  await expect(guest.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(guest.getByText("out of date", { exact: false })).toHaveCount(0);
});

test("@cloud photos are stored in the cloud and appear on another phone", async ({ browser, baseURL }) => {
  const owner = await (await phone(browser, baseURL)).newPage();
  const guest = await (await phone(browser, baseURL)).newPage();
  await signUp(owner, "Photo Venue");
  await toDashboard(owner);
  await goTo(owner, "Menu");
  await clearSample(owner);
  await importCsv(owner, "name,price,tax_type,allergens\nSoup,6.00,food,none\n", 1);
  await owner.getByRole("button", { name: "Edit Soup", exact: true }).click();
  const png = new PNG({ width: 400, height: 300 });
  png.data.fill(180);
  await owner.getByRole("dialog").getByLabel("Upload photo").setInputFiles({ name: "soup.png", mimeType: "image/png", buffer: PNG.sync.write(png) });
  await expect(owner.getByRole("dialog").getByAltText("Item preview")).toBeVisible();
  await owner.getByRole("button", { name: "Save item" }).click();
  const photo = owner.getByTestId("item-photo");
  await expect(photo).toBeVisible();
  expect(await photo.getAttribute("src")).toMatch(/\/storage\/v1\/object\/public\/demo-menu\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/);

  await guest.goto(await tableQr(owner, "Table 1"));
  const img = guest.locator("section img");
  await expect(img).toBeVisible();
  expect(await img.evaluate((el: HTMLImageElement) => el.decode().then(() => el.naturalWidth))).toBe(400);
});

type Created = { code: string; snapshot: { venue: { id: string; slug: string }; version: number; menu: unknown[]; touchpoints: { id: string; token: string }[] } };

async function createVenue(request: APIRequestContext, name: string, extra: object = {}): Promise<Created> {
  const res = await request.post("/demo/api/venues", {
    headers: { "x-forwarded-for": nextIp() },
    data: {
      name, industry: "breweries", country: "CA", region: "British Columbia",
      menu: [{ id: "c1", name: "Mains", items: [{ id: "i1", name: "Soup", description: "", priceCents: 600, taxCategory: "Food", inStock: true, allergens: [], allergensDeclared: true, otherAllergens: "", taxNote: null, sampleAllergens: false, optionGroups: [], photoUrl: null }] }],
      sampleMenu: false,
      touchpoints: [{ id: "t1", label: "Table 1", serviceMode: "delivery", spotNumber: 1, active: true, token: "demo" }],
      ...extra,
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as Created;
}

const line = { itemId: "i1", optionIds: [], quantity: 1, notes: "" };

async function placeOrder(request: APIRequestContext, v: Created) {
  const tp = v.snapshot.touchpoints[0]!;
  const res = await request.post("/demo/api/orders", {
    headers: { "x-forwarded-for": nextIp() },
    data: { slug: v.snapshot.venue.slug, touchpointId: tp.id, token: tp.token, lines: [line] },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test.describe("rules", () => {
  test("@cloud a venue gets a code, random tokens and no way to pick its own", async ({ request }) => {
    const v = await createVenue(request, "Rules One");
    expect(v.code).toMatch(RECOVERY_CODE);
    expect(v.snapshot.touchpoints[0]!.token).toMatch(/^[0-9a-f]{32}$/);
    const stored = await demoTable(`venue_keys?venue_id=eq.${v.snapshot.venue.id}&select=key_hash`) as { key_hash: string }[];
    expect(stored[0]!.key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(v.code);
  });

  test("@cloud edits need the right recovery code", async ({ request }) => {
    const mine = await createVenue(request, "Rules Mine");
    const other = await createVenue(request, "Rules Other");
    const path = `/demo/api/venues/${mine.snapshot.venue.id}`;
    const patch = (code?: string) =>
      request.patch(path, {
        data: { version: 1, details: { name: "Hacked", country: "CA", region: "x" } },
        headers: { "x-forwarded-for": nextIp(), ...(code ? { "x-venue-key": code } : {}) },
      });
    expect((await patch()).status()).toBe(403);
    expect((await patch("TF-AAAA-BBBB-CCCC-DDDD")).status()).toBe(403);
    expect((await patch(other.code)).status()).toBe(403);
    expect((await request.get(path, { headers: { "x-forwarded-for": nextIp() } })).status()).toBe(403);
    expect((await patch(mine.code)).status()).toBe(200);
  });

  test("@cloud status changes need the code on an owner's venue, and stay open on demos", async ({ request }) => {
    const v = await createVenue(request, "Rules Status");
    const id = await placeOrder(request, v);
    const step = (code?: string) =>
      request.post(`/demo/api/orders/${id}/status`, {
        data: { status: "accepted" },
        headers: { "x-forwarded-for": nextIp(), ...(code ? { "x-venue-key": code } : {}) },
      });
    expect((await step()).status()).toBe(403);
    expect((await step(v.code)).status()).toBe(200);
  });

  test("@cloud sold-out through the demo stock route is refused for an owner's venue", async ({ request }) => {
    const v = await createVenue(request, "Rules Stock");
    const res = await request.post("/demo/api/stock", {
      headers: { "x-forwarded-for": nextIp() },
      data: { slug: v.snapshot.venue.slug, itemId: "i1", soldOut: true },
    });
    expect(res.status()).toBe(404);
  });

  test("@cloud orders are repriced from the stored menu", async ({ request }) => {
    const v = await createVenue(request, "Rules Price");
    const tp = v.snapshot.touchpoints[0]!;
    const post = (data: object) =>
      request.post("/demo/api/orders", { headers: { "x-forwarded-for": nextIp() }, data: { slug: v.snapshot.venue.slug, touchpointId: tp.id, token: tp.token, lines: [line], ...data } });
    const created = await post({ total_cents: 1 });
    expect(created.status()).toBe(201);
    const { id } = (await created.json()) as { id: string };
    const rows = await demoTable(`orders?id=eq.${id}&select=total_cents`) as { total_cents: number }[];
    expect(rows[0]!.total_cents).toBe(630);
    expect((await post({ token: "forged" })).status()).toBe(403);
    expect((await post({ token: "demo" })).status()).toBe(403);
    expect((await post({ touchpointId: "nope" })).status()).toBe(404);
  });

  test("@cloud a stale save can't overwrite a newer one", async ({ request }) => {
    const v = await createVenue(request, "Rules Stale");
    const save = (version: number) =>
      request.patch(`/demo/api/venues/${v.snapshot.venue.id}`, {
        data: { version, details: { name: `Saved ${version}`, country: "CA", region: "x" } },
        headers: { "x-forwarded-for": nextIp(), "x-venue-key": v.code },
      });
    expect((await save(1)).status()).toBe(200);
    expect((await save(1)).status()).toBe(409);
  });

  test("@cloud limits: 300 items, 500 touchpoints, 5 venues a day", async ({ request }) => {
    const item = (i: number) => ({ id: `i${i}`, name: `Item ${i}`, priceCents: 100, taxCategory: "Food", allergensDeclared: true, optionGroups: [], allergens: [] });
    const post = (data: object, ip = nextIp()) =>
      request.post("/demo/api/venues", {
        headers: { "x-forwarded-for": ip },
        data: { name: "Limits", industry: "x", country: "CA", region: "x", menu: [], touchpoints: [{ id: "t1", label: "T", serviceMode: "delivery", active: true }], ...data },
      });
    const items = (n: number) => [{ id: "c", name: "All", items: Array.from({ length: n }, (_, i) => item(i)) }];
    const points = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, label: `T ${i}`, serviceMode: "delivery", active: true }));

    expect((await post({ menu: items(300) })).status()).toBe(201);
    const tooMany = await post({ menu: items(301) });
    expect(tooMany.status()).toBe(422);
    expect(((await tooMany.json()) as { error: string }).error).toContain("up to 300 items");
    expect((await post({ touchpoints: points(500) })).status()).toBe(201);
    expect((await post({ touchpoints: points(501) })).status()).toBe(422);

    const ip = nextIp();
    for (let i = 0; i < 5; i += 1) expect((await post({}, ip)).status()).toBe(201);
    const sixth = await post({}, ip);
    expect(sixth.status()).toBe(429);
    expect(((await sixth.json()) as { error: string }).error).toContain("5 new venues a day");
  });

  test("@cloud bad content is refused or stripped", async ({ request }) => {
    const created = await createVenue(request, "Rules Clean");
    const save = (menu: unknown, version: number) =>
      request.patch(`/demo/api/venues/${created.snapshot.venue.id}`, {
        data: { version, menu },
        headers: { "x-forwarded-for": nextIp(), "x-venue-key": created.code },
      });
    const base = { id: "i1", name: "Soup", priceCents: 600, optionGroups: [], allergens: [] };
    expect((await save([{ id: "c", name: "M", items: [{ ...base, priceCents: 1.5 }] }], 1)).status()).toBe(422);
    expect((await save([{ id: "c", name: "M", items: [{ ...base, priceCents: -1 }] }], 1)).status()).toBe(422);
    expect((await save([{ id: "c", name: "M", items: [{ ...base, name: "x".repeat(81) }] }], 1)).status()).toBe(422);
    const ok = await save([{ id: "c", name: "M", items: [{ ...base, photoUrl: "https://evil.example/x.jpg", allergens: ["milk", "fake"], extra: "dropped" }] }], 1);
    expect(ok.status()).toBe(200);
    const { snapshot } = (await ok.json()) as { snapshot: { menu: { items: Record<string, unknown>[] }[] } };
    expect(snapshot.menu[0]!.items[0]).toMatchObject({ photoUrl: null, allergens: ["milk"] });
    expect(snapshot.menu[0]!.items[0]).not.toHaveProperty("extra");
  });

  test("@cloud photo uploads: owner only, JPEG only, size-limited", async ({ request }) => {
    const v = await createVenue(request, "Rules Photo");
    const path = `/demo/api/venues/${v.snapshot.venue.id}/photo`;
    const upload = (data: Buffer, key?: string) =>
      request.post(path, { data, headers: { "content-type": "image/jpeg", "x-forwarded-for": nextIp(), ...(key ? { "x-venue-key": key } : {}) } });
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(100)]);
    expect((await upload(jpeg)).status()).toBe(403);
    expect((await upload(Buffer.from("not a photo"), v.code)).status()).toBe(415);
    expect((await upload(Buffer.concat([jpeg, Buffer.alloc(500_001)]), v.code)).status()).toBe(413);
    expect((await upload(jpeg, v.code)).status()).toBe(201);
  });

  test("@cloud the public key reads menus, and can't read tokens or write", async ({ request }) => {
    const v = await createVenue(request, "Rules Public");
    const id = v.snapshot.venue.id;
    expect((await publicRequest(`venue_menus?venue_id=eq.${id}&select=menu`)).status).toBe(200);
    expect((await publicRequest(`touchpoint_secrets?select=token`)).status).toBe(401);
    expect((await publicRequest(`venue_keys?select=key_hash`)).status).toBe(401);
    expect((await publicRequest(`venues?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ name: "Hacked" }) })).status).toBe(401);
    expect((await publicRequest(`venue_menus?venue_id=eq.${id}`, { method: "DELETE" })).status).toBe(401);
    const rpc = await publicRequest("rpc/delete_venue", { method: "POST", body: JSON.stringify({ p_slug: v.snapshot.venue.slug }) });
    expect(rpc.status).toBe(401);
  });

  test("@cloud Clear demo orders leaves owners' orders alone", async ({ request }) => {
    const v = await createVenue(request, "Rules Clear");
    const id = await placeOrder(request, v);
    const cleared = await request.post("/demo/api/clear", { data: { secret: SECRET }, headers: { "x-forwarded-for": nextIp() } });
    expect(cleared.ok()).toBe(true);
    expect(await demoTable(`orders?id=eq.${id}&select=id`)).toHaveLength(1);
  });

  test("@cloud a venue idle for 14 days is deleted with its orders and photos", async ({ request }) => {
    const idle = await createVenue(request, "Rules Idle");
    const active = await createVenue(request, "Rules Active");
    const orderId = await placeOrder(request, idle);
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(100)]);
    const photo = await request.post(`/demo/api/venues/${idle.snapshot.venue.id}/photo`, {
      data: jpeg, headers: { "content-type": "image/jpeg", "x-forwarded-for": nextIp(), "x-venue-key": idle.code },
    });
    const { url } = (await photo.json()) as { url: string };
    expect((await fetch(url)).status).toBe(200);

    await demoTable(`venues?id=eq.${idle.snapshot.venue.id}`, {
      method: "PATCH",
      body: JSON.stringify({ last_activity_at: new Date(Date.now() - 15 * 86_400_000).toISOString() }),
    });
    await demoTable(`venues?id=eq.${active.snapshot.venue.id}`, {
      method: "PATCH",
      body: JSON.stringify({ last_activity_at: new Date(Date.now() - 13 * 86_400_000).toISOString() }),
    });
    const run = await request.get("/demo/api/keepalive", { headers: { authorization: "Bearer local-cron-secret" } });
    expect(await run.json()).toMatchObject({ ok: true });
    expect(((await run.json()) as { expired: number }).expired).toBeGreaterThanOrEqual(1);

    expect(await demoTable(`venues?id=eq.${idle.snapshot.venue.id}&select=id`)).toHaveLength(0);
    expect(await demoTable(`venues?id=eq.${active.snapshot.venue.id}&select=id`)).toHaveLength(1);
    expect(await demoTable(`orders?id=eq.${orderId}&select=id`)).toHaveLength(0);
    expect((await fetch(url)).status).not.toBe(200);
  });

  test("@cloud an order placed recently keeps a venue alive", async ({ request }) => {
    const v = await createVenue(request, "Rules Alive");
    await demoTable(`venues?id=eq.${v.snapshot.venue.id}`, {
      method: "PATCH",
      body: JSON.stringify({ last_activity_at: new Date(Date.now() - 15 * 86_400_000).toISOString() }),
    });
    await placeOrder(request, v);
    const rows = await demoTable(`venues?id=eq.${v.snapshot.venue.id}&select=last_activity_at`) as { last_activity_at: string }[];
    expect(Date.now() - new Date(rows[0]!.last_activity_at).getTime()).toBeLessThan(60_000);
  });

  test("@cloud admin delete by slug needs the secret", async ({ request }) => {
    const v = await createVenue(request, "Rules Admin");
    const del = (secret: string, slug = v.snapshot.venue.slug) =>
      request.post("/demo/api/admin/delete-venue", { data: { secret, slug }, headers: { "x-forwarded-for": nextIp() } });
    expect((await del("wrong")).status()).toBe(403);
    expect(await demoTable(`venues?id=eq.${v.snapshot.venue.id}&select=id`)).toHaveLength(1);
    expect((await del(SECRET, "no-such-venue")).status()).toBe(404);
    expect((await del(SECRET)).status()).toBe(200);
    expect(await demoTable(`venues?id=eq.${v.snapshot.venue.id}&select=id`)).toHaveLength(0);
    expect((await del(SECRET, "demo-brewery")).status()).toBe(404);
  });
});

test("@cloud a deleted venue's QR explains itself", async ({ browser, baseURL }) => {
  const page = await (await phone(browser, baseURL)).newPage();
  await page.goto("/v/no-such-venue/p/x?token=y");
  await expect(page.getByRole("heading", { name: "We can't find this menu" })).toBeVisible();
  await expect(page.getByText("deleted after 14 days of inactivity", { exact: false })).toBeVisible();
});
