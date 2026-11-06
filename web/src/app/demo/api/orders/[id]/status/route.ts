import { NextResponse, type NextRequest } from "next/server";
import { DEMO_CLOUD, SHARED_SLUGS, WRITES_PER_MINUTE } from "@/lib/demo-cloud/config";
import { adminClient, clientKey, databaseError, jsonError, readJson } from "@/lib/demo-cloud/server";
import { requireOwnerOfSlug } from "@/lib/demo-cloud/venues";

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
  const db = adminClient().schema("demo");
  const order = await db.from("orders").select("venue_slug").eq("id", id).maybeSingle();
  if (order.error) return databaseError(order.error.message);
  if (!order.data) return jsonError(404, "That order no longer exists.");
  // The fixed demos are open to anyone. A tester's own venue needs its recovery code.
  const slug = order.data.venue_slug as string;
  if (!SHARED_SLUGS.includes(slug)) {
    const owner = await requireOwnerOfSlug(request, slug);
    if (owner) return owner;
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
