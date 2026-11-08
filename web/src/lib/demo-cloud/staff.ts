import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { can, isStaffRole, NOT_ALLOWED_MESSAGE, roleLabel } from "@/lib/staff/permissions";
import type { RoleLabels, StaffAction, StaffMember, StaffRole, StaffSession } from "@/services/types";
import { databaseError, jsonError } from "./server";
import { db, findVenueByCode, refuseWrongCode } from "./venues";

export const STAFF_TOKEN_HEADER = "x-staff-token";
export const SIGNED_OUT_MESSAGE = "You've been signed out. Enter your PIN again.";
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

/** The pepper for PIN hashes and the key for staff tokens. Falls back to one derived from the
 *  service key, so a deploy without DEMO_STAFF_SECRET still never exposes either. */
function secret(): string {
  const own = process.env.DEMO_STAFF_SECRET;
  if (own) return own;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) throw new Error("DEMO_STAFF_SECRET or SUPABASE_SERVICE_ROLE_KEY must be set");
  return createHash("sha256").update(`tapflow-demo-staff:${service}`).digest("hex");
}

/** Deterministic, so the database can enforce one PIN per venue and look a PIN up. Peppered, so
 *  a leaked table can't be reversed by trying all 10,000 PINs. */
export function hashPin(venueId: string, pin: string): string {
  return createHmac("sha256", secret()).update(`pin:${venueId}:${pin}`).digest("hex");
}

type TokenPayload = { sid: string; vid: string; ver: number; exp: number };

function sign(body: string): string {
  return createHmac("sha256", secret()).update(`token:${body}`).digest("base64url");
}

export function signStaffToken(payload: Omit<TokenPayload, "exp">, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: now + TOKEN_TTL_MS })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyStaffToken(token: string | null, now = Date.now()): TokenPayload | null {
  if (!token) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as TokenPayload;
    if (typeof payload.sid !== "string" || typeof payload.vid !== "string" || !Number.isInteger(payload.ver)) return null;
    return typeof payload.exp === "number" && payload.exp > now ? payload : null;
  } catch {
    return null;
  }
}

export type StaffRow = { id: string; venue_id: string; name: string; role: StaffRole; pin_hash: string | null; pin_version: number; active: boolean };
export type OwnVenue = { id: string; slug: string; name: string; currency: string; role_labels: Partial<RoleLabels> | null };

export async function findOwnVenue(slug: string): Promise<OwnVenue | null> {
  const { data, error } = await db().from("venues").select("id, slug, name, currency, role_labels").eq("slug", slug).maybeSingle();
  if (error) throw new Error("Couldn't read the venue");
  return data as OwnVenue | null;
}

export function toMember(row: StaffRow): StaffMember {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    active: row.active,
    hasPin: row.pin_hash !== null,
    accountOwner: false,
    ...(isStaffRole(row.role) && (row.role === "owner" || row.role === "manager")
      ? { inviteUrl: `/signup/invite?${new URLSearchParams({ invite: row.id.slice(0, 8), role: row.role }).toString()}` }
      : {}),
  };
}

export function toSession(venue: OwnVenue, staff: StaffRow): StaffSession {
  return {
    staffId: staff.id,
    name: staff.name,
    role: staff.role,
    roleLabel: roleLabel(venue.role_labels, staff.role),
    venueName: venue.name,
    currency: venue.currency,
  };
}

/** The signed-in person, re-read on every request: deactivation and PIN resets end it at once,
 *  and the role comes from the row, never from the token. */
export async function staffFromToken(request: NextRequest, venueId: string): Promise<StaffRow | null> {
  const payload = verifyStaffToken(request.headers.get(STAFF_TOKEN_HEADER));
  if (!payload || payload.vid !== venueId) return null;
  const { data, error } = await db().from("staff").select("*").eq("id", payload.sid).eq("venue_id", venueId).maybeSingle();
  if (error) throw new Error("Couldn't read staff");
  const row = data as StaffRow | null;
  if (!row || !row.active || row.pin_hash === null || row.pin_version !== payload.ver) return null;
  return row;
}

export type Actor = { kind: "owner" } | { kind: "staff"; staff: StaffRow };

/** The owner's recovery code allows everything. A staff token allows what its role can do. */
export async function requireActor(
  request: NextRequest,
  venue: Pick<OwnVenue, "id">,
  actions: StaffAction | readonly StaffAction[],
): Promise<{ actor: Actor; refused?: undefined } | { actor?: undefined; refused: NextResponse }> {
  const code = request.headers.get("x-venue-key");
  if (code) {
    if ((await findVenueByCode(code)) === venue.id) return { actor: { kind: "owner" } };
    return { refused: await refuseWrongCode(request) };
  }
  if (!request.headers.get(STAFF_TOKEN_HEADER)) return { refused: jsonError(403, NOT_ALLOWED_MESSAGE) };
  const staff = await staffFromToken(request, venue.id);
  if (!staff) return { refused: jsonError(403, SIGNED_OUT_MESSAGE) };
  const needed = typeof actions === "string" ? [actions] : actions;
  if (!needed.some((action) => can(staff.role, action))) return { refused: jsonError(403, NOT_ALLOWED_MESSAGE) };
  return { actor: { kind: "staff", staff } };
}

const STAFF_ERRORS: Record<string, [number, string]> = {
  bad_key: [403, "That recovery code isn't right."],
  pin_taken: [409, "That PIN is already in use."],
  pin_required: [422, "Set a 4-digit PIN for this role."],
  staff_not_found: [404, "That person is no longer on the team."],
  bad_labels: [422, "Those role names aren't valid."],
  bad_branding: [422, "That branding isn't valid."],
  item_not_found: [404, "That item isn't on this menu."],
};

export async function staffDatabaseError(request: NextRequest, message: string): Promise<NextResponse> {
  if (message === "bad_key") return refuseWrongCode(request);
  const known = STAFF_ERRORS[message];
  return known ? jsonError(known[0], known[1]) : databaseError(message);
}
