import { NextResponse, type NextRequest } from "next/server";
import { DEMO_CLOUD } from "@/lib/demo-cloud/config";
import { databaseError, jsonError } from "@/lib/demo-cloud/server";
import { findOwnVenue, requireActor } from "@/lib/demo-cloud/staff";
import { db, loadSnapshot } from "@/lib/demo-cloud/venues";
import { can } from "@/lib/staff/permissions";
import type { StaffAction } from "@/services/types";

const ORDER_VIEWS: StaffAction[] = ["view_fulfillment", "view_ready", "view_orders"];
const READY_STATUSES = ["ready", "delivered", "picked_up"];

/** What a staff device shows, for its role only: orders, the menu for sold out, or touchpoints.
 *  Never QR tokens. */
export async function GET(request: NextRequest) {
  if (!DEMO_CLOUD) return jsonError(404, "Not found");
  const params = request.nextUrl.searchParams;
  const venue = await findOwnVenue(params.get("slug") ?? "");
  if (!venue) return jsonError(404, "We can't find this venue.");
  const kind = params.get("kind");

  if (kind === "orders") {
    const access = await requireActor(request, venue, ORDER_VIEWS);
    if (access.refused) return access.refused;
    const role = access.actor.kind === "staff" ? access.actor.staff.role : "owner";
    let query = db().from("orders").select("*").eq("venue_slug", venue.slug).order("created_at", { ascending: false }).limit(100);
    // Delivery roles only see what's ready for them and what they've handed over.
    if (!can(role, "view_fulfillment") && !can(role, "view_orders")) query = query.in("status", READY_STATUSES);
    const { data, error } = await query;
    if (error) return databaseError(error.message);
    return NextResponse.json({ orders: data });
  }

  const action: StaffAction | null = kind === "menu" ? "sold_out" : kind === "touchpoints" ? "view_touchpoints" : null;
  if (!action) return jsonError(404, "Not found");
  const access = await requireActor(request, venue, action);
  if (access.refused) return access.refused;
  const snapshot = await loadSnapshot(venue.id);
  if (!snapshot) return jsonError(404, "We can't find this venue.");
  return kind === "menu"
    ? NextResponse.json({ menu: snapshot.menu })
    : NextResponse.json({ touchpoints: snapshot.touchpoints.map((t) => ({ ...t, token: "" })) });
}
