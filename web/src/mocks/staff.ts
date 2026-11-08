// Staff, branding and staff mode for one browser. The cloud version keeps the same rules on the
// server: PIN hashes only, unique per venue, a 5-try lock, and the role re-read on every action.
import { ensureAA, normalizeHex } from "@/lib/brand/contrast";
import {
  can,
  canSetStatus,
  MAX_ROLE_LABEL,
  NOT_ALLOWED_MESSAGE,
  pinError,
  roleLabel,
  roleLabelError,
  usesPin,
  withDefaultLabels,
} from "@/lib/staff/permissions";
import { ServiceError } from "@/services/types";
import type {
  BrandingService,
  StaffAction,
  StaffMember,
  StaffModeService,
  StaffRole,
  StaffService,
  StaffSession,
} from "@/services/types";
import { allowedSteps, resolveBranding, withPhotoUrls } from "./guest";
import { deletePhoto, savePhoto } from "./photos";
import {
  clearFailures,
  isLocked,
  mockPinHash,
  readDeviceSession,
  recordFailure,
  writeDeviceSession,
} from "./staff-auth";
import { activeWorkspace, readState, update, updateActive, type StoredStaff, type Workspace } from "./store";

function toMember(staff: StoredStaff): StaffMember {
  return {
    id: staff.id,
    name: staff.name,
    role: staff.role,
    active: staff.active,
    hasPin: staff.pinHash !== null,
    accountOwner: staff.accountOwner === true,
    ...(usesPin(staff.role) ? {} : { inviteUrl: inviteUrl(staff) }),
  };
}

function inviteUrl(staff: StoredStaff): string {
  const query = new URLSearchParams({ invite: staff.id.slice(0, 8), role: staff.role });
  return `/signup/invite?${query.toString()}`;
}

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new ServiceError("Enter a name.");
  if (trimmed.length > 60) throw new ServiceError("Use 60 characters or fewer.");
  return trimmed;
}

function requirePin(workspace: Workspace, pin: string | null | undefined, exceptId: string | null): string {
  if (pin === null || pin === undefined) throw new ServiceError("Set a 4-digit PIN for this role.");
  const problem = pinError(pin);
  if (problem) throw new ServiceError(problem);
  const hash = mockPinHash(pin);
  if (workspace.staff.some((s) => s.active && s.pinHash === hash && s.id !== exceptId)) {
    throw new ServiceError("That PIN is already in use.");
  }
  return hash;
}

function findStaff(workspace: Workspace, id: string): StoredStaff {
  const found = workspace.staff.find((s) => s.id === id);
  if (!found) throw new ServiceError("That person is no longer on the team.");
  if (found.accountOwner) throw new ServiceError("The account owner can't be changed here.");
  return found;
}

export const staffService: StaffService = {
  async list() {
    return activeWorkspace(readState()).staff.map(toMember);
  },
  async add(member) {
    let added: StoredStaff | null = null;
    updateActive((workspace) => {
      const name = cleanName(member.name);
      const pinHash = usesPin(member.role) ? requirePin(workspace, member.pin, null) : null;
      added = { id: crypto.randomUUID(), name, role: member.role, active: true, pinHash, pinVersion: 1 };
      workspace.staff.push(added);
    });
    if (!added) throw new ServiceError("Something went wrong. Try again.");
    return toMember(added);
  },
  async setRole(id, role, pin) {
    updateActive((workspace) => {
      const staff = findStaff(workspace, id);
      if (usesPin(role)) {
        if (!staff.pinHash || pin) staff.pinHash = requirePin(workspace, pin, staff.id);
      } else if (staff.pinHash) {
        staff.pinHash = null;
        staff.pinVersion += 1; // an account role has no PIN, so their staff device signs out
      }
      staff.role = role;
    });
  },
  async resetPin(id, pin) {
    updateActive((workspace) => {
      const staff = findStaff(workspace, id);
      if (!usesPin(staff.role)) throw new ServiceError("This role signs in with an account, not a PIN.");
      staff.pinHash = requirePin(workspace, pin, staff.id);
      staff.pinVersion += 1;
    });
  },
  async deactivate(id) {
    updateActive((workspace) => {
      const staff = findStaff(workspace, id);
      staff.active = false;
      staff.pinVersion += 1;
    });
  },
  async roleLabels() {
    return withDefaultLabels(activeWorkspace(readState()).roleLabels);
  },
  async renameRole(role, label) {
    const problem = roleLabelError(label);
    if (problem) throw new ServiceError(problem);
    updateActive((workspace) => {
      workspace.roleLabels = { ...workspace.roleLabels, [role]: label.trim().slice(0, MAX_ROLE_LABEL) };
    });
  },
};

export const brandingService: BrandingService = {
  async get() {
    return resolveBranding(activeWorkspace(readState()).branding);
  },
  async saveColor(color) {
    let stored: string | null = null;
    if (color !== null) {
      const hex = normalizeHex(color);
      if (!hex) throw new ServiceError("Enter a colour like #1d4ed8.");
      stored = ensureAA(hex).color;
    }
    updateActive((workspace) => {
      workspace.branding = { logoUrl: null, coverUrl: null, ...workspace.branding, color: stored };
    });
    return brandingService.get();
  },
  async upload(kind, image) {
    const key = kind === "logo" ? "logoUrl" : "coverUrl";
    const previous = activeWorkspace(readState()).branding?.[key] ?? null;
    const ref = await savePhoto(image);
    updateActive((workspace) => {
      workspace.branding = { logoUrl: null, coverUrl: null, color: null, ...workspace.branding, [key]: ref };
    });
    await deletePhoto(previous);
  },
  async remove(kind) {
    const key = kind === "logo" ? "logoUrl" : "coverUrl";
    const previous = activeWorkspace(readState()).branding?.[key] ?? null;
    updateActive((workspace) => {
      if (workspace.branding) workspace.branding[key] = null;
    });
    await deletePhoto(previous);
  },
};

function venueBySlug(slug: string): Workspace | null {
  return readState().workspaces.find((w) => w.venue.slug === slug && !w.guestOnly) ?? null;
}

function updateVenue(slug: string, change: (workspace: Workspace) => void): void {
  update((state) => {
    const workspace = state.workspaces.find((w) => w.venue.slug === slug && !w.guestOnly);
    if (!workspace) throw new ServiceError("This venue isn't available on this device.");
    change(workspace);
  });
}

/** The signed-in person, re-read from the staff list: a deactivation or PIN reset ends it. */
function signedIn(slug: string): { workspace: Workspace; staff: StoredStaff } | null {
  const workspace = venueBySlug(slug);
  const device = readDeviceSession(slug);
  if (!workspace || !device) return null;
  const staff = workspace.staff.find((s) => s.id === device.staffId);
  if (!staff || !staff.active || staff.pinHash === null || staff.pinVersion !== device.pinVersion) return null;
  return { workspace, staff };
}

function requireAction(slug: string, action: StaffAction): { workspace: Workspace; staff: StoredStaff } {
  const found = signedIn(slug);
  if (!found) throw new ServiceError("You've been signed out. Enter your PIN again.");
  if (!can(found.staff.role, action)) throw new ServiceError(NOT_ALLOWED_MESSAGE);
  return found;
}

function toSession(workspace: Workspace, staff: StoredStaff): StaffSession {
  return {
    staffId: staff.id,
    name: staff.name,
    role: staff.role,
    roleLabel: roleLabel(workspace.roleLabels, staff.role),
    venueName: workspace.venue.name,
    currency: workspace.venue.currency,
  };
}

function viewsOrders(role: StaffRole): boolean {
  return can(role, "view_fulfillment") || can(role, "view_ready") || can(role, "view_orders");
}

export const staffModeService: StaffModeService = {
  async venue(slug) {
    const workspace = venueBySlug(slug);
    return workspace ? { name: workspace.venue.name, roleLabels: withDefaultLabels(workspace.roleLabels) } : null;
  },
  async login(slug, pin) {
    const workspace = venueBySlug(slug);
    if (!workspace) return { status: "no_venue" };
    // Checked before the PIN, so even the right PIN waits out the lock.
    if (isLocked(slug)) return { status: "locked" };
    const hash = /^\d{4}$/.test(pin) ? mockPinHash(pin) : null;
    const staff = hash ? workspace.staff.find((s) => s.active && s.pinHash === hash) : undefined;
    if (!staff) {
      const triesLeft = recordFailure(slug);
      return triesLeft === 0 ? { status: "locked" } : { status: "wrong_pin", triesLeft };
    }
    clearFailures(slug);
    writeDeviceSession(slug, { staffId: staff.id, pinVersion: staff.pinVersion });
    return { status: "ok", session: toSession(workspace, staff) };
  },
  async logout(slug) {
    writeDeviceSession(slug, null);
  },
  async current(slug) {
    const found = signedIn(slug);
    return found ? toSession(found.workspace, found.staff) : null;
  },
  async orders(slug) {
    const found = signedIn(slug);
    if (!found || !viewsOrders(found.staff.role)) throw new ServiceError(NOT_ALLOWED_MESSAGE);
    return found.workspace.orders;
  },
  async menu(slug) {
    const { workspace } = requireAction(slug, "sold_out");
    return withPhotoUrls(workspace.menu);
  },
  async touchpoints(slug) {
    const { workspace } = requireAction(slug, "view_touchpoints");
    return workspace.touchpoints;
  },
  async setStatus(slug, orderId, status) {
    const found = signedIn(slug);
    if (!found) throw new ServiceError("You've been signed out. Enter your PIN again.");
    // The same check the server makes: a Server can't mark ready, a Cook can't mark delivered.
    if (!canSetStatus(found.staff.role, status)) throw new ServiceError(NOT_ALLOWED_MESSAGE);
    updateVenue(slug, (workspace) => {
      const order = workspace.orders.find((o) => o.id === orderId);
      if (!order) throw new ServiceError("That order no longer exists.");
      if (!allowedSteps(order).includes(status)) throw new ServiceError("That step isn't available.");
      order.status = status;
    });
  },
  async setSoldOut(slug, itemId, soldOut) {
    requireAction(slug, "sold_out");
    updateVenue(slug, (workspace) => {
      const item = workspace.menu.flatMap((c) => c.items).find((i) => i.id === itemId);
      if (!item) throw new ServiceError("That item no longer exists.");
      item.inStock = !soldOut;
    });
  },
};
