import { NextResponse, type NextRequest } from "next/server";
import { DEMO_CLOUD } from "@/lib/demo-cloud/config";
import { jsonError, readJson } from "@/lib/demo-cloud/server";
import { hashPin, staffDatabaseError, toMember, type StaffRow } from "@/lib/demo-cloud/staff";
import { db, hashCode, requireOwner } from "@/lib/demo-cloud/venues";
import {
  isStaffRole,
  MAX_ROLE_LABEL,
  pinError,
  roleLabelError,
  usesPin,
  withDefaultLabels,
} from "@/lib/staff/permissions";
import type { RoleLabels } from "@/services/types";

type Context = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Staff management needs the recovery code. The database checks it again on every write. */
async function owner(request: NextRequest, context: Context): Promise<{ id: string; keyHash: string } | NextResponse> {
  if (!DEMO_CLOUD) return jsonError(404, "Not found");
  const { id } = await context.params;
  if (!UUID.test(id)) return jsonError(404, "That venue no longer exists.");
  const refused = await requireOwner(request, id);
  if (refused) return refused;
  return { id, keyHash: hashCode(request.headers.get("x-venue-key") ?? "") };
}

async function listing(venueId: string) {
  const [staff, venue] = await Promise.all([
    db().from("staff").select("*").eq("venue_id", venueId).order("created_at"),
    db().from("venues").select("role_labels").eq("id", venueId).maybeSingle(),
  ]);
  if (staff.error || venue.error) throw new Error("Couldn't read staff");
  return {
    staff: (staff.data as StaffRow[]).map(toMember),
    roleLabels: withDefaultLabels(venue.data?.role_labels as Partial<RoleLabels> | null),
  };
}

function cleanName(value: unknown): string | null {
  const name = typeof value === "string" ? value.trim() : "";
  return name && name.length <= 60 ? name : null;
}

/** Null when no PIN was sent. A string is the problem to show. */
function pinHash(venueId: string, pin: unknown): { hash: string | null; problem?: string } {
  if (pin === null || pin === undefined || pin === "") return { hash: null };
  const problem = typeof pin === "string" ? pinError(pin) : "Use exactly 4 digits.";
  return problem ? { hash: null, problem } : { hash: hashPin(venueId, pin as string) };
}

async function apply(request: NextRequest, venueId: string, keyHash: string, op: Record<string, unknown>) {
  const { error } = await db().rpc("save_staff", { p_venue: venueId, p_key_hash: keyHash, p_op: op });
  if (error) return staffDatabaseError(request, error.message);
  return NextResponse.json(await listing(venueId));
}

export async function GET(request: NextRequest, context: Context) {
  const venue = await owner(request, context);
  if (venue instanceof NextResponse) return venue;
  return NextResponse.json(await listing(venue.id));
}

export async function POST(request: NextRequest, context: Context) {
  const venue = await owner(request, context);
  if (venue instanceof NextResponse) return venue;
  const body = (await readJson(request)) as Record<string, unknown> | null;
  const name = cleanName(body?.name);
  if (!name) return jsonError(422, "Enter a name in 60 characters or fewer.");
  if (!isStaffRole(body?.role)) return jsonError(422, "Choose a role.");
  let hash: string | null = null;
  if (usesPin(body.role)) {
    const pin = pinHash(venue.id, body.pin);
    if (pin.problem) return jsonError(422, pin.problem);
    if (!pin.hash) return jsonError(422, "Set a 4-digit PIN for this role.");
    hash = pin.hash;
  }
  return apply(request, venue.id, venue.keyHash, { op: "add", name, role: body.role, pin_hash: hash });
}

export async function PATCH(request: NextRequest, context: Context) {
  const venue = await owner(request, context);
  if (venue instanceof NextResponse) return venue;
  const body = (await readJson(request)) as Record<string, unknown> | null;
  const op = body?.op;

  if (op === "rename_role") {
    if (!isStaffRole(body?.role) || typeof body.label !== "string") return jsonError(422, "That request isn't valid.");
    const problem = roleLabelError(body.label);
    if (problem) return jsonError(422, problem);
    const current = await db().from("venues").select("role_labels").eq("id", venue.id).maybeSingle();
    if (current.error) return staffDatabaseError(request, current.error.message);
    const labels = { ...((current.data?.role_labels as Record<string, string> | null) ?? {}), [body.role]: body.label.trim().slice(0, MAX_ROLE_LABEL) };
    const { error } = await db().rpc("save_role_labels", { p_venue: venue.id, p_key_hash: venue.keyHash, p_labels: labels });
    if (error) return staffDatabaseError(request, error.message);
    return NextResponse.json(await listing(venue.id));
  }

  if (typeof body?.id !== "string" || !UUID.test(body.id)) return jsonError(404, "That person is no longer on the team.");
  if (op === "deactivate") return apply(request, venue.id, venue.keyHash, { op, id: body.id });

  const pin = pinHash(venue.id, body.pin);
  if (pin.problem) return jsonError(422, pin.problem);
  if (op === "reset_pin") {
    if (!pin.hash) return jsonError(422, "Set a 4-digit PIN for this role.");
    return apply(request, venue.id, venue.keyHash, { op, id: body.id, pin_hash: pin.hash });
  }
  if (op === "set_role") {
    if (!isStaffRole(body.role)) return jsonError(422, "Choose a role.");
    return apply(request, venue.id, venue.keyHash, { op, id: body.id, role: body.role, pin_hash: pin.hash });
  }
  return jsonError(422, "That request isn't valid.");
}
