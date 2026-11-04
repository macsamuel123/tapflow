import type { OrderStatus, ServiceMode } from "@/services/types";

export const MAX_GUEST_NAME = 40;

/** Guest wording for each status (PLAN.md §4). */
export function orderSteps(mode: ServiceMode): { status: OrderStatus; label: string }[] {
  return [
    { status: "paid", label: "Paid" },
    { status: "accepted", label: "Being prepared" },
    { status: "ready", label: mode === "pickup" ? "Ready to collect" : "On its way" },
    mode === "pickup" ? { status: "picked_up", label: "Picked up" } : { status: "delivered", label: "Delivered" },
  ];
}
