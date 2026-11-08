import "server-only";

import type { NextRequest, NextResponse } from "next/server";
import type { Branding } from "@/services/types";
import { BRANDING_BUCKET } from "./config";
import { adminClient } from "./server";
import { staffDatabaseError } from "./staff";
import { db, hashCode, photoPrefix, readBranding } from "./venues";

export async function currentBranding(venueId: string): Promise<Branding | null> {
  const { data, error } = await db().from("venues").select("branding").eq("id", venueId).maybeSingle();
  if (error) throw new Error("Couldn't read the venue");
  return data ? readBranding(data.branding) : null;
}

/** Only images we host for this venue: a profile must not load images from anywhere else. */
export function ownImage(venueId: string, url: unknown): string | null {
  return typeof url === "string" && url.startsWith(photoPrefix(venueId, BRANDING_BUCKET)) ? url : null;
}

/** The database checks the recovery code: a missing or wrong one is refused there. */
export async function saveBranding(
  request: NextRequest,
  venueId: string,
  branding: Branding,
): Promise<{ branding: Branding } | { refused: NextResponse }> {
  const { data, error } = await db().rpc("save_branding", {
    p_venue: venueId,
    p_key_hash: hashCode(request.headers.get("x-venue-key") ?? ""),
    p_branding: branding,
  });
  if (error) return { refused: await staffDatabaseError(request, error.message) };
  return { branding: readBranding(data) };
}

export async function removeBrandImage(venueId: string, url: string | null): Promise<void> {
  const prefix = photoPrefix(venueId, BRANDING_BUCKET);
  if (!url?.startsWith(prefix)) return;
  await adminClient().storage.from(BRANDING_BUCKET).remove([`${venueId}/${url.slice(prefix.length)}`]);
}
