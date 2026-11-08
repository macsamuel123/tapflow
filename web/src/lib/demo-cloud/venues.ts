import "server-only";

import { createHash, randomInt } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { ALLERGENS } from "@/lib/menu/allergens";
import { GST, PST } from "@/mocks/fixtures";
import type { MenuCategory, MenuItem, OptionGroup, Touchpoint } from "@/services/types";
import {
  KEY_TRIES_PER_MINUTE,
  MAX_VENUE_ITEMS,
  MAX_VENUE_TOUCHPOINTS,
  PHOTO_BUCKET,
  type VenueSnapshot,
} from "./config";
import type { PricingVenue } from "./order-request";
import { adminClient, clientKey, databaseError, jsonError } from "./server";

// No 0, O, 1, I or L: this gets written down and typed back in.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_GROUPS = 4;
const CODE_GROUP_LENGTH = 4;
const ALLERGEN_IDS: readonly string[] = ALLERGENS.map((a) => a.id);
const EXPIRED_PER_RUN = 50;
const MAX_CENTS = 100_000_000;

/** About 100 random bits, so a fast hash is fine: there's no chosen password to guess. */
export function newRecoveryCode(): string {
  const group = () =>
    Array.from({ length: CODE_GROUP_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  return `TF-${Array.from({ length: CODE_GROUPS }, group).join("-")}`;
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function hashCode(code: string): string {
  return createHash("sha256").update(normalizeCode(code)).digest("hex");
}

export type ProblemOr<T> = { problem: string; value?: undefined } | { problem?: undefined; value: T };

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim().length <= max ? value.trim() : null;
}

function cents(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_CENTS ? (value as number) : null;
}

function cleanGroup(raw: Record<string, unknown>): OptionGroup | null {
  const options = Array.isArray(raw.options) ? (raw.options as Record<string, unknown>[]) : [];
  const name = text(raw.name, 80);
  const min = raw.minPicks;
  const max = raw.maxPicks;
  if (!name || !options.length || typeof min !== "number" || typeof max !== "number") return null;
  const cleaned = options.map((o) => ({ id: text(o.id, 60), name: text(o.name, 80), priceDeltaCents: cents(o.priceDeltaCents) }));
  if (cleaned.some((o) => !o.id || !o.name || o.priceDeltaCents === null)) return null;
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || min > max || max > options.length || max > 20) return null;
  const required = raw.required === true;
  if (required !== min >= 1) return null;
  return {
    id: text(raw.id, 60) ?? "",
    name,
    required,
    minPicks: min,
    maxPicks: max,
    options: cleaned as OptionGroup["options"],
  };
}

function photoPrefix(venueId: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${venueId}/`;
}

function cleanItem(raw: Record<string, unknown>, venueId: string): MenuItem | null {
  const name = text(raw.name, 80);
  const priceCents = cents(raw.priceCents);
  const id = text(raw.id, 60);
  if (!id || !name || priceCents === null) return null;
  const allergens = Array.isArray(raw.allergens) ? (raw.allergens as string[]).filter((a) => ALLERGEN_IDS.includes(a)) : [];
  const rawGroups = Array.isArray(raw.optionGroups) ? (raw.optionGroups as Record<string, unknown>[]) : [];
  const optionGroups = rawGroups.map(cleanGroup);
  if (optionGroups.some((g) => g === null)) return null;
  // Only photos we host: a menu must not be able to load images from anywhere else.
  const photo = typeof raw.photoUrl === "string" && raw.photoUrl.startsWith(photoPrefix(venueId)) ? raw.photoUrl : null;
  return {
    id,
    name,
    description: text(raw.description, 300) ?? "",
    priceCents,
    taxCategory: raw.taxCategory === "Alcohol" ? "Alcohol" : "Food",
    inStock: raw.inStock !== false,
    allergens: allergens as MenuItem["allergens"],
    allergensDeclared: raw.allergensDeclared === true,
    otherAllergens: text(raw.otherAllergens, 120) ?? "",
    taxNote: text(raw.taxNote, 80) || null,
    sampleAllergens: raw.sampleAllergens === true,
    optionGroups: optionGroups as OptionGroup[],
    photoUrl: photo,
  };
}

/** Everything is rebuilt field by field, so nothing unknown is ever stored. */
export function cleanMenu(raw: unknown, venueId: string): ProblemOr<MenuCategory[]> {
  if (!Array.isArray(raw)) return { problem: "That menu isn't valid." };
  const count = raw.reduce((sum: number, c) => sum + (Array.isArray(c?.items) ? c.items.length : 0), 0);
  if (count > MAX_VENUE_ITEMS) return { problem: `A venue can have up to ${MAX_VENUE_ITEMS} items. This menu has ${count}.` };
  const menu: MenuCategory[] = [];
  for (const category of raw as Record<string, unknown>[]) {
    const name = text(category.name, 80);
    const id = text(category.id, 60);
    const items = (Array.isArray(category.items) ? category.items : []) as Record<string, unknown>[];
    const cleaned = items.map((item) => cleanItem(item, venueId));
    if (!name || !id || cleaned.some((i) => i === null)) return { problem: "That menu isn't valid." };
    menu.push({ id, name, items: cleaned as MenuItem[] });
  }
  return { value: menu };
}

export function cleanTouchpoints(raw: unknown, previous: readonly Touchpoint[]): ProblemOr<unknown[]> {
  if (!Array.isArray(raw) || raw.length === 0) return { problem: "A venue needs at least one touchpoint." };
  if (raw.length > MAX_VENUE_TOUCHPOINTS) return { problem: `A venue can have up to ${MAX_VENUE_TOUCHPOINTS} touchpoints.` };
  const stored = new Map(previous.map((t) => [t.id, t.token]));
  const rows = [];
  for (const t of raw as Record<string, unknown>[]) {
    const id = text(t.id, 60);
    const label = text(t.label, 80);
    if (!id || !label || (t.serviceMode !== "delivery" && t.serviceMode !== "pickup")) {
      return { problem: "Those touchpoints aren't valid." };
    }
    rows.push({
      id,
      label,
      service_mode: t.serviceMode,
      spot_number: Number.isInteger(t.spotNumber) ? t.spotNumber : null,
      active: t.active !== false,
      // A different token means Regenerate. The database issues the new one.
      token: stored.has(id) && stored.get(id) !== t.token ? "regenerate" : "keep",
    });
  }
  return { value: rows };
}

export function db() {
  return adminClient().schema("demo");
}

async function touchpointsOf(venueId: string): Promise<Touchpoint[]> {
  const [points, secrets] = await Promise.all([
    db().from("touchpoints").select("id, label, service_mode, spot_number, active").eq("venue_id", venueId).order("sort_order"),
    db().from("touchpoint_secrets").select("touchpoint_id, token").eq("venue_id", venueId),
  ]);
  if (points.error || secrets.error) throw new Error("Couldn't read touchpoints");
  const tokens = new Map(secrets.data.map((s) => [s.touchpoint_id as string, s.token as string]));
  return points.data.map((t) => ({
    id: t.id as string,
    label: t.label as string,
    serviceMode: t.service_mode as Touchpoint["serviceMode"],
    spotNumber: t.spot_number as number | null,
    active: t.active as boolean,
    token: tokens.get(t.id as string) ?? "",
  }));
}

export async function loadSnapshot(venueId: string): Promise<VenueSnapshot | null> {
  const [venue, menu] = await Promise.all([
    db().from("venues").select("*").eq("id", venueId).maybeSingle(),
    db().from("venue_menus").select("menu").eq("venue_id", venueId).maybeSingle(),
  ]);
  if (venue.error || menu.error) throw new Error("Couldn't read the venue");
  if (!venue.data || !menu.data) return null;
  const v = venue.data;
  return {
    venue: { id: v.id, slug: v.slug, name: v.name, industry: v.industry, venueType: null, country: v.country, region: v.region, currency: v.currency },
    version: v.menu_version,
    sampleMenu: v.sample_menu,
    menu: menu.data.menu as MenuCategory[],
    touchpoints: await touchpointsOf(venueId),
  };
}

export async function loadPricingVenue(slug: string): Promise<PricingVenue | null> {
  const found = await db().from("venues").select("id").eq("slug", slug).maybeSingle();
  if (found.error || !found.data) return null;
  const snapshot = await loadSnapshot(found.data.id as string);
  return snapshot && { venue: snapshot.venue, menu: snapshot.menu, touchpoints: snapshot.touchpoints, taxes: [GST, PST] };
}

/** Wrong codes are rate limited, so they can't be guessed even at this length. */
async function refuseKey(request: NextRequest): Promise<NextResponse> {
  const attempt = await db().rpc("take_rate_limit", {
    p_bucket: `venue-key:${clientKey(request)}`,
    p_max: KEY_TRIES_PER_MINUTE,
  });
  return attempt.error ? databaseError(attempt.error.message) : jsonError(403, "That recovery code isn't right.");
}

export async function findVenueByCode(code: string): Promise<string | null> {
  const { data, error } = await db().from("venue_keys").select("venue_id").eq("key_hash", hashCode(code)).maybeSingle();
  if (error) throw new Error("Couldn't check the code");
  return (data?.venue_id as string | undefined) ?? null;
}

export async function refuseWrongCode(request: NextRequest): Promise<NextResponse> {
  return refuseKey(request);
}

/** Null when the caller holds this venue's recovery code. Otherwise, the response to send. */
export async function requireOwner(request: NextRequest, venueId: string): Promise<NextResponse | null> {
  const code = request.headers.get("x-venue-key");
  if (code && (await findVenueByCode(code)) === venueId) return null;
  return refuseKey(request);
}

export async function requireOwnerOfSlug(request: NextRequest, slug: string): Promise<NextResponse | null> {
  const found = await db().from("venues").select("id").eq("slug", slug).maybeSingle();
  if (found.error) return databaseError(found.error.message);
  if (!found.data) return jsonError(404, "That venue no longer exists.");
  return requireOwner(request, found.data.id as string);
}

export async function removePhotos(venueId: string): Promise<void> {
  const bucket = adminClient().storage.from(PHOTO_BUCKET);
  const { data } = await bucket.list(venueId, { limit: 1000 });
  if (data?.length) await bucket.remove(data.map((file) => `${venueId}/${file.name}`));
}

/** Files first: if this fails halfway, the row survives and the next run tries again. */
export async function deleteVenue(venueId: string, slug: string): Promise<void> {
  await removePhotos(venueId);
  const { error } = await db().rpc("delete_venue", { p_slug: slug });
  if (error) throw new Error("Couldn't delete the venue");
}

export async function deleteExpiredVenues(): Promise<number> {
  const { data, error } = await db().rpc("expired_venues", { p_limit: EXPIRED_PER_RUN });
  if (error) throw new Error("Couldn't list expired venues");
  const expired = data as { id: string; slug: string }[];
  for (const venue of expired) await deleteVenue(venue.id, venue.slug);
  return expired.length;
}
