import { Button, Card, Pill, type Tone } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { actionForStatus } from "@/lib/staff/permissions";
import type { Order, OrderStatus, StaffAction } from "@/services/types";

const STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  paid: { label: "Paid", tone: "blue" },
  accepted: { label: "Accepted", tone: "amber" },
  ready: { label: "Ready", tone: "green" },
  delivered: { label: "Delivered", tone: "gray" },
  picked_up: { label: "Picked up", tone: "gray" },
  cancelled: { label: "Cancelled", tone: "red" },
};

function minutesAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  return minutes < 1 ? "Just now" : `${minutes} min ago`;
}

function headline(order: Order): string {
  return order.serviceMode === "pickup"
    ? `#${order.ticketNumber} · ${order.guestName ?? "Guest"}`
    : order.touchpointLabel;
}

function detail(order: Order): string {
  if (order.serviceMode === "delivery") {
    const verb = order.status === "delivered" ? "Delivered to" : "Deliver to";
    return `Ticket #${order.ticketNumber} · ${verb} ${order.touchpointLabel}`;
  }
  if (order.status === "ready") {
    return `Ready — #${order.ticketNumber} · ${order.guestName ?? "Guest"}, collect at ${order.touchpointLabel}`;
  }
  return `Pickup at ${order.touchpointLabel}`;
}

function flow(order: Order): OrderStatus[] {
  return ["paid", "accepted", "ready", order.serviceMode === "pickup" ? "picked_up" : "delivered"];
}

export function OrderCard({
  order,
  currency,
  onStatus,
  allowed = () => true,
}: {
  order: Order;
  currency: string;
  onStatus?: (status: OrderStatus) => void;
  /** Staff mode passes the role's permissions, so a control it can't use never shows. */
  allowed?: (action: StaffAction) => boolean;
}) {
  const status = STATUS[order.status];
  const may = (next: OrderStatus) => {
    const action = actionForStatus(next);
    return action !== null && allowed(action);
  };
  const steps = flow(order);
  const reached = steps.indexOf(order.status);
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-lg font-bold text-ink">{headline(order)}</p>
          <p className="text-sm text-gray-600">{detail(order)}</p>
        </div>
        <Pill tone={status.tone}>{status.label}</Pill>
      </div>
      <ul className="mt-2 text-sm text-gray-700">
        {order.lines.map((line, i) => (
          <li key={i}>
            {line.quantity} x {line.name}
            {line.options.length ? ` (${line.options.join(", ")})` : ""}
            {line.notes ? <span className="block text-xs text-gray-500">Note: {line.notes}</span> : null}
          </li>
        ))}
      </ul>
      {reached >= 0 ? (
        <ol aria-label="Order progress" className="mt-3 flex gap-1">
          {steps.map((step, i) => (
            <li key={step} className="flex-1">
              <span className={`block h-1.5 rounded-full ${i <= reached ? "bg-brand-600" : "bg-gray-200"}`} />
              <span className={`mt-1 block text-[11px] ${i === reached ? "font-semibold text-ink" : "text-gray-500"}`}>
                {STATUS[step].label}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-ink">{formatCents(order.totalCents, currency)}</span>
          {" · "}{minutesAgo(order.placedAt)}
        </p>
        {onStatus ? (
          <div className="flex gap-2">
            {(order.status === "paid" || order.status === "accepted") && may("cancelled") ? (
              <Button variant="danger" onClick={() => onStatus("cancelled")}>Cancel</Button>
            ) : null}
            {order.status === "paid" && may("accepted") ? <Button onClick={() => onStatus("accepted")}>Accept</Button> : null}
            {order.status === "accepted" && may("ready") ? <Button onClick={() => onStatus("ready")}>Mark ready</Button> : null}
            {order.status === "ready" && may(steps[3]!) ? (
              <Button onClick={() => onStatus(steps[3]!)}>{STATUS[steps[3]!].label}</Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
