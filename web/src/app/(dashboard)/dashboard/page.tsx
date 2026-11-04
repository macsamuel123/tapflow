"use client";

import { useDashboard, useDashboardReload } from "@/components/dashboard/DashboardContext";
import { OrderCard } from "@/components/dashboard/OrderCard";
import { Card, FormError, LinkButton } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { useData } from "@/lib/use-data";
import { getServices } from "@/services";

async function load() {
  const { orders } = getServices();
  const [summary, list] = await Promise.all([orders.summary(), orders.list()]);
  return { summary, recent: list.slice(0, 4) };
}

export default function OverviewPage() {
  const { venue } = useDashboard();
  const { data, error, reload } = useData(load);
  useDashboardReload(reload);
  const kpis = data
    ? [
        { label: "Today's orders", value: String(data.summary.ordersToday) },
        { label: "Revenue", value: formatCents(data.summary.revenueCents, venue.currency) },
        { label: "Average ticket", value: formatCents(data.summary.averageTicketCents, venue.currency) },
      ]
    : [];
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-ink">Overview</h1>
        <p className="text-gray-600">{venue.name}</p>
      </div>
      <FormError message={error} />
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {kpis.map((kpi, i) => (
          <Card key={kpi.label} className={i === 0 ? "col-span-2 md:col-span-1" : ""}>
            <dt className="text-sm text-gray-600">{kpi.label}</dt>
            <dd className="mt-1 text-2xl font-black text-ink tabular-nums">{kpi.value}</dd>
          </Card>
        ))}
      </dl>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Recent orders</h2>
          <LinkButton href="/dashboard/orders" variant="ghost">View all</LinkButton>
        </div>
        {data?.recent.map((order) => (
          <OrderCard key={order.id} order={order} currency={venue.currency} />
        ))}
      </section>
    </div>
  );
}
