import { NextResponse, type NextRequest } from "next/server";
import { DEMO_CLOUD } from "@/lib/demo-cloud/config";
import { jsonError, readJson } from "@/lib/demo-cloud/server";
import { db, findVenueByCode, loadSnapshot, refuseWrongCode } from "@/lib/demo-cloud/venues";

export async function POST(request: NextRequest) {
  if (!DEMO_CLOUD) return jsonError(404, "Not found");
  const code = ((await readJson(request)) as { code?: unknown } | null)?.code;
  const venueId = typeof code === "string" ? await findVenueByCode(code) : null;
  if (!venueId) return refuseWrongCode(request);
  const snapshot = await loadSnapshot(venueId);
  if (!snapshot) return jsonError(404, "That venue no longer exists.");
  await db().rpc("touch_venue", { p_slug: snapshot.venue.slug });
  return NextResponse.json({ snapshot });
}
