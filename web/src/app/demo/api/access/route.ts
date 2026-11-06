import { NextResponse, type NextRequest } from "next/server";
import { DEMO_CLOUD } from "@/lib/demo-cloud/config";
import { jsonError, readJson } from "@/lib/demo-cloud/server";
import { loadPricingVenue } from "@/lib/demo-cloud/venues";

/** Tokens stay server-side, so this is how a guest page learns whether its QR is valid. */
export async function POST(request: NextRequest) {
  if (!DEMO_CLOUD) return jsonError(404, "Not found");
  const body = (await readJson(request)) as { slug?: unknown; touchpointId?: unknown; token?: unknown } | null;
  const venue = await loadPricingVenue(String(body?.slug));
  const touchpoint = venue?.touchpoints.find((t) => t.id === body?.touchpointId);
  if (!touchpoint) return jsonError(404, "This menu isn't available.");
  return NextResponse.json({ verified: touchpoint.active && body?.token === touchpoint.token });
}
