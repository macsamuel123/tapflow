"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, FormError, LinkButton } from "@/components/ui";
import { orderSteps } from "@/lib/guest";
import { formatCents } from "@/lib/money";
import { useData } from "@/lib/use-data";
import { useLive } from "@/lib/use-live";
import { getServices, type GuestOrder } from "@/services";

const SIMULATE_MS = 3000;

function headline(order: GuestOrder): string {
  const who = order.guestName ?? "Guest";
  if (order.status === "cancelled") return "Order cancelled";
  if (order.serviceMode === "delivery") return order.status === "delivered" ? `Delivered to ${order.touchpointLabel}` : `Bringing it to ${order.touchpointLabel}`;
  if (order.status === "ready") return `Ready — #${order.ticketNumber} · ${who}, collect at ${order.touchpointLabel}`;
  if (order.status === "picked_up") return `Picked up — #${order.ticketNumber} · ${who}`;
  return `#${order.ticketNumber} · ${who}`;
}

export function GuestOrderStatus({
  slug,
  orderId,
  menuHref,
}: {
  slug: string;
  orderId: string;
  menuHref: string | null;
}) {
  const { data, error, reload } = useData(
    useCallback(async () => ({ order: await getServices().guest.getOrder(slug, orderId) }), [slug, orderId]),
  );
  const order = data?.order ?? null;
  const [simulate, setSimulate] = useState(false);
  useLive(() => void reload());

  const done = !order || ["delivered", "picked_up", "cancelled"].includes(order.status);
  useEffect(() => {
    if (!simulate || done) return;
    const timer = window.setTimeout(() => {
      void getServices().guest.simulateNextStep(slug, orderId).then(reload);
    }, SIMULATE_MS);
    return () => window.clearTimeout(timer);
  }, [simulate, done, order?.status, slug, orderId, reload]);

  if (!order) {
    return (
      <main className="mx-auto max-w-md space-y-3 p-6">
        <FormError message={error} />
        <p role="status" className="text-gray-600">
          {data ? "We can't find this order. Orders stay in the browser that placed them for now." : "Looking for your order..."}
        </p>
      </main>
    );
  }

  const steps = orderSteps(order.serviceMode);
  const reached = steps.findIndex((s) => s.status === order.status);
  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <p className="text-sm font-semibold text-gray-600">{order.venueName}</p>
      <h1 className="text-2xl font-black text-ink">{headline(order)}</h1>
      {order.status === "cancelled" ? (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-red-800">Please see staff.</p>
      ) : (
        <ol aria-label="Order progress" className="space-y-2">
          {steps.map((step, i) => (
            <li
              key={step.status}
              aria-current={i === reached ? "step" : undefined}
              className={`flex items-center gap-2 ${i <= reached ? "font-semibold text-ink" : "text-gray-400"}`}
            >
              <span className={`size-3 rounded-full ${i <= reached ? "bg-brand-600" : "bg-gray-200"}`} />
              {step.label}
            </li>
          ))}
        </ol>
      )}

      <Card className="space-y-1">
        <ul className="text-sm text-ink">
          {order.lines.map((line, i) => (
            <li key={i}>
              {line.quantity} x {line.name}
              {line.options.length ? ` (${line.options.join(", ")})` : ""}
            </li>
          ))}
        </ul>
        <p className="flex justify-between pt-1 text-sm text-gray-600"><span>Subtotal</span><span>{formatCents(order.subtotalCents, order.currency)}</span></p>
        <p className="flex justify-between text-sm text-gray-600"><span>Tax</span><span>{formatCents(order.taxCents, order.currency)}</span></p>
        <p className="flex justify-between font-semibold text-ink"><span>Total</span><span>{formatCents(order.totalCents, order.currency)}</span></p>
      </Card>

      <label className="flex min-h-11 items-center gap-2 rounded-xl bg-spark/30 px-3 py-2 text-sm font-medium text-ink">
        <input type="checkbox" className="size-5 accent-brand-700" checked={simulate} onChange={(e) => setSimulate(e.target.checked)} />
        Simulate staff (demo)
      </label>
      <p className="text-xs text-gray-500">Live updates work in this browser only for now.</p>
      {menuHref ? <LinkButton href={menuHref} variant="secondary" className="w-full">Back to menu</LinkButton> : null}
    </main>
  );
}
