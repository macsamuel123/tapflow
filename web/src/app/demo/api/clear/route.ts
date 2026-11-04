import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_TRIES_PER_MINUTE, DEMO_CLOUD } from "@/lib/demo-cloud/config";
import { adminClient, clientKey, databaseError, jsonError, readJson } from "@/lib/demo-cloud/server";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export async function POST(request: NextRequest) {
  if (!DEMO_CLOUD) return jsonError(404, "Not found");
  const db = adminClient().schema("demo");
  // Counted before the check, so the secret can't be guessed quickly.
  const attempt = await db.rpc("check_admin_attempt", { p_ip: clientKey(request), p_max: ADMIN_TRIES_PER_MINUTE });
  if (attempt.error) return databaseError(attempt.error.message);

  const expected = process.env.DEMO_ADMIN_SECRET;
  const given = ((await readJson(request)) as { secret?: unknown } | null)?.secret;
  if (!expected || typeof given !== "string" || !timingSafeEqual(digest(given), digest(expected))) {
    return jsonError(403, "That secret isn't right.");
  }
  const { data, error } = await db.rpc("clear_all");
  return error ? databaseError(error.message) : NextResponse.json({ cleared: data });
}
