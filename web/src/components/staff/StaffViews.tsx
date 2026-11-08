"use client";

import { useCallback } from "react";
import { OrderCard } from "@/components/dashboard/OrderCard";
import { Card, FormError, Pill } from "@/components/ui";
import { can } from "@/lib/staff/permissions";
import { useData } from "@/lib/use-data";
import { DEMO_CLOUD } from "@/lib/demo-cloud/config";
import { useLive } from "@/lib/use-live";
import { useRealtime } from "@/lib/use-realtime";
import { getServices, type Order, type StaffSession } from "@/services";

type ViewProps = { slug: string; session: StaffSession };

function useOrders(slug: string, keep: (order: Order) => boolean) {
  const load = useCallback(async () => (await getServices().staffMode.orders(slug)).filter(keep), [slug, keep]);
  const result = useData(load);
  useLive(() => void result.reload());
  // Across devices in the shared demo: a guest's order or a colleague's step shows up here.
  useRealtime(DEMO_CLOUD ? { kind: "venue", slug } : null, () => void result.reload());
  return result;
}

const PREPARING = (o: Order) => o.status === "paid" || o.status === "accepted";
const READY = (o: Order) => o.status === "ready";
const OPEN = (o: Order) => o.status === "paid" || o.status === "accepted" || o.status === "ready";

function OrderList({ orders, empty, session, slug, run }: {
  orders: Order[] | null;
  empty: string;
  session: StaffSession;
  slug: string;
  run?: (action: () => Promise<unknown>) => Promise<boolean>;
}) {
  if (!orders) return null;
  if (orders.length === 0) return <p className="text-gray-600">{empty}</p>;
  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          currency={session.currency}
          allowed={(action) => can(session.role, action)}
          onStatus={run ? (status) => void run(() => getServices().staffMode.setStatus(slug, order.id, status)) : undefined}
        />
      ))}
    </div>
  );
}

function SoldOut({ slug }: { slug: string }) {
  const { data, error, run, reload } = useData(useCallback(() => getServices().staffMode.menu(slug), [slug]));
  useLive(() => void reload());
  useRealtime(DEMO_CLOUD ? { kind: "menu", slug } : null, () => void reload());
  const items = data?.flatMap((c) => c.items) ?? [];
  return (
    <details className="rounded-2xl border border-gray-200 bg-white p-4">
      <summary className="cursor-pointer font-semibold text-ink">Mark items sold out</summary>
      <FormError message={error} />
      <ul className="mt-2 divide-y">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 py-2">
            <span className={item.inStock ? "text-ink" : "text-gray-400"}>{item.name}</span>
            <button
              type="button"
              aria-pressed={!item.inStock}
              aria-label={`${item.name} sold out`}
              onClick={() => void run(() => getServices().staffMode.setSoldOut(slug, item.id, item.inStock))}
              className={`min-h-11 rounded-full border px-3 text-sm font-semibold ${
                item.inStock ? "border-gray-300 text-gray-700" : "border-red-300 bg-red-50 text-red-800"
              }`}
            >
              {item.inStock ? "In stock" : "Sold out"}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function FulfillmentView({ slug, session }: ViewProps) {
  const { data, error, run } = useOrders(slug, PREPARING);
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold text-ink">New and in progress</h2>
      <FormError message={error} />
      <OrderList orders={data} empty="No orders to prepare right now." session={session} slug={slug} run={run} />
      {can(session.role, "sold_out") ? <SoldOut slug={slug} /> : null}
    </section>
  );
}

export function ReadyView({ slug, session }: ViewProps) {
  const { data, error, run } = useOrders(slug, READY);
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold text-ink">Ready to deliver</h2>
      <FormError message={error} />
      <OrderList orders={data} empty="Nothing is ready yet." session={session} slug={slug} run={run} />
    </section>
  );
}

export function HostView({ slug, session }: ViewProps) {
  const orders = useOrders(slug, OPEN);
  const touchpoints = useData(useCallback(() => getServices().staffMode.touchpoints(slug), [slug]));
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-xl font-bold text-ink">Open orders</h2>
        <p className="text-sm text-gray-600">View only.</p>
        <FormError message={orders.error} />
        <OrderList orders={orders.data} empty="No open orders." session={session} slug={slug} />
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-bold text-ink">Touchpoints</h2>
        <FormError message={touchpoints.error} />
        <ul className="grid grid-cols-2 gap-2">
          {touchpoints.data?.map((tp) => (
            <li key={tp.id}>
              <Card className="flex items-center justify-between gap-2 p-3">
                <span className="truncate font-medium text-ink">{tp.label}</span>
                <Pill tone={tp.active ? "green" : "gray"}>{tp.active ? "Open" : "Off"}</Pill>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
