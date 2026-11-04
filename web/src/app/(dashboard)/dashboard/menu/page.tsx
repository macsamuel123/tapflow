"use client";

import { useDashboard } from "@/components/dashboard/DashboardContext";
import { Card, FormError, Pill } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { useData } from "@/lib/use-data";
import { getServices } from "@/services";

export default function MenuPage() {
  const { venue } = useDashboard();
  const { data, error, run } = useData(() => getServices().menu.list());
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-ink">Menu</h1>
        <p className="text-gray-600">Sold-out items can&apos;t be ordered until you turn them back on.</p>
      </div>
      <FormError message={error} />
      {data?.map((category) => (
        <section key={category.id} className="space-y-2">
          <h2 className="text-lg font-bold text-ink">{category.name}</h2>
          <ul className="space-y-2">
            {category.items.map((item) => (
              <li key={item.id}>
                <Card className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">
                      {item.name} {item.inStock ? null : <Pill tone="red">Sold out</Pill>}
                    </p>
                    <p className="text-sm text-gray-600">{item.description}</p>
                    <p className="mt-1 text-sm font-medium text-ink">
                      {formatCents(item.priceCents, venue.currency)}
                      <span className="font-normal text-gray-600"> · {item.taxCategory}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!item.inStock}
                    aria-label={`${item.name} sold out`}
                    onClick={() => void run(() => getServices().menu.setInStock(item.id, !item.inStock))}
                    className={`relative h-8 w-14 shrink-0 rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 ${
                      item.inStock ? "bg-gray-300" : "bg-red-600"
                    }`}
                  >
                    <span className={`absolute top-1 left-1 size-6 rounded-full bg-white transition ${item.inStock ? "" : "translate-x-6"}`} />
                  </button>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
