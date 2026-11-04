import { DEFAULT_PICKUP_NAME } from "@/lib/industries";
import { MAX_SPOTS, spotName } from "@/lib/service-setup";
import { ServiceError } from "@/services/types";
import type {
  OrderStatus,
  ServiceSetup,
  Services,
  Session,
  Touchpoint,
} from "@/services/types";
import { makePickup, makeSpot, slugify, workspaceFromSignUp, YOUR_VENUE_ID } from "./fixtures";
import {
  activeWorkspace,
  readState,
  resetState,
  update,
  updateActive,
  type Workspace,
} from "./store";

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  paid: ["accepted", "cancelled"],
  accepted: ["ready", "cancelled"],
  ready: ["delivered", "picked_up"],
};

function current(): Workspace {
  return activeWorkspace(readState());
}

function findTouchpoint(workspace: Workspace, id: string): Touchpoint {
  const found = workspace.touchpoints.find((t) => t.id === id);
  if (!found) throw new ServiceError("That touchpoint no longer exists.");
  return found;
}

function requireAnotherActive(workspace: Workspace, tp: Touchpoint): void {
  if (!workspace.touchpoints.some((t) => t.active && t.id !== tp.id)) {
    throw new ServiceError("A venue needs at least one active touchpoint.");
  }
}

function setupOf(workspace: Workspace): ServiceSetup {
  const active = workspace.touchpoints.filter((t) => t.active);
  const spots = active.filter((t) => t.serviceMode === "delivery");
  const pickup = active.find((t) => t.serviceMode === "pickup");
  return {
    spotsEnabled: spots.length > 0,
    spotType: workspace.spotType,
    spotCount: spots.length,
    pickupEnabled: pickup !== undefined,
    pickupName: pickup?.label ?? DEFAULT_PICKUP_NAME,
  };
}

function nextSpotNumber(workspace: Workspace): number {
  return Math.max(0, ...workspace.touchpoints.map((t) => t.spotNumber ?? 0)) + 1;
}

function spotsOf(workspace: Workspace): Touchpoint[] {
  return workspace.touchpoints.filter((t) => t.serviceMode === "delivery");
}

function addSpots(workspace: Workspace, count: number): void {
  if (spotsOf(workspace).length + count > MAX_SPOTS) {
    throw new ServiceError(`A venue can have up to ${MAX_SPOTS} of these. You have ${spotsOf(workspace).length}.`);
  }
  const first = nextSpotNumber(workspace);
  const added = Array.from({ length: count }, (_, i) => makeSpot(workspace.spotType, first + i));
  const pickupStart = workspace.touchpoints.findIndex((t) => t.serviceMode === "pickup");
  workspace.touchpoints.splice(pickupStart < 0 ? workspace.touchpoints.length : pickupStart, 0, ...added);
}

function applySpots(workspace: Workspace, setup: ServiceSetup): void {
  workspace.spotType = setup.spotType;
  const spots = spotsOf(workspace);
  for (const spot of spots) spot.label = spotName(setup.spotType, spot.spotNumber ?? 0);

  const target = setup.spotsEnabled ? setup.spotCount : 0;
  // Reactivate before creating, and retire the highest numbers first. Numbers are never reused.
  let active = spots.filter((t) => t.active).length;
  for (const spot of spots) {
    if (active >= target) break;
    if (!spot.active) {
      spot.active = true;
      active += 1;
    }
  }
  for (const spot of [...spots].reverse()) {
    if (active <= target) break;
    if (spot.active) {
      spot.active = false;
      active -= 1;
    }
  }
  if (active < target) addSpots(workspace, target - active);
}

function applyPickup(workspace: Workspace, setup: ServiceSetup): void {
  const pickups = workspace.touchpoints.filter((t) => t.serviceMode === "pickup");
  if (!setup.pickupEnabled) {
    for (const pickup of pickups) pickup.active = false;
    return;
  }
  const chosen = pickups.find((t) => t.active) ?? pickups[0];
  if (chosen) {
    chosen.active = true;
    chosen.label = setup.pickupName.trim();
  } else {
    workspace.touchpoints.push(makePickup(setup.pickupName.trim()));
  }
}

export const mockServices: Services = {
  auth: {
    async getSession() {
      return readState().session;
    },
    async signUp(input) {
      // The password is checked by the form and not read here, so nothing stores it.
      const session: Session = { name: input.name.trim(), email: input.email.trim() };
      const workspace = workspaceFromSignUp({
        industry: input.industry,
        venueName: input.venueName.trim(),
        country: input.country,
        region: input.region,
        setup: input.setup,
        ...session,
      });
      update((state) => {
        state.session = session;
        state.workspaces = [workspace, ...state.workspaces.filter((w) => w.id !== YOUR_VENUE_ID)];
        state.activeId = workspace.id;
      });
      return session;
    },
    async logIn(email) {
      const state = readState();
      const session: Session = state.session ?? {
        name: email.split("@")[0] ?? "Demo user",
        email: email.trim(),
      };
      update((s) => {
        s.session = session;
      });
      return session;
    },
    async requestPasswordReset() {
      // Demo mode sends no email.
    },
    async logOut() {
      update((state) => {
        state.session = null;
      });
    },
  },

  venues: {
    async listWorkspaces() {
      const state = readState();
      const activeId = activeWorkspace(state).id;
      return state.workspaces.map((w) => ({ id: w.id, name: w.venue.name, active: w.id === activeId }));
    },
    async current() {
      return current().venue;
    },
    async switchTo(workspaceId) {
      update((state) => {
        if (state.workspaces.some((w) => w.id === workspaceId)) state.activeId = workspaceId;
      });
    },
    async updateDetails(details) {
      const name = details.name.trim();
      if (!name) throw new ServiceError("Enter a venue name.");
      updateActive((workspace) => {
        const { venue } = workspace;
        Object.assign(venue, details, {
          name,
          slug: slugify(name),
          currency: details.country === "US" ? "USD" : "CAD",
        });
      });
      return current().venue;
    },
    async getTaxes() {
      return current().taxes;
    },
    async resetDemo() {
      resetState();
    },
  },

  touchpoints: {
    async list() {
      return current().touchpoints;
    },
    async getSetup() {
      return setupOf(current());
    },
    async applySetup(setup) {
      if (!setup.spotsEnabled && !setup.pickupEnabled) {
        throw new ServiceError("Choose at least one: tables or spots, or a pickup point.");
      }
      updateActive((workspace) => {
        applySpots(workspace, setup);
        applyPickup(workspace, setup);
      });
    },
    async addSpots(count) {
      updateActive((workspace) => addSpots(workspace, count));
    },
    async addPickup(name) {
      const trimmed = name.trim();
      if (!trimmed) throw new ServiceError("Give your pickup point a name.");
      updateActive((workspace) => {
        workspace.touchpoints.push(makePickup(trimmed));
      });
    },
    async removePickup(id) {
      updateActive((workspace) => {
        requireAnotherActive(workspace, findTouchpoint(workspace, id));
        workspace.touchpoints = workspace.touchpoints.filter((t) => t.id !== id);
      });
    },
    async setActive(id, active) {
      updateActive((workspace) => {
        const tp = findTouchpoint(workspace, id);
        if (!active) requireAnotherActive(workspace, tp);
        tp.active = active;
      });
    },
    async regenerateQr(id) {
      updateActive((workspace) => {
        const tp = findTouchpoint(workspace, id);
        const round = Number(tp.token.replace(/^demo-?r?/, "") || 1);
        tp.token = `demo-r${round + 1}`;
      });
    },
  },

  orders: {
    async list() {
      return current().orders;
    },
    async summary() {
      const placed = current().orders.filter((o) => o.status !== "cancelled");
      const revenueCents = placed.reduce((sum, o) => sum + o.totalCents, 0);
      const twice = 2 * revenueCents + placed.length;
      const divisor = 2 * placed.length;
      return {
        ordersToday: placed.length,
        revenueCents,
        averageTicketCents: divisor ? (twice - (twice % divisor)) / divisor : 0, // integer half-up
      };
    },
    async setStatus(id, status) {
      updateActive((workspace) => {
        const order = workspace.orders.find((o) => o.id === id);
        if (!order) throw new ServiceError("That order no longer exists.");
        const closed = order.serviceMode === "pickup" ? "picked_up" : "delivered";
        const allowed = (NEXT_STATUS[order.status] ?? []).filter(
          (s) => (s !== "delivered" && s !== "picked_up") || s === closed,
        );
        if (!allowed.includes(status)) throw new ServiceError("That step isn't available.");
        order.status = status;
      });
    },
  },

  menu: {
    async list() {
      return current().menu;
    },
    async setInStock(itemId, inStock) {
      updateActive((workspace) => {
        const item = workspace.menu.flatMap((c) => c.items).find((i) => i.id === itemId);
        if (!item) throw new ServiceError("That item no longer exists.");
        item.inStock = inStock;
      });
    },
  },

  staff: {
    async list() {
      return current().staff;
    },
    async invite(member) {
      updateActive((workspace) => {
        workspace.staff.push({ ...member, id: crypto.randomUUID() });
      });
    },
    async setRole(id, role) {
      updateActive((workspace) => {
        const member = workspace.staff.find((s) => s.id === id);
        if (!member) throw new ServiceError("That person is no longer on the team.");
        if (member.role === "owner") throw new ServiceError("The owner's role can't be changed here.");
        member.role = role;
      });
    },
    async remove(id) {
      updateActive((workspace) => {
        const member = workspace.staff.find((s) => s.id === id);
        if (member?.role === "owner") throw new ServiceError("The owner can't be removed.");
        workspace.staff = workspace.staff.filter((s) => s.id !== id);
      });
    },
  },

  payments: {
    async status() {
      return current().payment;
    },
    async connect() {
      updateActive((workspace) => {
        workspace.payment = { connected: true, accountLabel: `${workspace.venue.name} (test account)` };
      });
    },
    async disconnect() {
      updateActive((workspace) => {
        workspace.payment = { connected: false, accountLabel: null };
      });
    },
  },
};
