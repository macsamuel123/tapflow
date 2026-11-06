import { NextResponse, type NextRequest } from "next/server";
import { DEMO_CLOUD, ORDERS_PER_MINUTE } from "@/lib/demo-cloud/config";
import { demoVenue, priceOrder } from "@/lib/demo-cloud/order-request";
import { adminClient, clientKey, databaseError, jsonError, readJson } from "@/lib/demo-cloud/server";
import { loadPricingVenue } from "@/lib/demo-cloud/venues";

export async function POST(request: NextRequest) {
  if (!DEMO_CLOUD) return jsonError(404, "Not found");
  const body = await readJson(request);
  const slug = (body as { slug?: unknown } | null)?.slug;
  const db = adminClient().schema("demo");

  const stock = await db.from("item_stock").select("item_id, sold_out").eq("venue_slug", String(slug));
  if (stock.error) return databaseError(stock.error.message);
  const soldOut = new Map(stock.data.map((row) => [row.item_id as string, row.sold_out as boolean]));

  const venue = demoVenue(slug) ?? (await loadPricingVenue(String(slug)));
  const priced = priceOrder(venue, body, soldOut);
  if ("error" in priced) return jsonError(priced.status, priced.error);

  const { data, error } = await db.rpc("create_order", {
    p_ip: clientKey(request),
    p_max: ORDERS_PER_MINUTE,
    p_order: priced,
  });
  if (error) return databaseError(error.message);
  await db.rpc("touch_venue", { p_slug: priced.venue_slug });
  return NextResponse.json({ id: (data as { id: string }).id }, { status: 201 });
}
