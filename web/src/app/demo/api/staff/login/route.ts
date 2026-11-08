import { NextResponse, type NextRequest } from "next/server";
import { DEMO_CLOUD, WRITES_PER_MINUTE } from "@/lib/demo-cloud/config";
import { clientKey, databaseError, jsonError, readJson } from "@/lib/demo-cloud/server";
import { findOwnVenue, hashPin, signStaffToken, toSession, type StaffRow } from "@/lib/demo-cloud/staff";
import { db } from "@/lib/demo-cloud/venues";
import { LOCKED_MESSAGE } from "@/lib/staff/permissions";

type LoginRow = { result: "ok" | "wrong_pin" | "locked"; staff_id: string | null; tries_left: number };

/** A 4-digit PIN for a venue → a short-lived signed staff token. 5 wrong PINs lock the venue's
 *  PIN login for a minute, and the database checks the lock before the PIN. */
export async function POST(request: NextRequest) {
  if (!DEMO_CLOUD) return jsonError(404, "Not found");
  const body = (await readJson(request)) as { slug?: unknown; pin?: unknown } | null;
  const venue = typeof body?.slug === "string" ? await findOwnVenue(body.slug) : null;
  if (!venue) return jsonError(404, "We can't find this venue.");

  const limit = await db().rpc("take_rate_limit", { p_bucket: `staff-login:${clientKey(request)}`, p_max: WRITES_PER_MINUTE });
  if (limit.error) return databaseError(limit.error.message);

  // A malformed PIN still counts as a wrong try, so it can't be used to probe the lock.
  const pin = typeof body?.pin === "string" && /^\d{4}$/.test(body.pin) ? body.pin : "invalid";
  const { data, error } = await db().rpc("staff_login", { p_venue: venue.id, p_pin_hash: hashPin(venue.id, pin) });
  if (error) return databaseError(error.message);
  const row = (data as LoginRow[])[0];
  if (!row || row.result === "locked") return NextResponse.json({ status: "locked", error: LOCKED_MESSAGE }, { status: 423 });
  if (row.result === "wrong_pin" || !row.staff_id) {
    return NextResponse.json({ status: "wrong_pin", triesLeft: row.tries_left, error: "That PIN isn't right." }, { status: 401 });
  }
  const staff = await db().from("staff").select("*").eq("id", row.staff_id).single();
  if (staff.error) return databaseError(staff.error.message);
  const member = staff.data as StaffRow;
  return NextResponse.json({
    status: "ok",
    token: signStaffToken({ sid: member.id, vid: venue.id, ver: member.pin_version }),
    session: toSession(venue, member),
  });
}
