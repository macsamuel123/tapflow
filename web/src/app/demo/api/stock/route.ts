import { NextResponse, type NextRequest } from "next/server";
import { DEMO_CLOUD, WRITES_PER_MINUTE } from "@/lib/demo-cloud/config";
import { demoItem, demoVenue } from "@/lib/demo-cloud/order-request";
import { adminClient, clientKey, databaseError, jsonError, readJson } from "@/lib/demo-cloud/server";

export async function POST(request: NextRequest) {
  if (!DEMO_CLOUD) return jsonError(404, "Not found");
  const body = (await readJson(request)) as { slug?: unknown; itemId?: unknown; soldOut?: unknown } | null;
  const venue = demoVenue(body?.slug);
  if (!venue || !demoItem(venue, body?.itemId)) return jsonError(404, "That item isn't on this menu.");
  if (typeof body?.soldOut !== "boolean") return jsonError(422, "That request isn't valid.");
  const { error } = await adminClient().schema("demo").rpc("set_item_stock", {
    p_ip: clientKey(request),
    p_max: WRITES_PER_MINUTE,
    p_slug: venue.venue.slug,
    p_item: body.itemId,
    p_sold_out: body.soldOut,
  });
  return error ? databaseError(error.message) : NextResponse.json({ ok: true });
}
