import { DEMO_MODE } from "@/lib/demo";
import type { Branding, MenuCategory, RoleLabels, Touchpoint, Venue } from "@/services/types";

/** The fixed demo venues share orders across devices. Off: the same-browser demo from S0.2. */
export const DEMO_CLOUD = DEMO_MODE && process.env.NEXT_PUBLIC_DEMO_CLOUD === "true";

export const SHARED_DEMO_NOTE = "Shared demo — other testers may see these orders";
export const READ_ONLY_NOTE = "Sign up to edit your own venue";
export const CHECKOUT_NOTE = "Demo — don't enter real personal information.";

export const SHARED_SLUGS: readonly string[] = ["demo-brewery", "demo-food-truck"];

export const CLOUD_VENUE_NOTE = "Demo venue — deleted after 14 days of inactivity";
export const VENUE_NOT_FOUND_NOTE = "It may have been deleted after 14 days of inactivity.";

export const MAX_VENUE_ITEMS = 300;
export const MAX_VENUE_TOUCHPOINTS = 500;
export const MAX_VENUE_PHOTOS = 50;
export const MAX_PHOTO_UPLOAD_BYTES = 500_000;
export const VENUES_PER_DAY = 5;
export const KEY_TRIES_PER_MINUTE = 10;
export const VENUE_EDITS_PER_MINUTE = 120;
export const PHOTO_BUCKET = "demo-menu";
export const BRANDING_BUCKET = "demo-branding";

export const MAX_ORDER_LINES = 20;
export const ORDERS_PER_MINUTE = 10;
export const WRITES_PER_MINUTE = 60;
export const ADMIN_TRIES_PER_MINUTE = 5;

export type DemoOrderRow = {
  id: string;
  venue_slug: string;
  touchpoint_id: string;
  touchpoint_label: string;
  service_mode: "delivery" | "pickup";
  items: { name: string; quantity: number; unitPriceCents: number; options: string[]; notes: string }[];
  subtotal_cents: number;
  tax_lines: { code: string; name: string; rateBps: number; baseCents: number; taxCents: number }[];
  tax_cents: number;
  tip_cents: number;
  total_cents: number;
  guest_name: string | null;
  ticket_number: number;
  status: "paid" | "accepted" | "ready" | "delivered" | "picked_up" | "cancelled";
  created_at: string;
};

export type DemoStockRow = { item_id: string; sold_out: boolean };

/** A tester's venue as the server holds it. Only an owner gets one, because it has QR tokens. */
export type VenueSnapshot = {
  venue: Venue;
  version: number;
  sampleMenu: boolean;
  menu: MenuCategory[];
  touchpoints: Touchpoint[];
  branding: Branding;
  roleLabels: Partial<RoleLabels>;
};
