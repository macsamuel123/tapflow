"use client";

import { Button, Card, FormError, Pill } from "@/components/ui";
import { useData } from "@/lib/use-data";
import { getServices } from "@/services";

export default function PaymentsPage() {
  const { data, error, run } = useData(() => getServices().payments.status());
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black text-ink">Payments</h1>
      <FormError message={error} />
      {data ? (
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold text-ink">Stripe</h2>
            <Pill tone={data.connected ? "green" : "amber"}>{data.connected ? "Connected" : "Not connected"}</Pill>
          </div>
          <p className="text-gray-600">
            {data.connected
              ? `Connected as ${data.accountLabel}.`
              : "Connect Stripe so guests can pay and you receive your payouts."}
          </p>
          {data.connected ? (
            <Button variant="secondary" onClick={() => void run(() => getServices().payments.disconnect())}>Disconnect</Button>
          ) : (
            <Button onClick={() => void run(() => getServices().payments.connect())}>Connect Stripe</Button>
          )}
          <p className="text-sm text-gray-500">Demo only: this doesn&apos;t contact Stripe.</p>
        </Card>
      ) : null}
    </div>
  );
}
