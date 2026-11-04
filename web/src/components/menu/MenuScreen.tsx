"use client";

import { useCallback, useEffect, useState } from "react";
import { CartSheet } from "@/components/cart/CartSheet";
import { ChatDrawerSlot } from "@/components/ChatDrawerSlot";
import { ModifierSheet } from "@/components/modifier-sheet/ModifierSheet";
import { addCartItem, ApiError, getCart, removeCartItem, updateCartItem } from "@/lib/api-client";
import type { Cart, Menu, MenuItem } from "@/lib/api-types";
import { formatCents } from "@/lib/money";
import { ensureSession, type ActiveSession } from "@/lib/session";

type Props = { menu: Menu; slug: string; touchpointId: string; qrToken: string | null };

type SessionState =
  | { kind: "loading" }
  | { kind: "ready"; session: ActiveSession }
  | { kind: "error"; message: string };

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

export function MenuScreen({ menu, slug, touchpointId, qrToken }: Props) {
  const currency = menu.venue.currency;
  const [state, setState] = useState<SessionState>({ kind: "loading" });
  const [cart, setCart] = useState<Cart | null>(null);
  const [openItem, setOpenItem] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartBusy, setCartBusy] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const session = await ensureSession(slug, touchpointId, qrToken);
      setState({ kind: "ready", session });
      setCart(await getCart(session.token));
    } catch (err) {
      setState({ kind: "error", message: message(err) });
    }
  }, [slug, touchpointId, qrToken]);

  useEffect(() => {
    void start();
  }, [start]);

  const token = state.kind === "ready" ? state.session.token : null;

  async function mutate(fn: (t: string) => Promise<Cart>) {
    if (!token) return;
    setCartBusy(true);
    setCartError(null);
    try {
      setCart(await fn(token));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void start();
      setCartError(message(err));
      setCart(await getCart(token).catch(() => cart));
    } finally {
      setCartBusy(false);
    }
  }

  async function add(item: MenuItem, modifierIds: string[], quantity: number, notes: string) {
    if (!token) throw new Error("Still connecting — try again in a moment.");
    const next = await addCartItem(token, { item_id: item.id, modifier_ids: modifierIds, quantity, notes });
    setCart(next);
    setOpenItem(null);
  }

  const session = state.kind === "ready" ? state.session : null;
  const lineCount = cart?.lines.length ?? 0;

  return (
    <div className="mx-auto max-w-2xl pb-28">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 pb-2 pt-4 backdrop-blur">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-xl font-bold">{menu.venue.name}</h1>
          {session?.touchpointLabel && <span className="text-sm text-gray-600">{session.touchpointLabel}</span>}
        </div>
        <nav aria-label="Menu sections" className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
          {menu.categories.map((c) => (
            <a key={c.id} href={`#cat-${c.id}`} className="shrink-0 rounded-full border px-3 py-1 text-sm">
              {c.name}
            </a>
          ))}
        </nav>
      </header>

      {session && !session.verified && (
        <p role="status" className="mx-4 mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          You&apos;re browsing the menu. <strong>Scan the QR at your touchpoint</strong> to order.
        </p>
      )}
      {state.kind === "error" && (
        <div role="alert" className="mx-4 mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {state.message}{" "}
          <button type="button" onClick={() => void start()} className="font-medium underline">
            Retry
          </button>
        </div>
      )}

      {menu.categories.map((c) => (
        <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-28 px-4 pt-6">
          <h2 className="text-lg font-semibold">{c.name}</h2>
          <ul className="mt-2 divide-y">
            {c.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={!item.in_stock || !session}
                  onClick={() => setOpenItem(item)}
                  className="flex w-full items-start justify-between gap-4 py-3 text-left disabled:cursor-not-allowed"
                >
                  <span className={`min-w-0 ${item.in_stock ? "" : "text-gray-400"}`}>
                    <span className="block font-medium">{item.name}</span>
                    {item.description && <span className="mt-0.5 block text-sm text-gray-600">{item.description}</span>}
                    {item.dietary_tags.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {item.dietary_tags.map((t) => (
                          <span key={t} className="rounded bg-green-50 px-1.5 py-0.5 text-xs text-green-800">
                            {t}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block tabular-nums">{formatCents(item.price_cents, currency)}</span>
                    {!item.in_stock && <span className="mt-1 block text-xs font-semibold uppercase text-red-700">Sold out</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {cart && lineCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white p-3">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex w-full max-w-2xl items-center justify-between rounded-lg bg-gray-900 px-4 py-3 font-medium text-white"
          >
            <span>
              View cart · {cart.item_count} {cart.item_count === 1 ? "item" : "items"}
            </span>
            <span className="tabular-nums">{formatCents(cart.total_cents, cart.currency)}</span>
          </button>
        </div>
      )}

      {openItem && (
        <ModifierSheet
          item={openItem}
          currency={currency}
          onClose={() => setOpenItem(null)}
          onAdd={(ids, qty, notes) => add(openItem, ids, qty, notes)}
        />
      )}
      {cartOpen && cart && (
        <CartSheet
          cart={cart}
          busy={cartBusy}
          error={cartError}
          onClose={() => setCartOpen(false)}
          onQuantity={(id, q) => void mutate((t) => updateCartItem(t, id, q))}
          onRemove={(id) => void mutate((t) => removeCartItem(t, id))}
        />
      )}
      <ChatDrawerSlot />
    </div>
  );
}
