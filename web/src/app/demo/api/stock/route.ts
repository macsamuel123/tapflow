import { NextResponse, type NextRequest } from "next/server";
import { DEMO_CLOUD, WRITES_PER_MINUTE } from "@/lib/demo-cloud/config";
import { demoItem, demoVenue } from "@/lib/demo-cloud/order-request";
import { adminClient, clientKey, databaseError, jsonError, readJson } from "@/lib/demo-cloud/server";
import { findOwnVenue, requireActor, staffDatabaseError, STAFF_TOKEN_HEADER } from "@/lib/demo-cloud/staff";
import { NOT_ALLOWED_MESSAGE } from "@/lib/staff/permissions";

export async function POST(request: NextRequest) {
  if (!DEMO_CLOUD) return jsonError(404, "Not found");
  const body = (await readJson(request)) as { slug?: unknown; itemId?: unknown; soldOut?: unknown } | null;
  if (typeof body?.soldOut !== "boolean" || typeof body.itemId !== "string") {
    return jsonError(422, "That request isn't valid.");
  }
  const db = adminClient().schema("demo");
  const venue = demoVenue(body.slug);
  if (venue) {
    if (request.headers.get(STAFF_TOKEN_HEADER)) return jsonError(403, NOT_ALLOWED_MESSAGE);
    if (!demoItem(venue, body.itemId)) return jsonError(404, "That item isn't on this menu.");
    const { error } = await db.rpc("set_item_stock", {
      p_ip: clientKey(request),
      p_max: WRITES_PER_MINUTE,
      p_slug: venue.venue.slug,
      p_item: body.itemId,
      p_sold_out: body.soldOut,
    });
    return error ? databaseError(error.message) : NextResponse.json({ ok: true });
  }

  // A tester's own venue: the owner's code, or a staff role that may mark items sold out.
  const own = typeof body.slug === "string" ? await findOwnVenue(body.slug) : null;
  if (!own) return jsonError(404, "That item isn't on this menu.");
  const access = await requireActor(request, own, "sold_out");
  if (access.refused) return access.refused;
  const limit = await db.rpc("take_rate_limit", { p_bucket: `writes:${clientKey(request)}`, p_max: WRITES_PER_MINUTE });
  if (limit.error) return databaseError(limit.error.message);
  const { error } = await db.rpc("set_own_item_stock", { p_venue: own.id, p_item: body.itemId, p_sold_out: body.soldOut });
  return error ? staffDatabaseError(request, error.message) : NextResponse.json({ ok: true });
}
