import { NextResponse, type NextRequest } from "next/server";
import { DEMO_CLOUD } from "@/lib/demo-cloud/config";
import { adminClient, jsonError } from "@/lib/demo-cloud/server";
import { deleteExpiredVenues } from "@/lib/demo-cloud/venues";

export const dynamic = "force-dynamic";

// Called daily by the Vercel cron in vercel.json, so a free Supabase project sees activity. It
// also removes venues idle for 14 days: photos need the Storage API, which pg_cron can't reach.
// Vercel sends CRON_SECRET as a bearer token.
export async function GET(request: NextRequest) {
  if (!DEMO_CLOUD) return jsonError(404, "Not found");
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return jsonError(401, "Unauthorized");
  const { error } = await adminClient().schema("demo").rpc("ping");
  if (error) return jsonError(503, "Database unavailable");
  return NextResponse.json({ ok: true, expired: await deleteExpiredVenues() });
}
