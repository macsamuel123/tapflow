"use client";

import { useEffect } from "react";
import type { Cart } from "@/lib/api-types";
import { formatCents } from "@/lib/money";

type Props = {
  cart: Cart;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onQuantity: (lineId: string, quantity: number) => void;
  onRemove: (lineId: string) => void;
};

function taxLabel(code: string, bps: number): string {
  // 500 bps → "5%", 1250 → "12.5%": string formatting of an integer, no float math.
  const whole = (bps - (bps % 100)) / 100;
  const frac = String(bps % 100).padStart(2, "0").replace(/0+$/, "");
  return `${code} ${whole}${frac ? `.${frac}` : ""}%`;
}

export function CartSheet({ cart, busy, error, onClose, onQuantity, onRemove }: Props) {
  const c = cart.currency;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-title"
        className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-4">
          <h2 id="cart-title" className="text-lg font-semibold">
            Your order
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-2xl leading-none text-gray-500">
            ×
          </button>
        </div>

        <ul className="flex-1 divide-y overflow-y-auto px-4">
          {cart.lines.length === 0 && <li className="py-8 text-center text-gray-500">Your cart is empty.</li>}
          {cart.lines.map((line) => (
            <li key={line.id} className={`py-3 ${line.available ? "" : "opacity-70"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{line.name}</p>
                  {line.modifiers.length > 0 && (
                    <p className="text-sm text-gray-600">{line.modifiers.map((m) => m.name).join(", ")}</p>
                  )}
                  {line.notes && <p className="text-sm italic text-gray-500">“{line.notes}”</p>}
                  {!line.available && (
                    <p role="alert" className="mt-1 text-sm font-medium text-red-700">
                      {line.problem} Remove it to continue.
                    </p>
                  )}
                </div>
                <p className="shrink-0 tabular-nums">{line.available ? formatCents(line.line_total_cents, c) : "—"}</p>
              </div>
              <div className="mt-2 flex items-center gap-3">
                {line.available && (
                  <div className="flex items-center rounded-lg border text-sm">
                    <button
                      type="button"
                      aria-label={`Decrease ${line.name}`}
                      disabled={busy || line.quantity <= 1}
                      onClick={() => onQuantity(line.id, line.quantity - 1)}
                      className="px-3 py-1 disabled:text-gray-300"
                    >
                      −
                    </button>
                    <span className="w-6 text-center tabular-nums">{line.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Increase ${line.name}`}
                      disabled={busy || line.quantity >= 20}
                      onClick={() => onQuantity(line.id, line.quantity + 1)}
                      className="px-3 py-1 disabled:text-gray-300"
                    >
                      +
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRemove(line.id)}
                  className="text-sm text-gray-600 underline disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="space-y-1 border-t p-4 text-sm">
          {error && (
            <p role="alert" className="pb-2 text-red-700">
              {error}
            </p>
          )}
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatCents(cart.subtotal_cents, c)}</span>
          </div>
          {cart.tax_breakdown.map((t) => (
            <div key={t.code} className="flex justify-between text-gray-600">
              <span>{taxLabel(t.code, t.rate_bps)}</span>
              <span className="tabular-nums">{formatCents(t.tax_cents, c)}</span>
            </div>
          ))}
          <div className="flex justify-between pt-1 text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatCents(cart.total_cents, c)}</span>
          </div>

          {cart.verified ? (
            <>
              <button
                type="button"
                disabled
                className="mt-3 w-full rounded-lg bg-gray-900 px-4 py-3 font-medium text-white disabled:opacity-50"
              >
                Checkout
              </button>
              <p className="text-center text-xs text-gray-500">Payment is coming soon.</p>
            </>
          ) : (
            <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-center text-amber-900">
              Scan the QR at your touchpoint to check out.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
