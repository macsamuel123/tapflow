import type { Metadata } from "next";
import { LinkButton } from "@/components/ui";

export const metadata: Metadata = { title: "Guest ordering preview", robots: { index: false } };

export default function DemoScanPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-black text-ink">Your QR code works</h1>
      <p className="mt-3 text-gray-700">
        This is where guests will see your menu, order and pay. Guest ordering isn&apos;t connected
        in this demo yet.
      </p>
      <LinkButton href="/dashboard" className="mt-6">Back to dashboard</LinkButton>
    </div>
  );
}
