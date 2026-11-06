import { NextResponse, type NextRequest } from "next/server";
import { DEMO_CLOUD, VENUE_EDITS_PER_MINUTE } from "@/lib/demo-cloud/config";
import { clientKey, databaseError, jsonError, readJson } from "@/lib/demo-cloud/server";
import { cleanMenu, cleanTouchpoints, db, loadSnapshot, requireOwner } from "@/lib/demo-cloud/venues";

type Context = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The full venue, with QR tokens, for its owner. Opening the dashboard counts as activity. */
export async function GET(request: NextRequest, { params }: Context) {
  if (!DEMO_CLOUD) return jsonError(404, "Not found");
  const { id } = await params;
  if (!UUID.test(id)) return jsonError(404, "That venue no longer exists.");
  const refused = await requireOwner(request, id);
  if (refused) return refused;
  const snapshot = await loadSnapshot(id);
  if (!snapshot) return jsonError(404, "That venue no longer exists.");
  await db().rpc("touch_venue", { p_slug: snapshot.venue.slug });
  return NextResponse.json({ snapshot });
}

export async function PATCH(request: NextRequest, { params }: Context) {
  if (!DEMO_CLOUD) return jsonError(404, "Not found");
  const { id } = await params;
  if (!UUID.test(id)) return jsonError(404, "That venue no longer exists.");
  const refused = await requireOwner(request, id);
  if (refused) return refused;

  const limit = await db().rpc("take_rate_limit", {
    p_bucket: `venue-edit:${clientKey(request)}`,
    p_max: VENUE_EDITS_PER_MINUTE,
  });
  if (limit.error) return databaseError(limit.error.message);

  const body = (await readJson(request)) as Record<string, unknown> | null;
  if (!body || !Number.isInteger(body.version)) return jsonError(422, "That request isn't valid.");
  const current = await loadSnapshot(id);
  if (!current) return jsonError(404, "That venue no longer exists.");

  let menu: unknown = null;
  if (body.menu !== undefined) {
    const cleaned = cleanMenu(body.menu, id);
    if (cleaned.problem !== undefined) return jsonError(422, cleaned.problem);
    menu = cleaned.value;
  }
  let touchpoints: unknown = null;
  if (body.touchpoints !== undefined) {
    const cleaned = cleanTouchpoints(body.touchpoints, current.touchpoints);
    if (cleaned.problem !== undefined) return jsonError(422, cleaned.problem);
    touchpoints = cleaned.value;
  }
  const details = body.details as { name?: unknown; country?: unknown; region?: unknown } | undefined;
  const { error } = await db().rpc("update_venue", {
    p_id: id,
    p_base_version: body.version,
    p_details: details
      ? {
          name: String(details.name ?? "").trim().slice(0, 120) || null,
          country: details.country === "US" ? "US" : "CA",
          region: String(details.region ?? "").slice(0, 60),
          currency: details.country === "US" ? "USD" : "CAD",
        }
      : null,
    p_menu: menu,
    p_sample: typeof body.sampleMenu === "boolean" ? body.sampleMenu : null,
    p_touchpoints: touchpoints,
  });
  if (error) return databaseError(error.message);
  return NextResponse.json({ snapshot: await loadSnapshot(id) });
}
