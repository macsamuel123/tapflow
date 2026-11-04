import { DEFAULT_PICKUP_NAME } from "@/lib/industries";
import { MAX_SPOTS, spotName } from "@/lib/service-setup";
import { categoryNameError, sameName } from "@/lib/menu/rules";
import { ServiceError } from "@/services/types";
import type {
  ImportResult,
  MenuItem,
  ServiceSetup,
  Services,
  Session,
  Touchpoint,
} from "@/services/types";
import { allowedSteps, guestService, withPhotoUrls } from "./guest";
import { applyImport, ensureCategory, findCategory } from "./menu-ops";
import { clearPhotos, deletePhoto, savePhoto } from "./photos";
import { makePickup, makeSpot, slugify, workspaceFromSignUp, YOUR_VENUE_ID } from "./fixtures";
import {
  activeWorkspace,
  readState,
  resetState,
  update,
  updateActive,
  type Workspace,
} from "./store";

function findItem(workspace: Workspace, id: string): MenuItem | undefined {
  return workspace.menu.flatMap((c) => c.items).find((i) => i.id === id);
}

function requireCategoryName(name: string): void {
  const problem = categoryNameError(name);
  if (problem) throw new ServiceError(problem);
}

function requireUniqueItem(workspace: Workspace, category: string, name: string, id: string | null): void {
  const clash = findCategory(workspace.menu, category)?.items.find((i) => sameName(i.name, name) && i.id !== id);
  if (clash) throw new ServiceError(`${category.trim()} already has ${clash.name}.`);
}

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
  guest: guestService,
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
        menuRows: input.menuRows,
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
    async isLocalOnly() {
      return current().id === YOUR_VENUE_ID;
    },
    async isSharedDemo() {
      return false;
    },
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
      await clearPhotos();
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
        if (!allowedSteps(order).includes(status)) throw new ServiceError("That step isn't available.");
        order.status = status;
      });
    },
  },

  menu: {
    async list() {
      return withPhotoUrls(current().menu);
    },
    async isSample() {
      return current().sampleMenu;
    },
    async clearSample() {
      const refs = current().menu.flatMap((c) => c.items.map((i) => i.photoUrl));
      updateActive((workspace) => {
        workspace.menu = [];
        workspace.sampleMenu = false;
      });
      await Promise.all(refs.map(deletePhoto));
    },
    async addCategory(name) {
      updateActive((workspace) => {
        requireCategoryName(name);
        if (findCategory(workspace.menu, name)) throw new ServiceError(`You already have ${name.trim()}.`);
        ensureCategory(workspace.menu, name);
      });
    },
    async renameCategory(id, name) {
      updateActive((workspace) => {
        requireCategoryName(name);
        const clash = findCategory(workspace.menu, name);
        if (clash && clash.id !== id) throw new ServiceError(`You already have ${name.trim()}.`);
        const category = workspace.menu.find((c) => c.id === id);
        if (!category) throw new ServiceError("That category no longer exists.");
        category.name = name.trim();
      });
    },
    async reorderCategories(orderedIds) {
      updateActive((workspace) => {
        const position = new Map(orderedIds.map((id, i) => [id, i]));
        workspace.menu.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
      });
    },
    async deleteCategory(id) {
      updateActive((workspace) => {
        const category = workspace.menu.find((c) => c.id === id);
        if (!category) return;
        if (category.items.length > 0) {
          const count = category.items.length === 1 ? "1 item" : `${category.items.length} items`;
          throw new ServiceError(`${category.name} still has ${count}. Move or delete them first.`);
        }
        workspace.menu = workspace.menu.filter((c) => c.id !== id);
      });
    },
    async addItem(input) {
      const id = crypto.randomUUID();
      updateActive((workspace) => {
        requireUniqueItem(workspace, input.category, input.name, null);
        const { category, ...fields } = input;
        ensureCategory(workspace.menu, category).items.push({ ...fields, id, photoUrl: null, sampleAllergens: false });
      });
      return id;
    },
    async updateItem(id, input) {
      updateActive((workspace) => {
        requireUniqueItem(workspace, input.category, input.name, id);
        const { category, ...fields } = input;
        const source = workspace.menu.find((c) => c.items.some((i) => i.id === id));
        const item = source?.items.find((i) => i.id === id);
        if (!source || !item) throw new ServiceError("That item no longer exists.");
        const sameAllergens =
          item.allergens.length === fields.allergens.length &&
          item.allergens.every((a) => fields.allergens.includes(a));
        // Saving another field isn't a declaration: the sample allergens stay marked as sample.
        if (!sameAllergens) item.sampleAllergens = false;
        Object.assign(item, fields);
        const target = ensureCategory(workspace.menu, category);
        if (target !== source) {
          source.items = source.items.filter((i) => i.id !== id);
          target.items.push(item);
        }
      });
    },
    async deleteItem(id) {
      const ref = findItem(current(), id)?.photoUrl ?? null;
      updateActive((workspace) => {
        for (const category of workspace.menu) {
          category.items = category.items.filter((i) => i.id !== id);
        }
      });
      await deletePhoto(ref);
    },
    async setInStock(itemId, inStock) {
      updateActive((workspace) => {
        const item = findItem(workspace, itemId);
        if (!item) throw new ServiceError("That item no longer exists.");
        item.inStock = inStock;
      });
    },
    async setPhoto(itemId, photo) {
      const previous = findItem(current(), itemId)?.photoUrl ?? null;
      const ref = await savePhoto(photo);
      updateActive((workspace) => {
        const item = findItem(workspace, itemId);
        if (item) item.photoUrl = ref;
      });
      await deletePhoto(previous);
    },
    async removePhoto(itemId) {
      const previous = findItem(current(), itemId)?.photoUrl ?? null;
      updateActive((workspace) => {
        const item = findItem(workspace, itemId);
        if (item) item.photoUrl = null;
      });
      await deletePhoto(previous);
    },
    async importRows(rows, onDuplicate) {
      let result: ImportResult = { imported: 0, updated: 0, skipped: 0 };
      updateActive((workspace) => {
        result = applyImport(workspace.menu, rows, onDuplicate);
      });
      return result;
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
