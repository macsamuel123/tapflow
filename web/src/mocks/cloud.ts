// The shared demo. The fixed demo venues keep their code menus, with orders and sold-out in the
// cloud. A tester's venue is saved in the cloud too: this browser keeps a working copy, runs the
// same mock edits on it, then sends the result to the server, which validates and stores it.
import {
  deletePath,
  fetchOrder,
  fetchOrders,
  fetchPublicVenue,
  fetchStock,
  fetchVenueName,
  getJson,
  patchJson,
  postJson,
  sendPhoto,
} from "@/lib/demo-cloud/browser";
import { READ_ONLY_NOTE, SHARED_SLUGS, type DemoOrderRow, type VenueSnapshot } from "@/lib/demo-cloud/config";
import { ServiceError } from "@/services/types";
import type {
  Branding,
  GuestContext,
  GuestOrder,
  GuestService,
  MenuCategory,
  Order,
  OrderStatus,
  ServiceMode,
  Services,
  Session,
  Touchpoint,
  Venue,
} from "@/services/types";
import { BREWERY_ID, demoBrewery, demoFoodTruck, FOOD_TRUCK_ID, GST, PST, workspaceFromSignUp } from "./fixtures";
import { cloudBranding, cloudStaff, cloudStaffMode } from "./cloud-staff";
import { attachPhotos } from "./index";
import { activeWorkspace, readState, update, type Workspace } from "./store";

const FIXED_MENUS = [demoBrewery(), demoFoodTruck()];
const FIXED_IDS = [BREWERY_ID, FOOD_TRUCK_ID];
const NOT_VERIFIED = "not-verified";

function active(): Workspace {
  return activeWorkspace(readState());
}

function inFixedDemo(): boolean {
  return FIXED_IDS.includes(active().id);
}

function isFixedContext(context: Pick<GuestContext, "slug" | "touchpointId">): boolean {
  return FIXED_MENUS.some(
    (w) => w.venue.slug === context.slug && w.touchpoints.some((t) => t.id === context.touchpointId),
  );
}


function readBranding(raw: unknown): Branding {
  const b = (raw ?? {}) as Partial<Branding>;
  return { logoUrl: b.logoUrl ?? null, coverUrl: b.coverUrl ?? null, color: b.color ?? null };
}

function workspaceId(venueId: string): string {
  return `venue-${venueId}`;
}

function fromSnapshot(snapshot: VenueSnapshot, code: string, previous?: Workspace, codeShown = true): Workspace {
  return {
    id: workspaceId(snapshot.venue.id),
    venue: snapshot.venue,
    spotType: previous?.spotType ?? "table",
    touchpoints: snapshot.touchpoints,
    orders: [],
    menu: snapshot.menu,
    staff: previous?.staff ?? [],
    roleLabels: snapshot.roleLabels,
    branding: snapshot.branding,
    payment: previous?.payment ?? { connected: false, accountLabel: null },
    taxes: previous?.taxes ?? [GST, PST],
    sampleMenu: snapshot.sampleMenu,
    carts: previous?.carts ?? {},
    cloud: { venueId: snapshot.venue.id, code, version: snapshot.version, codeShown },
  };
}

function storeOwned(snapshot: VenueSnapshot, code: string, makeActive: boolean, codeShown = true): void {
  update((state) => {
    const id = workspaceId(snapshot.venue.id);
    const previous = state.workspaces.find((w) => w.id === id);
    const next = fromSnapshot(snapshot, code, previous, previous?.cloud?.codeShown ?? codeShown);
    state.workspaces = [next, ...state.workspaces.filter((w) => w.id !== id)];
    if (makeActive) state.activeId = id;
  });
}

/** Writes are serial, so each one starts from the version the last one produced. */
let saving: Promise<unknown> = Promise.resolve();

function save(change: { menu?: boolean; touchpoints?: boolean; details?: object }): Promise<void> {
  const run = saving.catch(() => undefined).then(async () => {
    const { cloud, menu, touchpoints, sampleMenu } = active();
    if (!cloud) return;
    try {
      const { snapshot } = await patchJson<{ snapshot: VenueSnapshot }>(
        `/demo/api/venues/${cloud.venueId}`,
        {
          version: cloud.version,
          ...(change.menu ? { menu, sampleMenu } : {}),
          ...(change.touchpoints ? { touchpoints } : {}),
          ...(change.details ? { details: change.details } : {}),
        },
        cloud.code,
      );
      storeOwned(snapshot, cloud.code, false);
    } catch (err) {
      await pull().catch(() => undefined); // the server's copy wins, so this browser can't drift
      throw err;
    }
  });
  saving = run;
  return run;
}

async function pull(): Promise<void> {
  const { cloud } = active();
  if (!cloud) return;
  const { snapshot } = await getJson<{ snapshot: VenueSnapshot }>(`/demo/api/venues/${cloud.venueId}`, cloud.code);
  storeOwned(snapshot, cloud.code, false);
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

/** Brings a tester's venue into this browser for a guest. Returns false if it doesn't exist. */
async function loadGuestVenue(context: GuestContext): Promise<boolean> {
  const found = await fetchPublicVenue(context.slug, context.touchpointId);
  if (!found) return false;
  const { verified } = await postJson<{ verified: boolean }>("/demo/api/access", context);
  const point: Touchpoint = {
    id: found.touchpoint.id as string,
    label: found.touchpoint.label as string,
    serviceMode: found.touchpoint.service_mode as ServiceMode,
    spotNumber: found.touchpoint.spot_number as number | null,
    active: found.touchpoint.active as boolean,
    // Tokens never reach a guest. The server's answer is recorded so the guest logic can use it.
    token: verified ? (context.token ?? "") : NOT_VERIFIED,
  };
  update((state) => {
    const venueId = found.venue.id as string;
    const owned = state.workspaces.find((w) => w.cloud?.venueId === venueId);
    const branding = readBranding(found.venue.branding);
    if (owned) {
      owned.menu = found.menu as MenuCategory[];
      owned.branding = branding;
      return;
    }
    const id = `guest-${venueId}`;
    const previous = state.workspaces.find((w) => w.id === id);
    const others = previous?.touchpoints.filter((t) => t.id !== point.id) ?? [];
    const cached: Workspace = {
      id,
      venue: {
        id: venueId,
        slug: found.venue.slug as string,
        name: found.venue.name as string,
        industry: found.venue.industry as Venue["industry"],
        venueType: (found.venue.venue_type as string | null) ?? null,
        country: found.venue.country as "CA" | "US",
        region: "",
        currency: found.venue.currency as string,
      },
      spotType: "table",
      touchpoints: [...others, point],
      orders: [],
      menu: found.menu as MenuCategory[],
      branding,
      staff: [],
      payment: { connected: false, accountLabel: null },
      taxes: [GST, PST],
      sampleMenu: false,
      carts: previous?.carts ?? {},
      guestOnly: true,
    };
    state.workspaces = [...state.workspaces.filter((w) => w.id !== id), cached];
  });
  return true;
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

function setStatus(id: string, status: OrderStatus, venueKey?: string) {
  return postJson(`/demo/api/orders/${id}/status`, { status }, venueKey);
}

function workspaceWithTouchpoint(context: Pick<GuestContext, "slug" | "touchpointId">): Workspace | undefined {
  return readState().workspaces.find(
    (w) => w.venue.slug === context.slug && w.touchpoints.some((t) => t.id === context.touchpointId),
  );
}

function cartLines(context: GuestContext) {
  return (workspaceWithTouchpoint(context)?.carts[context.touchpointId] ?? []).map(
    ({ itemId, optionIds, quantity, notes }) => ({ itemId, optionIds, quantity, notes }),
  );
}

function photoName(url: string | null): string | null {
  return url?.split("/").at(-1) ?? null;
}

function findPhoto(itemId: string): string | null {
  return active().menu.flatMap((c) => c.items).find((i) => i.id === itemId)?.photoUrl ?? null;
}

function setStoredPhoto(itemId: string, url: string | null): void {
  update((state) => {
    const item = activeWorkspace(state).menu.flatMap((c) => c.items).find((i) => i.id === itemId);
    if (item) item.photoUrl = url;
  });
}

async function deleteStoredPhoto(url: string | null): Promise<void> {
  const { cloud } = active();
  const name = photoName(url);
  if (cloud && name) await deletePath(`/demo/api/venues/${cloud.venueId}/photo?name=${name}`, cloud.code).catch(() => undefined);
}

export function cloudServices(mock: Services): Services {
  const { auth, guest, menu, orders, touchpoints, venues } = mock;

  /** A venue edit: refused on the fixed demos, and sent to the server on a tester's venue. */
  function edited<S extends object, K extends keyof S>(
    service: S,
    names: readonly K[],
    part: { menu?: boolean; touchpoints?: boolean },
  ): Pick<S, K> {
    const entries = names.map((name) => {
      const method = service[name] as (...args: unknown[]) => Promise<unknown>;
      const wrapped = async (...args: unknown[]) => {
        if (inFixedDemo()) throw new ServiceError(`${READ_ONLY_NOTE}.`);
        const result = await method(...args);
        await save(part);
        return result;
      };
      return [name, wrapped];
    });
    return Object.fromEntries(entries) as Pick<S, K>;
  }

  const cloudGuest: GuestService = {
    ...guest,
    async open(context) {
      if (isFixedContext(context)) {
        await trySyncStock(context.slug);
      } else if (!(await loadGuestVenue(context))) {
        return null;
      }
      return guest.open(context);
    },
    async getCart(context) {
      if (isFixedContext(context)) await trySyncStock(context.slug);
      return guest.getCart(context);
    },
    async addItem(context, line) {
      if (isFixedContext(context)) await trySyncStock(context.slug);
      return guest.addItem(context, line);
    },
    async placeOrder(context, guestName) {
      const { id } = await postJson<{ id: string }>("/demo/api/orders", {
        slug: context.slug,
        touchpointId: context.touchpointId,
        token: context.token,
        guestName,
        lines: cartLines(context),
      });
      update((state) => {
        const workspace = state.workspaces.find(
          (w) => w.venue.slug === context.slug && w.touchpoints.some((t) => t.id === context.touchpointId),
        );
        if (workspace) workspace.carts[context.touchpointId] = [];
      });
      return id;
    },
    async getOrder(slug, orderId) {
      const row = await fetchOrder(orderId);
      if (!row) return guest.getOrder(slug, orderId);
      const fixed = FIXED_MENUS.find((w) => w.venue.slug === slug)?.venue;
      const venue = fixed ?? (await fetchVenueName(slug));
      const order: GuestOrder = {
        ...toOrder(row),
        venueName: venue?.name ?? slug,
        currency: venue?.currency ?? "CAD",
      };
      return order;
    },
    async simulateNextStep(slug, orderId) {
      const row = SHARED_SLUGS.includes(slug) ? await fetchOrder(orderId) : null;
      if (!row) return;
      const next = nextStep(row);
      if (next) await setStatus(orderId, next);
    },
  };

  const context = { active, inFixedDemo, toOrder };
  const services: Services = {
    ...mock,
    guest: cloudGuest,
    staff: cloudStaff(mock.staff, context),
    branding: cloudBranding(mock.branding, context, pull),
    staffMode: cloudStaffMode(context),
    auth: {
      ...auth,
      async signUp(input) {
        const session: Session = { name: input.name.trim(), email: input.email.trim() };
        const draft = workspaceFromSignUp({
          industry: input.industry,
          venueType: input.venueType,
          venueName: input.venueName.trim(),
          country: input.country,
          region: input.region,
          setup: input.setup,
          menuRows: input.menuRows,
          ...session,
        });
        // The owner's name, email and password stay out of the cloud on purpose.
        const { code, snapshot } = await postJson<{ code: string; snapshot: VenueSnapshot }>("/demo/api/venues", {
          name: draft.venue.name,
          industry: draft.venue.industry,
          venueType: draft.venue.venueType,
          country: draft.venue.country,
          region: draft.venue.region,
          menu: draft.menu,
          sampleMenu: draft.sampleMenu,
          touchpoints: draft.touchpoints,
        });
        update((state) => {
          const id = workspaceId(snapshot.venue.id);
          const next = { ...fromSnapshot(snapshot, code, draft, false), id, spotType: input.setup.spotType };
          state.session = session;
          state.workspaces = [next, ...state.workspaces];
          state.activeId = id;
        });
        // The photo route needs the recovery code, so photos go on once the venue exists.
        await attachPhotos(active().menu, input.menuPhotos, (itemId, photo) => services.menu.setPhoto(itemId, photo));
        return session;
      },
      async openVenue(rawCode) {
        const code = rawCode.trim().toUpperCase();
        const { snapshot } = await postJson<{ snapshot: VenueSnapshot }>("/demo/api/venues/open", { code });
        storeOwned(snapshot, code, true);
        update((state) => {
          state.session ??= { name: snapshot.venue.name, email: "" };
        });
      },
    },
    venues: {
      ...venues,
      async isSharedDemo() {
        return inFixedDemo();
      },
      async isCloudVenue() {
        return active().cloud !== undefined;
      },
      async recoveryCode() {
        const { cloud } = active();
        return cloud && !cloud.codeShown ? cloud.code : null;
      },
      async markRecoveryCodeShown() {
        update((state) => {
          const { cloud } = activeWorkspace(state);
          if (cloud) cloud.codeShown = true;
        });
      },
      async current() {
        if (active().cloud) await pull().catch(() => undefined);
        return venues.current();
      },
      async updateDetails(details) {
        if (inFixedDemo()) throw new ServiceError(`${READ_ONLY_NOTE}.`);
        const { slug } = active().venue;
        await venues.updateDetails(details);
        // A venue keeps its slug when renamed, or every printed QR would break.
        update((state) => {
          activeWorkspace(state).venue.slug = slug;
        });
        await save({ details });
        return venues.current();
      },
      async resetDemo() {
        // The recovery codes here may be the only copies, so a reset keeps these venues.
        const kept = readState().workspaces.filter((w) => w.cloud);
        const session = readState().session;
        await venues.resetDemo();
        update((state) => {
          state.session = session;
          state.workspaces = [...kept, ...state.workspaces];
        });
      },
    },
    orders: {
      ...orders,
      async list() {
        return (await fetchOrders(active().venue.slug)).map(toOrder);
      },
      async summary() {
        const placed = (await fetchOrders(active().venue.slug)).filter((o) => o.status !== "cancelled");
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
        await setStatus(id, status, active().cloud?.code);
      },
    },
    menu: {
      ...menu,
      async list() {
        if (inFixedDemo()) await syncStock(active().venue.slug);
        else await pull().catch(() => undefined);
        return menu.list();
      },
      async isSample() {
        return inFixedDemo() ? false : menu.isSample();
      },
      async setInStock(itemId, inStock) {
        if (inFixedDemo()) {
          await postJson("/demo/api/stock", { slug: active().venue.slug, itemId, soldOut: !inStock });
          return;
        }
        await menu.setInStock(itemId, inStock);
        await save({ menu: true });
      },
      async setPhoto(itemId, photo) {
        const { cloud } = active();
        if (!cloud) throw new ServiceError(`${READ_ONLY_NOTE}.`);
        const previous = findPhoto(itemId);
        const { url } = await sendPhoto(`/demo/api/venues/${cloud.venueId}/photo`, photo, cloud.code);
        setStoredPhoto(itemId, url);
        await save({ menu: true });
        await deleteStoredPhoto(previous);
      },
      async removePhoto(itemId) {
        if (inFixedDemo()) throw new ServiceError(`${READ_ONLY_NOTE}.`);
        const previous = findPhoto(itemId);
        setStoredPhoto(itemId, null);
        await save({ menu: true });
        await deleteStoredPhoto(previous);
      },
      async deleteItem(itemId) {
        if (inFixedDemo()) throw new ServiceError(`${READ_ONLY_NOTE}.`);
        const previous = findPhoto(itemId);
        setStoredPhoto(itemId, null);
        await menu.deleteItem(itemId);
        await save({ menu: true });
        await deleteStoredPhoto(previous);
      },
      ...edited(
        menu,
        [
          "clearSample", "addCategory", "renameCategory", "reorderCategories", "deleteCategory",
          "addItem", "updateItem", "setAllergens", "importRows",
        ],
        { menu: true },
      ),
    },
    touchpoints: {
      ...touchpoints,
      ...edited(
        touchpoints,
        ["applySetup", "addSpots", "addPickup", "removePickup", "setActive", "regenerateQr"],
        { touchpoints: true },
      ),
    },
  };
  return services;
}
