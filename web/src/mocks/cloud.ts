// The shared demo: mock services, with the fixed demo venues' orders and sold-out state moved to
// the cloud. A tester's own venue falls through to the same-browser mock.
import { postJson, fetchOrder, fetchOrders, fetchStock } from "@/lib/demo-cloud/browser";
import { READ_ONLY_NOTE, SHARED_SLUGS, type DemoOrderRow } from "@/lib/demo-cloud/config";
import { ServiceError } from "@/services/types";
import type { GuestContext, GuestOrder, GuestService, Order, OrderStatus, Services } from "@/services/types";
import { demoBrewery, demoFoodTruck, YOUR_VENUE_ID } from "./fixtures";
import { activeWorkspace, readState, update } from "./store";

const FIXED_MENUS = [demoBrewery(), demoFoodTruck()];

function inOwnVenue(): boolean {
  return activeWorkspace(readState()).id === YOUR_VENUE_ID;
}

function isShared(context: Pick<GuestContext, "slug" | "touchpointId">): boolean {
  return FIXED_MENUS.some(
    (w) => w.venue.slug === context.slug && w.touchpoints.some((t) => t.id === context.touchpointId),
  );
}

function requireOwnVenue(): void {
  if (!inOwnVenue()) throw new ServiceError(`${READ_ONLY_NOTE}.`);
}

/** Copies the shared sold-out state over the fixed menu kept in this browser. */
async function syncStock(slug: string): Promise<void> {
  const fixed = FIXED_MENUS.find((w) => w.venue.slug === slug);
  if (!fixed) return;
  const overrides = new Map((await fetchStock(slug)).map((row) => [row.item_id, row.sold_out]));
  const defaults = new Map(fixed.menu.flatMap((c) => c.items).map((i) => [i.id, i.inStock]));
  const local = readState().workspaces.find((w) => w.id === fixed.id);
  const stale = local?.menu.flatMap((c) => c.items).some((i) => {
    const expected = overrides.has(i.id) ? !overrides.get(i.id) : defaults.get(i.id);
    return i.inStock !== expected;
  });
  if (local && !stale) return;
  update((state) => {
    for (const item of state.workspaces.find((w) => w.id === fixed.id)?.menu.flatMap((c) => c.items) ?? []) {
      item.inStock = overrides.has(item.id) ? !overrides.get(item.id) : (defaults.get(item.id) ?? item.inStock);
    }
  });
}

/** The menu still loads if this read fails. The server checks stock again at checkout. */
async function trySyncStock(slug: string): Promise<void> {
  try {
    await syncStock(slug);
  } catch {
    // Keep showing the last known state.
  }
}

function toOrder(row: DemoOrderRow): Order {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    serviceMode: row.service_mode,
    touchpointLabel: row.touchpoint_label,
    guestName: row.guest_name,
    status: row.status,
    placedAt: row.created_at,
    lines: row.items,
    subtotalCents: row.subtotal_cents,
    taxCents: row.tax_cents,
    totalCents: row.total_cents,
  };
}

function nextStep(row: DemoOrderRow): OrderStatus | null {
  if (row.status === "paid") return "accepted";
  if (row.status === "accepted") return "ready";
  if (row.status !== "ready") return null;
  return row.service_mode === "pickup" ? "picked_up" : "delivered";
}

function setStatus(id: string, status: OrderStatus) {
  return postJson(`/demo/api/orders/${id}/status`, { status });
}

export function cloudServices(mock: Services): Services {
  const { guest, menu, orders, touchpoints, venues } = mock;
  const currentSlug = () => activeWorkspace(readState()).venue.slug;

  const cloudGuest: GuestService = {
    ...guest,
    async open(context) {
      if (isShared(context)) await trySyncStock(context.slug);
      return guest.open(context);
    },
    async getCart(context) {
      if (isShared(context)) await trySyncStock(context.slug);
      return guest.getCart(context);
    },
    async addItem(context, line) {
      if (isShared(context)) await trySyncStock(context.slug);
      return guest.addItem(context, line);
    },
    async placeOrder(context, guestName) {
      if (!isShared(context)) return guest.placeOrder(context, guestName);
      const lines = readCartLines(context.touchpointId, context.slug);
      const { id } = await postJson<{ id: string }>("/demo/api/orders", {
        slug: context.slug,
        touchpointId: context.touchpointId,
        token: context.token,
        guestName,
        lines,
      });
      update((state) => {
        const workspace = state.workspaces.find((w) => w.venue.slug === context.slug && w.id !== YOUR_VENUE_ID);
        if (workspace) workspace.carts[context.touchpointId] = [];
      });
      return id;
    },
    async getOrder(slug, orderId) {
      if (!SHARED_SLUGS.includes(slug)) return guest.getOrder(slug, orderId);
      const row = await fetchOrder(orderId);
      if (!row) return guest.getOrder(slug, orderId);
      const venue = FIXED_MENUS.find((w) => w.venue.slug === slug)?.venue;
      const order: GuestOrder = {
        ...toOrder(row),
        venueName: venue?.name ?? slug,
        currency: venue?.currency ?? "CAD",
      };
      return order;
    },
    async simulateNextStep(slug, orderId) {
      const row = SHARED_SLUGS.includes(slug) ? await fetchOrder(orderId) : null;
      if (!row) return guest.simulateNextStep(slug, orderId);
      const next = nextStep(row);
      if (next) await setStatus(orderId, next);
    },
  };

  return {
    ...mock,
    guest: cloudGuest,
    venues: {
      ...venues,
      async isSharedDemo() {
        return !inOwnVenue();
      },
      async updateDetails(details) {
        requireOwnVenue();
        return venues.updateDetails(details);
      },
    },
    orders: {
      ...orders,
      async list() {
        return inOwnVenue() ? orders.list() : (await fetchOrders(currentSlug())).map(toOrder);
      },
      async summary() {
        if (inOwnVenue()) return orders.summary();
        const placed = (await fetchOrders(currentSlug())).filter((o) => o.status !== "cancelled");
        const revenueCents = placed.reduce((sum, o) => sum + o.total_cents, 0);
        const twice = 2 * revenueCents + placed.length;
        const divisor = 2 * placed.length;
        return {
          ordersToday: placed.length,
          revenueCents,
          averageTicketCents: divisor ? (twice - (twice % divisor)) / divisor : 0,
        };
      },
      async setStatus(id, status) {
        if (inOwnVenue()) return orders.setStatus(id, status);
        await setStatus(id, status);
      },
    },
    menu: {
      ...menu,
      async list() {
        if (!inOwnVenue()) await syncStock(currentSlug());
        return menu.list();
      },
      async isSample() {
        return inOwnVenue() ? menu.isSample() : false;
      },
      async setInStock(itemId, inStock) {
        if (inOwnVenue()) return menu.setInStock(itemId, inStock);
        await postJson("/demo/api/stock", { slug: currentSlug(), itemId, soldOut: !inStock });
      },
      ...guarded(menu, [
        "clearSample", "addCategory", "renameCategory", "reorderCategories", "deleteCategory",
        "addItem", "updateItem", "deleteItem", "setAllergens", "setPhoto", "removePhoto", "importRows",
      ]),
    },
    touchpoints: {
      ...touchpoints,
      ...guarded(touchpoints, ["applySetup", "addSpots", "addPickup", "removePickup", "setActive", "regenerateQr"]),
    },
  };
}

function guarded<S extends object, K extends keyof S>(service: S, names: readonly K[]): Pick<S, K> {
  const entries = names.map((name) => {
    const method = service[name] as (...args: unknown[]) => Promise<unknown>;
    const wrapped = async (...args: unknown[]) => {
      requireOwnVenue();
      return method(...args);
    };
    return [name, wrapped];
  });
  return Object.fromEntries(entries) as Pick<S, K>;
}

function readCartLines(touchpointId: string, slug: string) {
  const workspace = readState().workspaces.find((w) => w.venue.slug === slug && w.id !== YOUR_VENUE_ID);
  return (workspace?.carts[touchpointId] ?? []).map(({ itemId, optionIds, quantity, notes }) => ({
    itemId,
    optionIds,
    quantity,
    notes,
  }));
}
