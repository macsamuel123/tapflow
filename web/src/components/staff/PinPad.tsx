"use client";

import { useState } from "react";
import { FormError } from "@/components/ui";
import { LOCKED_MESSAGE, PIN_ROLES } from "@/lib/staff/permissions";
import type { RoleLabels, StaffLoginResult } from "@/services/types";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

function list(labels: string[]): string {
  return labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}` : (labels[0] ?? "");
}

export function PinPad({
  venueName,
  labels,
  notice,
  onSubmit,
}: {
  venueName: string;
  labels: RoleLabels;
  /** Shown above the pad, e.g. after being signed out. */
  notice: string | null;
  onSubmit: (pin: string) => Promise<StaffLoginResult>;
}) {
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function press(digit: string) {
    if (busy || pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    if (next.length < 4) return;
    setBusy(true);
    const result = await onSubmit(next).catch((): StaffLoginResult => ({ status: "no_venue" }));
    setBusy(false);
    setPin("");
    if (result.status === "wrong_pin") {
      setMessage(`That PIN didn't match. ${result.triesLeft} ${result.triesLeft === 1 ? "try" : "tries"} left.`);
    } else if (result.status === "locked") {
      setMessage(LOCKED_MESSAGE);
    } else if (result.status === "no_venue") {
      setMessage("Something went wrong. Try again.");
    }
  }

  return (
    <main className="space-y-6 px-4 py-8 text-center">
      <div>
        <p className="text-sm font-semibold text-brand-700">Staff mode</p>
        <h1 className="text-2xl font-black text-ink">{venueName}</h1>
        <p className="mt-1 text-sm text-gray-600">
          {list(PIN_ROLES.map((r) => labels[r]))} sign in with their 4-digit PIN.
        </p>
      </div>
      {notice ? <p role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-ink">{notice}</p> : null}
      <div aria-label={`PIN, ${pin.length} of 4 digits entered`} role="img" className="flex justify-center gap-3">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`size-4 rounded-full border-2 border-ink ${i < pin.length ? "bg-ink" : ""}`} />
        ))}
      </div>
      <FormError message={message} />
      <div className="mx-auto grid max-w-xs grid-cols-3 gap-3">
        {KEYS.map((key) => (
          <PadKey key={key} label={key} disabled={busy} onPress={() => void press(key)} />
        ))}
        <span />
        <PadKey label="0" disabled={busy} onPress={() => void press("0")} />
        <button
          type="button"
          aria-label="Delete digit"
          disabled={busy || pin.length === 0}
          onClick={() => setPin(pin.slice(0, -1))}
          className="min-h-16 rounded-2xl text-lg font-semibold text-gray-700 disabled:opacity-40"
        >
          ⌫
        </button>
      </div>
    </main>
  );
}

function PadKey({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPress}
      className="min-h-16 rounded-2xl border border-gray-300 bg-white text-2xl font-semibold text-ink active:bg-gray-100 disabled:opacity-50"
    >
      {label}
    </button>
  );
}
