import { expect, test } from "@playwright/test";
import {
  ACTIONS,
  actionForStatus,
  can,
  canSetStatus,
  DEFAULT_ROLE_LABELS,
  INVITE_ROLES,
  PIN_ROLES,
  roleLabel,
  ROLES,
  staffViews,
  withDefaultLabels,
} from "../../src/lib/staff/permissions";
import type { StaffAction, StaffRole } from "../../src/services/types";

// Every role × action pair, written out by hand so a change to the map has to change this too.
const Y = true;
const N = false;
const EXPECTED: Record<StaffRole, Record<StaffAction, boolean>> = {
  //            view_ful accept ready deliv pickup cancel sold  v_ready v_orders v_tp  staff brand
  owner:       { view_fulfillment: Y, accept: Y, ready: Y, delivered: Y, picked_up: Y, cancel: Y, sold_out: Y, view_ready: Y, view_orders: Y, view_touchpoints: Y, manage_staff: Y, edit_branding: Y },
  manager:     { view_fulfillment: Y, accept: Y, ready: Y, delivered: Y, picked_up: Y, cancel: Y, sold_out: Y, view_ready: Y, view_orders: Y, view_touchpoints: Y, manage_staff: N, edit_branding: N },
  fulfillment: { view_fulfillment: Y, accept: Y, ready: Y, delivered: N, picked_up: N, cancel: Y, sold_out: Y, view_ready: N, view_orders: N, view_touchpoints: N, manage_staff: N, edit_branding: N },
  bartender:   { view_fulfillment: Y, accept: Y, ready: Y, delivered: N, picked_up: N, cancel: Y, sold_out: Y, view_ready: N, view_orders: N, view_touchpoints: N, manage_staff: N, edit_branding: N },
  server:      { view_fulfillment: N, accept: N, ready: N, delivered: Y, picked_up: Y, cancel: N, sold_out: N, view_ready: Y, view_orders: N, view_touchpoints: N, manage_staff: N, edit_branding: N },
  runner:      { view_fulfillment: N, accept: N, ready: N, delivered: Y, picked_up: Y, cancel: N, sold_out: N, view_ready: Y, view_orders: N, view_touchpoints: N, manage_staff: N, edit_branding: N },
  host:        { view_fulfillment: N, accept: N, ready: N, delivered: N, picked_up: N, cancel: N, sold_out: N, view_ready: N, view_orders: Y, view_touchpoints: Y, manage_staff: N, edit_branding: N },
};

for (const role of ROLES) {
  for (const action of ACTIONS) {
    test(`@saas permissions: ${role} × ${action}`, () => {
      expect(can(role, action)).toBe(EXPECTED[role][action]);
    });
  }
}

test("@saas permissions: the table covers all 7 roles and 12 actions", () => {
  expect(ROLES).toHaveLength(7);
  expect(ACTIONS).toHaveLength(12);
  expect(Object.keys(EXPECTED).sort()).toEqual([...ROLES].sort());
});

test("@saas permissions: status changes map to actions, and nobody sets paid", () => {
  expect(actionForStatus("paid")).toBeNull();
  for (const role of ROLES) expect(canSetStatus(role, "paid")).toBe(false);
  expect(canSetStatus("server", "ready")).toBe(false);
  expect(canSetStatus("fulfillment", "delivered")).toBe(false);
  expect(canSetStatus("fulfillment", "ready")).toBe(true);
  expect(canSetStatus("server", "delivered")).toBe(true);
  expect(canSetStatus("host", "accepted")).toBe(false);
});

test("@saas permissions: PIN roles and invite roles", () => {
  expect([...PIN_ROLES].sort()).toEqual(["bartender", "fulfillment", "host", "runner", "server"]);
  expect([...INVITE_ROLES].sort()).toEqual(["manager", "owner"]);
});

test("@saas permissions: views per role", () => {
  expect(staffViews("fulfillment")).toEqual(["fulfillment"]);
  expect(staffViews("bartender")).toEqual(["fulfillment"]);
  expect(staffViews("server")).toEqual(["ready"]);
  expect(staffViews("runner")).toEqual(["ready"]);
  expect(staffViews("host")).toEqual(["host"]);
  expect(staffViews("owner")).toEqual(["fulfillment", "ready"]);
});

test("@saas permissions: labels are display only and never change what a role can do", () => {
  expect(DEFAULT_ROLE_LABELS.fulfillment).toBe("Cook");
  const renamed = withDefaultLabels({ fulfillment: "Chef", server: "Owner" });
  expect(roleLabel(renamed, "fulfillment")).toBe("Chef");
  expect(roleLabel({ host: "  " }, "host")).toBe("Host");
  // can() takes a role, not a label: a Server renamed "Owner" still can't mark ready.
  expect(can("server", "ready")).toBe(false);
  expect(can("fulfillment", "ready")).toBe(true);
  expect(can.length).toBe(2);
});
