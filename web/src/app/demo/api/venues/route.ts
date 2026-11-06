import { NextResponse, type NextRequest } from "next/server";
import { DEMO_CLOUD, VENUES_PER_DAY } from "@/lib/demo-cloud/config";
import { clientKey, databaseError, jsonError, readJson } from "@/lib/demo-cloud/server";
import { cleanMenu, cleanTouchpoints, db, hashCode, loadSnapshot, newRecoveryCode } from "@/lib/demo-cloud/venues";
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

  const code = newRecoveryCode();
  const { data, error } = await db().rpc("create_venue", {
    p_ip: clientKey(request),
    p_max: VENUES_PER_DAY,
    p_venue: {
      slug: slugify(name),
      name,
      industry: String(body.industry ?? "").slice(0, 40),
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
  const snapshot = await loadSnapshot((data as { id: string }).id);
  return NextResponse.json({ code, snapshot }, { status: 201 });
}
