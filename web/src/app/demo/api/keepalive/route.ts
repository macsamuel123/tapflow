import { NextResponse, type NextRequest } from "next/server";
import { DEMO_CLOUD } from "@/lib/demo-cloud/config";
import { adminClient, jsonError } from "@/lib/demo-cloud/server";

export const dynamic = "force-dynamic";

// Called daily by the Vercel cron in vercel.json, so a free Supabase project sees activity.
// Vercel sends CRON_SECRET as a bearer token.
export async function GET(request: NextRequest) {
  if (!DEMO_CLOUD) return jsonError(404, "Not found");
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return jsonError(401, "Unauthorized");
  const { error } = await adminClient().schema("demo").rpc("ping");
  return error ? jsonError(503, "Database unavailable") : NextResponse.json({ ok: true });
}
