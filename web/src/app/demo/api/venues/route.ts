import { NextResponse, type NextRequest } from "next/server";
import { DEMO_CLOUD, VENUES_PER_DAY } from "@/lib/demo-cloud/config";
import { clientKey, databaseError, jsonError, readJson } from "@/lib/demo-cloud/server";
import { cleanMenu, cleanTouchpoints, db, hashCode, loadSnapshot, newRecoveryCode } from "@/lib/demo-cloud/venues";
import { hashPin } from "@/lib/demo-cloud/staff";
import { SAMPLE_TEAM } from "@/lib/staff/sample-team";
import { slugify } from "@/mocks/fixtures";

const COUNTRIES = ["CA", "US"];

export async function POST(request: NextRequest) {
  if (!DEMO_CLOUD) return jsonError(404, "Not found");
  const body = (await readJson(request)) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!body || !name || name.length > 120 || !COUNTRIES.includes(body.country as string)) {
    return jsonError(422, "Those venue details aren't valid.");
  }
  const menu = cleanMenu(body.menu, "new");
  if (menu.problem !== undefined) return jsonError(422, menu.problem);
  const points = cleanTouchpoints(body.touchpoints, []);
  if (points.problem !== undefined) return jsonError(422, points.problem);

  const industry = String(body.industry ?? "").slice(0, 40);
  const venueType = typeof body.venueType === "string" ? body.venueType.trim() : "";
  if (industry === "other" && (!venueType || venueType.length > 40)) {
    return jsonError(422, "Enter your venue type in 40 characters or fewer.");
  }

  const code = newRecoveryCode();
  const { data, error } = await db().rpc("create_venue", {
    p_ip: clientKey(request),
    p_max: VENUES_PER_DAY,
    p_venue: {
      slug: slugify(name),
      name,
      industry,
      venue_type: industry === "other" ? venueType : null,
      country: body.country,
      region: String(body.region ?? "").slice(0, 60),
      currency: body.country === "US" ? "USD" : "CAD",
    },
    p_touchpoints: points.value,
    p_menu: menu.value,
    p_sample: body.sampleMenu === true,
    p_key_hash: hashCode(code),
  });
  if (error) {
    return error.message === "rate_limited"
      ? jsonError(429, `You've reached the limit of ${VENUES_PER_DAY} new venues a day.`)
      : databaseError(error.message);
  }
  const venueId = (data as { id: string }).id;
  // The same sample team a same-browser venue starts with, so staff mode can be tried at once.
  for (const member of SAMPLE_TEAM) {
    await db().rpc("save_staff", {
      p_venue: venueId,
      p_key_hash: hashCode(code),
      p_op: { op: "add", name: member.name, role: member.role, pin_hash: member.pin ? hashPin(venueId, member.pin) : null },
    });
  }
  const snapshot = await loadSnapshot(venueId);
  return NextResponse.json({ code, snapshot }, { status: 201 });
}
