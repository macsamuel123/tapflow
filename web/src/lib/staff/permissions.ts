// The one permission map. The dashboard, staff mode and the server handlers all read it.
// Display labels are for people only: nothing here ever looks at them.
import type { OrderStatus, RoleLabels, StaffAction, StaffRole } from "@/services/types";

export const ROLES: readonly StaffRole[] = [
  "owner",
  "manager",
  "fulfillment",
  "bartender",
  "server",
  "runner",
  "host",
];

export const ACTIONS: readonly StaffAction[] = [
  "view_fulfillment",
  "accept",
  "ready",
  "delivered",
  "picked_up",
  "cancel",
  "sold_out",
  "view_ready",
  "view_orders",
  "view_touchpoints",
  "manage_staff",
  "edit_branding",
];

export const ACTION_LABELS: Record<StaffAction, string> = {
  view_fulfillment: "See new orders",
  accept: "Accept",
  ready: "Mark ready",
  delivered: "Mark delivered",
  picked_up: "Mark picked up",
  cancel: "Cancel",
  sold_out: "Mark sold out",
  view_ready: "See ready orders",
  view_orders: "See all orders",
  view_touchpoints: "See touchpoints",
  manage_staff: "Manage staff",
  edit_branding: "Edit branding",
};

const ALL_BUT_OWNER_ONLY = ACTIONS.filter((a) => a !== "manage_staff" && a !== "edit_branding");
const PREPARE: StaffAction[] = ["view_fulfillment", "accept", "ready", "cancel", "sold_out"];
const DELIVER: StaffAction[] = ["view_ready", "delivered", "picked_up"];

export const PERMISSIONS: Record<StaffRole, ReadonlySet<StaffAction>> = {
  owner: new Set(ACTIONS),
  manager: new Set(ALL_BUT_OWNER_ONLY),
  fulfillment: new Set(PREPARE),
  bartender: new Set(PREPARE),
  server: new Set(DELIVER),
  runner: new Set(DELIVER),
  host: new Set<StaffAction>(["view_orders", "view_touchpoints"]),
};

export function can(role: StaffRole, action: StaffAction): boolean {
  return PERMISSIONS[role].has(action);
}

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export const DEFAULT_ROLE_LABELS: RoleLabels = {
  owner: "Owner",
  manager: "Manager",
  fulfillment: "Cook",
  bartender: "Bartender",
  server: "Server",
  runner: "Runner",
  host: "Host",
};

export const MAX_ROLE_LABEL = 24;

export function roleLabel(labels: Partial<RoleLabels> | null | undefined, role: StaffRole): string {
  return labels?.[role]?.trim() || DEFAULT_ROLE_LABELS[role];
}

export function withDefaultLabels(labels: Partial<RoleLabels> | null | undefined): RoleLabels {
  return Object.fromEntries(ROLES.map((r) => [r, roleLabel(labels, r)])) as RoleLabels;
}

export function roleLabelError(label: string): string | null {
  const trimmed = label.trim();
  if (!trimmed) return "Enter a name for this role.";
  return trimmed.length > MAX_ROLE_LABEL ? `Use ${MAX_ROLE_LABEL} characters or fewer.` : null;
}

/** These roles sign in on a shared device with a 4-digit PIN. */
export const PIN_ROLES: readonly StaffRole[] = ["fulfillment", "bartender", "server", "runner", "host"];
/** These roles get an account invite instead (a mock link until accounts go live). */
export const INVITE_ROLES: readonly StaffRole[] = ["owner", "manager"];

export function usesPin(role: StaffRole): boolean {
  return PIN_ROLES.includes(role);
}

export function pinError(pin: string): string | null {
  return /^\d{4}$/.test(pin) ? null : "Use exactly 4 digits.";
}

/** The action a status change needs. Staff can never set "paid". */
export function actionForStatus(status: OrderStatus): StaffAction | null {
  switch (status) {
    case "accepted":
      return "accept";
    case "ready":
      return "ready";
    case "delivered":
      return "delivered";
    case "picked_up":
      return "picked_up";
    case "cancelled":
      return "cancel";
    case "paid":
      return null;
  }
}

export function canSetStatus(role: StaffRole, status: OrderStatus): boolean {
  const action = actionForStatus(status);
  return action !== null && can(role, action);
}

export type StaffView = "fulfillment" | "ready" | "host";

/** The tabs a staff device shows for a role, in order. */
export function staffViews(role: StaffRole): StaffView[] {
  const views: StaffView[] = [];
  if (can(role, "view_fulfillment")) views.push("fulfillment");
  if (can(role, "view_ready")) views.push("ready");
  if (can(role, "view_orders") && !can(role, "view_fulfillment")) views.push("host");
  return views;
}

export const LOGIN_TRIES = 5;
export const LOCK_MS = 60_000;
export const LOCKED_MESSAGE = "Too many tries. PIN login is locked for 1 minute.";
export const NOT_ALLOWED_MESSAGE = "Your role can't do that.";

export const INVITE_NOTE = "Real email invites when accounts go live";
