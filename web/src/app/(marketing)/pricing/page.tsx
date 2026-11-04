import type { Metadata } from "next";
import { LinkButton, Pill } from "@/components/ui";

export const metadata: Metadata = { title: "Pricing" };

const PLANS = [
  { name: "Starter", body: "For a single venue getting started with QR ordering." },
  { name: "Growth", body: "For busy venues with more staff and more touchpoints." },
  { name: "Multi-venue", body: "For groups running several venues." },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-black tracking-tight text-ink">Pricing</h1>
      <p className="mt-2 text-gray-600">We&apos;re still working out our plans. These are placeholders.</p>
      <ul className="mt-8 grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => (
          <li key={plan.name} className="flex flex-col rounded-2xl border border-gray-200 p-5">
            <h2 className="text-lg font-bold text-ink">{plan.name}</h2>
            <p className="mt-2 flex-1 text-gray-600">{plan.body}</p>
            <p className="mt-4"><Pill tone="amber">Placeholder — pricing TBD</Pill></p>
          </li>
        ))}
      </ul>
      <LinkButton href="/signup" className="mt-8">Get started</LinkButton>
    </div>
  );
}
