"use client";

import { useState, type FormEvent } from "react";
import { useDashboard, useDashboardReload } from "@/components/dashboard/DashboardContext";
import { OrderCard } from "@/components/dashboard/OrderCard";
import { Button, FormError, TextField } from "@/components/ui";
import { Sheet } from "@/components/menu-builder/Sheet";
import { useData } from "@/lib/use-data";
import { useLive } from "@/lib/use-live";
import { postJson } from "@/lib/demo-cloud/browser";
import { getServices, ServiceError, type ServiceMode } from "@/services";

function postClear(secret: string) {
  return postJson("/demo/api/clear", { secret });
}

type Filter = "all" | ServiceMode;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "delivery", label: "Delivered to spot" },
  { value: "pickup", label: "Pickup" },
];

export default function OrdersPage() {
  const { venue, shared } = useDashboard();
  const { data, error, reload, run } = useData(() => getServices().orders.list());
  useLive(() => void reload()); // guest orders from another tab appear on their own
  useDashboardReload(reload);
  const [clearing, setClearing] = useState(false);
  const [secret, setSecret] = useState("");
  const [clearError, setClearError] = useState<string | null>(null);

  async function clearOrders(event: FormEvent) {
    event.preventDefault();
    setClearError(null);
    try {
      await postClear(secret);
      setClearing(false);
      setSecret("");
      await reload();
    } catch (err) {
      setClearError(err instanceof ServiceError ? err.message : "Something went wrong. Try again.");
    }
  }
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
      {data && data.length === 0 ? <p className="text-gray-600">No orders yet. Scan a QR code to place one.</p> : null}
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
      {shared ? (
        <Button variant="danger" onClick={() => setClearing(true)}>Clear demo orders</Button>
      ) : null}
      {clearing ? (
        <Sheet
          title="Clear demo orders"
          onClose={() => setClearing(false)}
          footer={<Button type="submit" form="clear-form" variant="danger" className="flex-1">Clear all orders</Button>}
        >
          <form id="clear-form" onSubmit={(e) => void clearOrders(e)} className="space-y-3">
            <p className="text-gray-600">This removes every shared order and resets sold-out items, for everyone.</p>
            <TextField label="Admin secret" type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} />
            <FormError message={clearError} />
          </form>
        </Sheet>
      ) : null}
    </div>
  );
}
