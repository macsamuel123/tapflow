import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { nextIp, SECRET, TABLE_7, WINDOW } from "./helpers";


/** withFixedIds numbers each category, item, group and option in menu order. */
const id = (n: number) => `d0000b02-0000-4000-8000-${String(n).padStart(12, "0")}`;
const LAGER_IDS = { itemId: id(2), pint: id(5) };

function order(ids: { itemId: string; pint: string }, extra: object = {}) {
  return {
    slug: "demo-brewery",
    touchpointId: TABLE_7,
    token: "demo",
    lines: [{ itemId: ids.itemId, optionIds: [ids.pint], quantity: 1, notes: "" }],
    ...extra,
  };
}

async function readOrder(id: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/orders?id=eq.${id}&select=*`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "Accept-Profile": "demo" },
  });
  return ((await res.json()) as Record<string, unknown>[])[0]!;
}

test.beforeEach(async ({ request }) => {
  await request.post("/demo/api/clear", { data: { secret: SECRET }, headers: { "x-forwarded-for": nextIp() } });
});

test.describe("orders", () => {
  test("@cloud the server reprices: tampered totals and prices are ignored", async ({ request }) => {
    const ids = LAGER_IDS;
    const res = await request.post("/demo/api/orders", {
      headers: { "x-forwarded-for": nextIp() },
      data: order(ids, {
        total_cents: 1,
        totalCents: 1,
        subtotal_cents: 1,
        lines: [{ itemId: ids.itemId, optionIds: [ids.pint], quantity: 2, notes: "", unitPriceCents: 1, priceCents: 1 }],
      }),
    });
    expect(res.status()).toBe(201);
    const row = await readOrder(((await res.json()) as { id: string }).id);
    // $10 x 2 = $20, GST $1, PST $2.
    expect(row).toMatchObject({ subtotal_cents: 2000, tax_cents: 300, total_cents: 2300, tip_cents: 0, status: "paid" });
    expect(row.items).toEqual([{ name: "Harbour Lager", quantity: 2, unitPriceCents: 1000, options: ["Pint"], notes: "" }]);
  });

  test("@cloud invalid demo tokens, touchpoints and venues are rejected", async ({ request }) => {
    const ids = LAGER_IDS;
    const post = (data: object) => request.post("/demo/api/orders", { data, headers: { "x-forwarded-for": nextIp() } });
    expect((await post(order(ids, { token: "forged" }))).status()).toBe(403);
    expect((await post(order(ids, { token: null }))).status()).toBe(403);
    expect((await post(order(ids, { touchpointId: "nope" }))).status()).toBe(404);
    expect((await post(order(ids, { slug: "someone-else" }))).status()).toBe(404);
    expect((await post({ nonsense: true })).status()).toBe(404);
  });

  test("@cloud bad carts are rejected: required option, sold out, quantity, too many lines", async ({ request }) => {
    const ids = LAGER_IDS;
    const post = (data: object) => request.post("/demo/api/orders", { data, headers: { "x-forwarded-for": nextIp() } });
    const line = { itemId: ids.itemId, optionIds: [ids.pint], quantity: 1, notes: "" };
    expect((await post(order(ids, { lines: [{ ...line, optionIds: [] }] }))).status()).toBe(409);
    expect((await post(order(ids, { lines: [{ ...line, quantity: 21 }] }))).status()).toBe(409);
    expect((await post(order(ids, { lines: [{ ...line, quantity: 1.5 }] }))).status()).toBe(422);
    expect((await post(order(ids, { lines: [] }))).status()).toBe(422);
    expect((await post(order(ids, { lines: Array.from({ length: 21 }, () => line) }))).status()).toBe(422);
    expect((await post(order(ids, { lines: [{ ...line, itemId: "nope" }] }))).status()).toBe(409);

    const stock = await request.post("/demo/api/stock", {
      headers: { "x-forwarded-for": nextIp() },
      data: { slug: "demo-brewery", itemId: ids.itemId, soldOut: true },
    });
    expect(stock.ok()).toBe(true);
    expect((await post(order(ids))).status()).toBe(409);
  });

  test("@cloud pickup needs a first name, and names are capped at 30", async ({ request }) => {
    const horchata = "d0000f02-0000-4000-8000-000000000010"; // the first drink: it has no options
    const pickup = (guestName: unknown) =>
      request.post("/demo/api/orders", {
        headers: { "x-forwarded-for": nextIp() },
        data: { slug: "demo-food-truck", touchpointId: WINDOW, token: "demo", guestName, lines: [{ itemId: horchata, optionIds: [], quantity: 1, notes: "" }] },
      });
    expect((await pickup("")).status()).toBe(422);
    expect((await pickup("<>")).status()).toBe(422);
    expect((await pickup("x".repeat(31))).status()).toBe(422);
    expect((await pickup("x".repeat(30))).status()).toBe(201);
  });

  test("@cloud invalid status steps are rejected", async ({ request }) => {
    const ids = LAGER_IDS;
    const created = await request.post("/demo/api/orders", { data: order(ids), headers: { "x-forwarded-for": nextIp() } });
    const { id } = (await created.json()) as { id: string };
    const step = (status: unknown) =>
      request.post(`/demo/api/orders/${id}/status`, { data: { status }, headers: { "x-forwarded-for": nextIp() } });

    expect((await step("delivered")).status()).toBe(409);
    expect((await step("picked_up")).status()).toBe(409);
    expect((await step("paid")).status()).toBe(409);
    expect((await step("nonsense")).status()).toBe(409);
    expect((await step("accepted")).status()).toBe(200);
    expect((await step("accepted")).status()).toBe(409);

    const unknown = await request.post("/demo/api/orders/00000000-0000-4000-8000-000000000000/status", {
      data: { status: "accepted" },
      headers: { "x-forwarded-for": nextIp() },
    });
    expect(unknown.status()).toBe(404);
  });

  test("@cloud two simultaneous taps can't both win", async ({ request }) => {
    const ids = LAGER_IDS;
    const created = await request.post("/demo/api/orders", { data: order(ids), headers: { "x-forwarded-for": nextIp() } });
    const { id } = (await created.json()) as { id: string };
    const tap = () =>
      request.post(`/demo/api/orders/${id}/status`, { data: { status: "accepted" }, headers: { "x-forwarded-for": nextIp() } });
    const codes = (await Promise.all([tap(), tap(), tap()])).map((r) => r.status()).sort();
    expect(codes).toEqual([200, 409, 409]);
  });

  test("@cloud the rate limit triggers per IP: 10 orders a minute", async ({ request }) => {
    const ids = LAGER_IDS;
    const ip = nextIp();
    const codes: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      const res = await request.post("/demo/api/orders", { data: order(ids), headers: { "x-forwarded-for": ip } });
      codes.push(res.status());
    }
    expect(codes.filter((c) => c === 201)).toHaveLength(10);
    expect(codes.slice(-2)).toEqual([429, 429]);
    const other = await request.post("/demo/api/orders", { data: order(ids), headers: { "x-forwarded-for": nextIp() } });
    expect(other.status()).toBe(201);
  });
});

test("@cloud Clear needs the secret, and guessing is rate limited", async ({ request }) => {
  const ip = nextIp();
  const clear = (secret: unknown) => request.post("/demo/api/clear", { data: { secret }, headers: { "x-forwarded-for": ip } });
  for (let i = 0; i < 5; i += 1) expect((await clear("wrong")).status()).toBe(403);
  expect((await clear(SECRET)).status()).toBe(429);
});

test("@cloud keepalive needs the cron secret and runs a query", async ({ request }) => {
  expect((await request.get("/demo/api/keepalive")).status()).toBe(401);
  const res = await request.get("/demo/api/keepalive", { headers: { authorization: "Bearer local-cron-secret" } });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

test("@cloud the service key never reaches the browser", async () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const secret = process.env.DEMO_ADMIN_SECRET!;
  expect(key.length).toBeGreaterThan(20);
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  const files = walk(join(process.cwd(), ".next/static"));
  expect(files.length).toBeGreaterThan(5);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    expect(text.includes(key), file).toBe(false);
    expect(text.includes(secret), file).toBe(false);
    expect(text.includes("SUPABASE_SERVICE_ROLE_KEY"), file).toBe(false);
  }
});
