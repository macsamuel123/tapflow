import type { Touchpoint, Venue } from "@/services/types";

/** The same URL shape a real printed QR uses. */
export function touchpointUrl(origin: string, venue: Pick<Venue, "slug">, tp: Touchpoint): string {
  return `${origin}/v/${venue.slug}/p/${tp.id}?token=${encodeURIComponent(tp.token)}`;
}
