import type { Metadata } from "next";
import Link from "next/link";
import { LinkButton } from "@/components/ui";
import { INDUSTRIES } from "@/lib/industries";

export const metadata: Metadata = {
  title: "TapFlow: Scan. Order. Serve.",
  description: "Guests scan a QR code, order and pay. You bring it to their spot or call them to collect it.",
};

const STEPS = [
  { title: "Scan", body: "Guests point their camera at a QR code on the table, seat or counter." },
  { title: "Order + pay", body: "They browse the menu and pay on their own phone, before anything is made." },
  { title: "Delivered or picked up", body: "Your team brings it to their spot, or calls their name at the pickup point." },
];

const FEATURES = [
  { title: "No app download", body: "A phone camera is all a guest needs." },
  { title: "Pay upfront", body: "Orders reach your team only after payment clears." },
  { title: "One-tap sold-out", body: "Mark an item sold out and it stops selling straight away." },
  { title: "Live fulfillment screen", body: "New orders appear and sound an alert, so nothing gets missed." },
];

function HeroPreview() {
  return (
    <div aria-hidden className="mx-auto w-full max-w-72 rounded-[2rem] bg-ink p-2.5 shadow-xl">
      <div className="space-y-3 rounded-[1.5rem] bg-white p-4">
        <p className="text-xs font-semibold text-gray-500">Your order</p>
        <div className="rounded-xl bg-brand-50 p-3">
          <p className="text-2xl font-black text-brand-800">#14 · Amara</p>
          <p className="text-sm font-medium text-brand-800">Ready, collect at the counter</p>
        </div>
        <ol className="space-y-2 text-sm">
          {["Paid", "Being prepared", "Ready"].map((step) => (
            <li key={step} className="flex items-center gap-2 text-ink">
              <span className="size-2.5 rounded-full bg-brand-600" />
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <section className="bg-brand-50">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 md:grid-cols-2 md:py-20">
          <div>
            <p className="font-semibold text-brand-700">Scan. Order. Serve.</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight text-ink sm:text-5xl">
              Your guests order from where they are.
            </h1>
            <p className="mt-4 text-lg text-gray-700">
              One QR code and they&apos;re ordering and paying on their own phone. You bring it to
              their spot, or they pick it up.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <LinkButton href="/signup">Get started</LinkButton>
              <LinkButton href="#how-it-works" variant="secondary">See how it works</LinkButton>
            </div>
          </div>
          <HeroPreview />
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14">
        <h2 className="text-2xl font-bold text-ink sm:text-3xl">How it works</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="rounded-2xl border border-gray-200 p-5">
              <span className="grid size-8 place-items-center rounded-full bg-brand-700 text-sm font-bold text-white">{i + 1}</span>
              <h3 className="mt-3 text-lg font-semibold text-ink">{step.title}</h3>
              <p className="mt-1 text-gray-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="industries" className="bg-gray-50">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-2xl font-bold text-ink sm:text-3xl">Made for where you serve</h2>
          <p className="mt-2 text-gray-600">Pick your venue type and we&apos;ll set things up to suit.</p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {INDUSTRIES.map((industry) => (
              <li key={industry.id}>
                <Link
                  href={`/signup?industry=${industry.id}`}
                  className="block h-full rounded-2xl border border-gray-200 bg-white p-5 transition hover:border-brand-600"
                >
                  <span className="font-semibold text-ink">{industry.name}</span>
                  <span className="mt-1 block text-sm text-gray-600">{industry.blurb}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-bold text-ink sm:text-3xl">Built for busy service</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="rounded-2xl bg-brand-50 p-5">
              <h3 className="font-semibold text-ink">{feature.title}</h3>
              <p className="mt-1 text-sm text-gray-700">{feature.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-ink text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">Set up your venue in minutes</h2>
          <p className="mt-2 text-gray-300">Tell us how you serve guests and print your QR codes.</p>
          <LinkButton href="/signup" className="mt-6">Get started</LinkButton>
        </div>
      </section>
    </>
  );
}
