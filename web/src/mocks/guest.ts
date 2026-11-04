import type { Cart, CartLine, Menu, MenuItem as GuestMenuItem } from "@/lib/api-types";
import { checkLine, MAX_CART_LINES, MAX_QUANTITY, type CheckedLine } from "@/lib/cart-rules";
import { allergenLabel } from "@/lib/menu/allergens";
import { quote, type PricingLine } from "@/lib/pricing";
import { MAX_GUEST_NAME } from "@/lib/guest";
import { ServiceError } from "@/services/types";
import type {
  GuestAccess,
  GuestContext,
  GuestService,
  GuestVenue,
  MenuCategory,
  MenuItem,
  Order,
  OrderLine,
  OrderStatus,
  Touchpoint,
} from "@/services/types";
import { taxesFor, YOUR_VENUE_ID } from "./fixtures";
import { photoUrl } from "./photos";
import { readState, update, type DemoState, type StoredCartLine, type Workspace } from "./store";

const NEXT_STEPS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  paid: ["accepted", "cancelled"],
  accepted: ["ready", "cancelled"],
  ready: ["delivered", "picked_up"],
};

export function allowedSteps(order: Pick<Order, "status" | "serviceMode">): OrderStatus[] {
  const closed = order.serviceMode === "pickup" ? "picked_up" : "delivered";
  return (NEXT_STEPS[order.status] ?? []).filter((s) => (s !== "delivered" && s !== "picked_up") || s === closed);
}

export async function withPhotoUrls(menu: MenuCategory[]): Promise<MenuCategory[]> {
  return Promise.all(
    menu.map(async (category) => ({
      ...category,
      items: await Promise.all(
        category.items.map(async (item) => ({ ...item, photoUrl: await photoUrl(item.photoUrl) })),
      ),
    })),
  );
}

type Located = { workspace: Workspace; touchpoint: Touchpoint };

/** By slug and touchpoint together, so a tester's venue named like a demo one can't shadow it. */
function locate(state: DemoState, { slug, touchpointId }: Pick<GuestContext, "slug" | "touchpointId">): Located | null {
  for (const workspace of state.workspaces) {
    if (workspace.venue.slug !== slug) continue;
    const touchpoint = workspace.touchpoints.find((t) => t.id === touchpointId);
    if (touchpoint) return { workspace, touchpoint };
  }
  return null;
}

function access(touchpoint: Touchpoint, token: string | null): GuestAccess {
  if (!touchpoint.active) return "inactive";
  if (!token) return "no-token";
  return token === touchpoint.token ? "verified" : "bad-token";
}

function requireLocated(state: DemoState, context: GuestContext): Located {
  const found = locate(state, context);
  if (!found) throw new ServiceError("This menu isn't available.");
  return found;
}

function items(workspace: Workspace): MenuItem[] {
  return workspace.menu.flatMap((c) => c.items);
}

function guestAllergens(item: MenuItem): string[] {
  const labels = item.allergens.map(allergenLabel);
  const last = labels.at(-1);
  // The item sheet prints these as "Contains: ...", so the sample warning has to travel with them.
  return item.sampleAllergens && last ? [...labels.slice(0, -1), `${last} (sample data)`] : labels;
}

function toGuestItem(item: MenuItem, workspace: Workspace): GuestMenuItem {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    price_cents: item.priceCents,
    image_url: item.photoUrl,
    ingredients: [],
    allergens: guestAllergens(item),
    dietary_tags: [],
    in_stock: item.inStock,
    tax_category: {
      name: item.taxCategory,
      taxes: taxesFor(item.taxCategory, workspace.taxes).map((t) => ({
        code: t.code,
        name: t.name,
        rate_bps: t.rateBps,
      })),
    },
    modifier_groups: item.optionGroups.map((g) => ({
      id: g.id,
      name: g.name,
      min_select: g.minPicks,
      max_select: g.maxPicks,
      required: g.required,
      modifiers: g.options.map((o) => ({
        id: o.id,
        name: o.name,
        price_delta_cents: o.priceDeltaCents,
        in_stock: true,
      })),
    })),
  };
}

async function toGuestMenu(workspace: Workspace): Promise<Menu> {
  const categories = await withPhotoUrls(workspace.menu);
  return {
    venue: { slug: workspace.venue.slug, name: workspace.venue.name, currency: workspace.venue.currency },
    categories: categories
      .filter((c) => c.items.length > 0)
      .map((c) => ({ id: c.id, name: c.name, items: c.items.map((i) => toGuestItem(i, workspace)) })),
  };
}

function checked(workspace: Workspace, line: StoredCartLine) {
  const item = items(workspace).find((i) => i.id === line.itemId);
  return { item, result: checkLine(item, line.optionIds, line.quantity) };
}

function pricingLines(workspace: Workspace, lines: { item: MenuItem; result: CheckedLine }[]): PricingLine[] {
  return lines.map(({ item, result }) => ({
    amountCents: result.lineTotalCents,
    taxes: taxesFor(item.taxCategory, workspace.taxes),
  }));
}

/** Always priced from the current menu. Stored lines hold no amounts at all. */
function buildCart({ workspace, touchpoint }: Located, verified: boolean): Cart {
  const stored = workspace.carts[touchpoint.id] ?? [];
  const priced: { item: MenuItem; result: CheckedLine }[] = [];
  const lines = stored.map((line): CartLine => {
    const { item, result } = checked(workspace, line);
    const base = {
      id: line.id,
      item_id: line.itemId,
      name: item?.name ?? "Unavailable item",
      quantity: line.quantity,
      notes: line.notes,
    };
    if (typeof result === "string" || !item) {
      const problem = typeof result === "string" ? result : "That item isn't on this menu.";
      return { ...base, modifiers: [], unit_price_cents: 0, line_total_cents: 0, available: false, problem };
    }
    priced.push({ item, result });
    return {
      ...base,
      modifiers: result.options.map((o) => ({ id: o.id, name: o.name, price_delta_cents: o.priceDeltaCents })),
      unit_price_cents: result.unitPriceCents,
      line_total_cents: result.lineTotalCents,
      available: true,
      problem: null,
    };
  });
  const q = quote(pricingLines(workspace, priced), 0);
  const available = lines.filter((l) => l.available);
  return {
    currency: workspace.venue.currency,
    lines,
    item_count: available.reduce((sum, l) => sum + l.quantity, 0),
    subtotal_cents: q.subtotalCents,
    tax_breakdown: q.taxLines.map((t) => ({
      code: t.code,
      name: t.name,
      rate_bps: t.rateBps,
      base_cents: t.baseCents,
      tax_cents: t.taxCents,
    })),
    tax_cents: q.taxCents,
    tip_cents: q.tipCents,
    total_cents: q.totalCents,
    verified,
    can_checkout: verified && lines.length > 0 && available.length === lines.length,
  };
}

function cartOf(context: GuestContext): Cart {
  const found = requireLocated(readState(), context);
  return buildCart(found, access(found.touchpoint, context.token) === "verified");
}

function changeCart(context: GuestContext, change: (cart: StoredCartLine[], found: Located) => StoredCartLine[]): Cart {
  update((state) => {
    const found = requireLocated(state, context);
    const { workspace, touchpoint } = found;
    workspace.carts[touchpoint.id] = change(workspace.carts[touchpoint.id] ?? [], found);
  });
  return cartOf(context);
}

function sameChoice(line: StoredCartLine, itemId: string, optionIds: string[], notes: string): boolean {
  return (
    line.itemId === itemId &&
    line.notes === notes &&
    [...line.optionIds].sort().join() === [...optionIds].sort().join()
  );
}

export const guestService: GuestService = {
  async open(context) {
    const found = locate(readState(), context);
    if (!found) return null;
    const { workspace, touchpoint } = found;
    const venue: GuestVenue = {
      menu: await toGuestMenu(workspace),
      touchpointLabel: touchpoint.label,
      serviceMode: touchpoint.serviceMode,
      access: access(touchpoint, context.token),
      localOnly: workspace.id === YOUR_VENUE_ID,
    };
    return venue;
  },

  async getCart(context) {
    return cartOf(context);
  },

  async addItem(context, line) {
    return changeCart(context, (cart, { workspace }) => {
      const item = items(workspace).find((i) => i.id === line.item_id);
      const problem = checkLine(item, line.modifier_ids, line.quantity);
      if (typeof problem === "string") throw new ServiceError(problem);
      const existing = cart.find((l) => sameChoice(l, line.item_id, line.modifier_ids, line.notes));
      if (existing) {
        if (existing.quantity + line.quantity > MAX_QUANTITY) {
          throw new ServiceError(`You can order at most ${MAX_QUANTITY} of the same item.`);
        }
        existing.quantity += line.quantity;
        return cart;
      }
      if (cart.length >= MAX_CART_LINES) throw new ServiceError("Your cart is full.");
      return [
        ...cart,
        {
          id: crypto.randomUUID(),
          itemId: line.item_id,
          optionIds: line.modifier_ids,
          quantity: line.quantity,
          notes: line.notes,
        },
      ];
    });
  },

  async updateLine(context, lineId, quantity) {
    return changeCart(context, (cart) =>
      cart.map((l) => (l.id === lineId ? { ...l, quantity: Math.min(Math.max(quantity, 1), MAX_QUANTITY) } : l)),
    );
  },

  async removeLine(context, lineId) {
    return changeCart(context, (cart) => cart.filter((l) => l.id !== lineId));
  },

  async placeOrder(context, guestName) {
    const orderId = crypto.randomUUID();
    update((state) => {
      const { workspace, touchpoint } = requireLocated(state, context);
      if (access(touchpoint, context.token) !== "verified") {
        throw new ServiceError("Scan the QR on your touchpoint to check out.");
      }
      const name = guestName?.trim() ?? "";
      const pickup = touchpoint.serviceMode === "pickup";
      if (pickup && !name) throw new ServiceError("Enter your first name so we can call your order.");
      if (name.length > MAX_GUEST_NAME) throw new ServiceError(`Use ${MAX_GUEST_NAME} characters or fewer.`);

      const stored = workspace.carts[touchpoint.id] ?? [];
      if (stored.length === 0) throw new ServiceError("Your cart is empty.");
      const priced: { item: MenuItem; result: CheckedLine }[] = [];
      const lines: OrderLine[] = stored.map((line) => {
        const { item, result } = checked(workspace, line);
        if (typeof result === "string" || !item) {
          throw new ServiceError(typeof result === "string" ? result : "An item in your cart is unavailable.");
        }
        priced.push({ item, result });
        return {
          name: item.name,
          quantity: line.quantity,
          unitPriceCents: result.unitPriceCents,
          options: result.options.map((o) => o.name),
          notes: line.notes,
        };
      });
      const q = quote(pricingLines(workspace, priced), 0);
      workspace.orders.unshift({
        id: orderId,
        ticketNumber: Math.max(0, ...workspace.orders.map((o) => o.ticketNumber)) + 1,
        serviceMode: touchpoint.serviceMode,
        touchpointLabel: touchpoint.label,
        guestName: pickup ? name : null,
        status: "paid",
        placedAt: new Date().toISOString(),
        lines,
        subtotalCents: q.subtotalCents,
        taxCents: q.taxCents,
        totalCents: q.totalCents,
      });
      workspace.carts[touchpoint.id] = [];
    });
    return orderId;
  },

  async getOrder(slug, orderId) {
    for (const workspace of readState().workspaces) {
      if (workspace.venue.slug !== slug) continue;
      const order = workspace.orders.find((o) => o.id === orderId);
      if (order) {
        return {
          id: order.id,
          venueName: workspace.venue.name,
          currency: workspace.venue.currency,
          ticketNumber: order.ticketNumber,
          serviceMode: order.serviceMode,
          touchpointLabel: order.touchpointLabel,
          guestName: order.guestName,
          status: order.status,
          lines: order.lines,
          subtotalCents: order.subtotalCents,
          taxCents: order.taxCents,
          totalCents: order.totalCents,
        };
      }
    }
    return null;
  },

  async simulateNextStep(slug, orderId) {
    update((state) => {
      for (const workspace of state.workspaces) {
        if (workspace.venue.slug !== slug) continue;
        const order = workspace.orders.find((o) => o.id === orderId);
        const next = order && allowedSteps(order).find((s) => s !== "cancelled");
        if (order && next) order.status = next;
      }
    });
  },
};
