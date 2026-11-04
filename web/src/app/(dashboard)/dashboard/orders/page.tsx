"use client";

import { useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { OrderCard } from "@/components/dashboard/OrderCard";
import { FormError } from "@/components/ui";
import { useData } from "@/lib/use-data";
import { getServices, type ServiceMode } from "@/services";

type Filter = "all" | ServiceMode;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "delivery", label: "Delivered to spot" },
  { value: "pickup", label: "Pickup" },
];

export default function OrdersPage() {
  const { venue } = useDashboard();
  const { data, error, run } = useData(() => getServices().orders.list());
  const [filter, setFilter] = useState<Filter>("all");
  const hasBoth = new Set(data?.map((o) => o.serviceMode)).size > 1;
  const shown = data?.filter((o) => filter === "all" || o.serviceMode === filter) ?? [];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black text-ink">Orders</h1>
      <FormError message={error} />
      {hasBoth ? (
        <div role="group" aria-label="Filter orders" className="flex gap-2 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={`min-h-11 rounded-full border px-4 text-sm font-semibold whitespace-nowrap ${
                filter === f.value ? "border-brand-700 bg-brand-50 text-brand-800" : "border-gray-300 bg-white text-gray-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="space-y-3">
        {shown.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            currency={venue.currency}
            onStatus={(status) => void run(() => getServices().orders.setStatus(order.id, status))}
          />
        ))}
      </div>
    </div>
  );
}
