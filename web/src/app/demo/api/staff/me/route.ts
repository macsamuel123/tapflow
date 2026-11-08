import { NextResponse, type NextRequest } from "next/server";
import { DEMO_CLOUD } from "@/lib/demo-cloud/config";
import { jsonError } from "@/lib/demo-cloud/server";
import { findOwnVenue, SIGNED_OUT_MESSAGE, staffFromToken, toSession } from "@/lib/demo-cloud/staff";

/** Who this staff token belongs to now: the role and label are read fresh every time. */
export async function GET(request: NextRequest) {
  if (!DEMO_CLOUD) return jsonError(404, "Not found");
  const venue = await findOwnVenue(request.nextUrl.searchParams.get("slug") ?? "");
  if (!venue) return jsonError(404, "We can't find this venue.");
  const staff = await staffFromToken(request, venue.id);
  if (!staff) return jsonError(401, SIGNED_OUT_MESSAGE);
  return NextResponse.json({ session: toSession(venue, staff) });
}
