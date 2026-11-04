import { NextResponse, type NextRequest } from "next/server";
import { DEMO_CLOUD, WRITES_PER_MINUTE } from "@/lib/demo-cloud/config";
import { adminClient, clientKey, databaseError, jsonError, readJson } from "@/lib/demo-cloud/server";

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
  const { error } = await adminClient().schema("demo").rpc("set_order_status", {
    p_ip: clientKey(request),
    p_max: WRITES_PER_MINUTE,
    p_id: id,
    p_status: status,
  });
  return error ? databaseError(error.message) : NextResponse.json({ ok: true });
}
