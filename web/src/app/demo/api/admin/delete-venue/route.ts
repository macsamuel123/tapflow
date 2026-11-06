import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_TRIES_PER_MINUTE, DEMO_CLOUD } from "@/lib/demo-cloud/config";
import { clientKey, databaseError, jsonError, readJson } from "@/lib/demo-cloud/server";
import { db, deleteVenue } from "@/lib/demo-cloud/venues";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Takes down a tester's venue by slug. Anyone can publish one, so this needs to exist. */
export async function POST(request: NextRequest) {
  if (!DEMO_CLOUD) return jsonError(404, "Not found");
  const attempt = await db().rpc("check_admin_attempt", { p_ip: clientKey(request), p_max: ADMIN_TRIES_PER_MINUTE });
  if (attempt.error) return databaseError(attempt.error.message);

  const body = (await readJson(request)) as { secret?: unknown; slug?: unknown } | null;
  const expected = process.env.DEMO_ADMIN_SECRET;
  if (!expected || typeof body?.secret !== "string" || !timingSafeEqual(digest(body.secret), digest(expected))) {
    return jsonError(403, "That secret isn't right.");
  }
  const found = await db().from("venues").select("id, slug").eq("slug", String(body.slug)).maybeSingle();
  if (found.error) return databaseError(found.error.message);
  if (!found.data) return jsonError(404, "That venue doesn't exist.");
  await deleteVenue(found.data.id as string, found.data.slug as string);
  return NextResponse.json({ deleted: found.data.slug });
}
