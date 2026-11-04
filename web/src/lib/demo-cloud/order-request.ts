// Turns a guest's order request into a priced order. Runs on the server, against the code
// menus. A request is only ever choices: any amount it contains is ignored.
import { checkLine } from "@/lib/cart-rules";
import { cleanGuestName, MAX_GUEST_NAME } from "@/lib/guest";
import { quote } from "@/lib/pricing";
import { demoBrewery, demoFoodTruck, taxesFor } from "@/mocks/fixtures";
import type { Workspace } from "@/mocks/store";
import type { MenuItem, Touchpoint } from "@/services/types";
import { MAX_ORDER_LINES } from "./config";

const MAX_NOTES = 200;
const VENUES = [demoBrewery(), demoFoodTruck()];

export type PricedOrder = {
  venue_slug: string;
  touchpoint_id: string;
  touchpoint_label: string;
  service_mode: Touchpoint["serviceMode"];
  items: { name: string; quantity: number; unitPriceCents: number; options: string[]; notes: string }[];
  subtotal_cents: number;
  tax_lines: unknown[];
  tax_cents: number;
  total_cents: number;
  guest_name: string | null;
};

export type Rejection = { status: number; error: string };

export function demoVenue(slug: unknown): Workspace | undefined {
  return VENUES.find((v) => v.venue.slug === slug);
}

export function demoItem(venue: Workspace, itemId: unknown): MenuItem | undefined {
  return venue.menu.flatMap((c) => c.items).find((i) => i.id === itemId);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringList(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? (value as string[]) : null;
}

export function priceOrder(body: unknown, soldOut: ReadonlyMap<string, boolean>): PricedOrder | Rejection {
  const request = record(body);
  if (!request) return { status: 400, error: "That request isn't valid." };
  const venue = demoVenue(request.slug);
  const touchpoint = venue?.touchpoints.find((t) => t.id === request.touchpointId);
  if (!venue || !touchpoint) return { status: 404, error: "This menu isn't available." };
  if (request.token !== touchpoint.token) {
    return { status: 403, error: "Scan the QR on your touchpoint to check out." };
  }

  const lines = request.lines;
  if (!Array.isArray(lines) || lines.length === 0) return { status: 422, error: "Your cart is empty." };
  if (lines.length > MAX_ORDER_LINES) {
    return { status: 422, error: `An order can have up to ${MAX_ORDER_LINES} items.` };
  }

  const pickup = touchpoint.serviceMode === "pickup";
  const guestName = cleanGuestName(typeof request.guestName === "string" ? request.guestName : "");
  if (pickup && !guestName) return { status: 422, error: "Enter your first name so we can call your order." };
  if (guestName.length > MAX_GUEST_NAME) return { status: 422, error: `Use ${MAX_GUEST_NAME} characters or fewer.` };

  const items: PricedOrder["items"] = [];
  const priced = [];
  for (const raw of lines) {
    const line = record(raw);
    const optionIds = stringList(line?.optionIds ?? []);
    const quantity = line?.quantity;
    const notes = typeof line?.notes === "string" ? line.notes.trim() : "";
    if (!line || !optionIds || typeof quantity !== "number" || !Number.isInteger(quantity) || notes.length > MAX_NOTES) {
      return { status: 422, error: "An item in your cart isn't valid." };
    }
    const base = demoItem(venue, line.itemId);
    const item = base ? { ...base, inStock: !(soldOut.get(base.id) ?? !base.inStock) } : undefined;
    const result = checkLine(item, optionIds, quantity);
    if (typeof result === "string" || !item) {
      return { status: 409, error: typeof result === "string" ? result : "An item in your cart is unavailable." };
    }
    items.push({
      name: item.name,
      quantity,
      unitPriceCents: result.unitPriceCents,
      options: result.options.map((o) => o.name),
      notes,
    });
    priced.push({ amountCents: result.lineTotalCents, taxes: taxesFor(item.taxCategory, venue.taxes) });
  }

  const q = quote(priced, 0);
  return {
    venue_slug: venue.venue.slug,
    touchpoint_id: touchpoint.id,
    touchpoint_label: touchpoint.label,
    service_mode: touchpoint.serviceMode,
    items,
    subtotal_cents: q.subtotalCents,
    tax_lines: q.taxLines,
    tax_cents: q.taxCents,
    total_cents: q.totalCents,
    guest_name: pickup ? guestName : null,
  };
}
