import { NextResponse, type NextRequest } from "next/server";
import { DEMO_CLOUD, SHARED_SLUGS, WRITES_PER_MINUTE } from "@/lib/demo-cloud/config";
import { adminClient, clientKey, databaseError, jsonError, readJson } from "@/lib/demo-cloud/server";
import { findOwnVenue, requireActor, STAFF_TOKEN_HEADER } from "@/lib/demo-cloud/staff";
import { actionForStatus, NOT_ALLOWED_MESSAGE } from "@/lib/staff/permissions";
import type { OrderStatus } from "@/services/types";

const STATUSES = ["accepted", "ready", "delivered", "picked_up", "cancelled"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!DEMO_CLOUD) return jsonError(404, "Not found");
  const { id } = await params;
  const status = ((await readJson(request)) as { status?: unknown } | null)?.status;
  if (!UUID.test(id)) return jsonError(404, "That order no longer exists.");
  if (typeof status !== "string" || !STATUSES.includes(status)) {
    return jsonError(409, "That order can't move to that step.");
  }
  const action = actionForStatus(status as OrderStatus);
  if (!action) return jsonError(409, "That order can't move to that step.");
  const db = adminClient().schema("demo");
  const order = await db.from("orders").select("venue_slug").eq("id", id).maybeSingle();
  if (order.error) return databaseError(order.error.message);
  if (!order.data) return jsonError(404, "That order no longer exists.");
  const slug = order.data.venue_slug as string;
  if (SHARED_SLUGS.includes(slug)) {
    // The fixed demos are open to anyone, but they have no staff: a staff token isn't valid here.
    if (request.headers.get(STAFF_TOKEN_HEADER)) return jsonError(403, NOT_ALLOWED_MESSAGE);
  } else {
    // A tester's own venue: its recovery code, or a staff token whose role allows this step.
    const venue = await findOwnVenue(slug);
    if (!venue) return jsonError(404, "That venue no longer exists.");
    const access = await requireActor(request, venue, action);
    if (access.refused) return access.refused;
  }
  const { error } = await db.rpc("set_order_status", {
    p_ip: clientKey(request),
    p_max: WRITES_PER_MINUTE,
    p_id: id,
    p_status: status,
  });
  if (error) return databaseError(error.message);
  await db.rpc("touch_venue", { p_slug: slug });
  return NextResponse.json({ ok: true });
}
