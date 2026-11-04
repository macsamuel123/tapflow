import type { OrderStatus, ServiceMode } from "@/services/types";

export const MAX_GUEST_NAME = 30;

/** Basic sanitising: no control characters or angle brackets, and single spaces. */
export function cleanGuestName(name: string): string {
  return name
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Guest wording for each status (PLAN.md §4). */
export function orderSteps(mode: ServiceMode): { status: OrderStatus; label: string }[] {
  return [
    { status: "paid", label: "Paid" },
    { status: "accepted", label: "Being prepared" },
    { status: "ready", label: mode === "pickup" ? "Ready to collect" : "On its way" },
    mode === "pickup" ? { status: "picked_up", label: "Picked up" } : { status: "delivered", label: "Delivered" },
  ];
}
