"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { CartSheet } from "@/components/cart/CartSheet";
import { GuestMenuHeader } from "@/components/guest/GuestMenuHeader";
import { ModifierSheet } from "@/components/modifier-sheet/ModifierSheet";
import { Button, FormError, TextField } from "@/components/ui";
import type { Cart, MenuItem } from "@/lib/api-types";
import { brandStyle } from "@/lib/brand/style";
import { LOCAL_VENUE_NOTE } from "@/lib/demo";
import { CHECKOUT_NOTE, DEMO_CLOUD, SHARED_SLUGS, VENUE_NOT_FOUND_NOTE } from "@/lib/demo-cloud/config";
import { MAX_GUEST_NAME } from "@/lib/guest";
import { SAMPLE_ALLERGENS_NOTE } from "@/lib/menu/allergens";
import { formatCents } from "@/lib/money";
import { useData } from "@/lib/use-data";
import { useLive } from "@/lib/use-live";
import { useRealtime } from "@/lib/use-realtime";
import { getServices, ServiceError, type GuestContext, type GuestVenue } from "@/services";

const ACCESS_NOTES: Record<Exclude<GuestVenue["access"], "verified">, string> = {
  "no-token": "You're browsing the menu. Scan the QR on your touchpoint to order.",
  "bad-token": "This QR code is out of date. Scan the QR on your touchpoint to order.",
  inactive: "This spot isn't taking orders right now. Please ask a member of staff.",
};

function errorText(err: unknown): string {
  return err instanceof ServiceError ? err.message : "Something went wrong. Please try again.";
}

async function load(context: GuestContext) {
  const { guest } = getServices();
  const venue = await guest.open(context);
  return { venue, cart: venue ? await guest.getCart(context) : null };
}

function NotFoundHere() {
  return (
    <main className="mx-auto max-w-md space-y-3 p-6">
      <h1 className="text-2xl font-black text-ink">We can&apos;t find this menu</h1>
      {DEMO_CLOUD ? (
        <p role="note" className="text-gray-600">{VENUE_NOT_FOUND_NOTE}</p>
      ) : (
        <>
          <p role="note" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-ink">{LOCAL_VENUE_NOTE}</p>
          <p className="text-gray-600">Open this QR code in the browser you signed up with.</p>
        </>
      )}
    </main>
  );
}

export function GuestMenuScreen({ context }: { context: GuestContext }) {
  const router = useRouter();
  const { data, error, reload } = useData(useCallback(() => load(context), [context]));
  const [openItem, setOpenItem] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [guestName, setGuestName] = useState("");

  useLive(() => void reload()); // sold-out, price and QR changes from the dashboard
  const fixedDemo = SHARED_SLUGS.includes(context.slug);
  useRealtime(DEMO_CLOUD ? { kind: fixedDemo ? "stock" : "menu", slug: context.slug } : null, () => void reload());
  const { guest } = getServices();

  if (!data) return <div className="p-6"><FormError message={error} /></div>;
  const { venue, cart } = data;
  if (!venue || !cart) return <NotFoundHere />;
  const { menu, access, serviceMode, touchpointLabel, localOnly, branding } = venue;
  const currency = menu.venue.currency;
  const sampleNote = menu.categories.some((c) => c.items.some((i) => i.allergens.some((a) => a.includes("(sample data)"))));
  const pickup = serviceMode === "pickup";

  async function change(action: () => Promise<Cart>) {
    setBusy(true);
    setCartError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      setCartError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function add(item: MenuItem, modifierIds: string[], quantity: number, notes: string) {
    try {
      await guest.addItem(context, { item_id: item.id, modifier_ids: modifierIds, quantity, notes });
    } catch (err) {
      throw new Error(errorText(err));
    }
    await reload();
    setOpenItem(null);
  }

  async function placeOrder() {
    setBusy(true);
    setCartError(null);
    try {
      const orderId = await guest.placeOrder(context, pickup ? guestName : null);
      const back = new URLSearchParams({ tp: context.touchpointId, token: context.token ?? "" });
      router.push(`/demo/v/${context.slug}/order/${orderId}?${back.toString()}`);
    } catch (err) {
      setCartError(errorText(err));
      setBusy(false);
      await reload();
    }
  }

  const blocked = cart.lines.some((l) => !l.available);
  return (
    <div className="mx-auto max-w-2xl pb-28" style={brandStyle(branding.color)}>
      <GuestMenuHeader name={menu.venue.name} touchpointLabel={touchpointLabel} branding={branding}>
        <nav aria-label="Menu sections" className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
          {menu.categories.map((c) => (
            <a key={c.id} href={`#cat-${c.id}`} className="shrink-0 rounded-full border px-3 py-1 text-sm">{c.name}</a>
          ))}
        </nav>
      </GuestMenuHeader>

      <div className="space-y-2 px-4 pt-3">
        <p role="note" className="rounded-lg bg-spark/30 px-3 py-2 text-sm font-medium text-ink">
          Demo menu. No real orders or payments.
          {sampleNote ? ` Allergens shown are ${SAMPLE_ALLERGENS_NOTE.toLowerCase()}.` : ""}
        </p>
        {localOnly ? <p role="note" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-ink">{LOCAL_VENUE_NOTE}</p> : null}
        {access !== "verified" ? (
          <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{ACCESS_NOTES[access]}</p>
        ) : null}
        <FormError message={error} />
      </div>

      {menu.categories.map((c) => (
        <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-28 px-4 pt-6">
          <h2 className="text-lg font-semibold">{c.name}</h2>
          <ul className="mt-2 divide-y">
            {c.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={!item.in_stock}
                  onClick={() => setOpenItem(item)}
                  className="flex w-full items-start gap-3 py-3 text-left disabled:cursor-not-allowed"
                >
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a local blob URL, which next/image can't optimise
                    <img src={item.image_url} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
                  ) : null}
                  <span className={`min-w-0 flex-1 ${item.in_stock ? "" : "text-gray-400"}`}>
                    <span className="block font-medium">{item.name}</span>
                    {item.description ? <span className="mt-0.5 block text-sm text-gray-600">{item.description}</span> : null}
                    {item.allergen_note ? (
                      <span className="mt-1 block text-sm font-semibold text-amber-800">{item.allergen_note}</span>
                    ) : (
                      <span className="mt-1 block text-xs text-gray-600">
                        {item.allergens.length ? `Contains: ${item.allergens.join(", ")}` : "No listed allergens"}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block tabular-nums">{formatCents(item.price_cents, currency)}</span>
                    {item.in_stock ? null : <span className="mt-1 block text-xs font-semibold text-red-700 uppercase">Sold out</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {cart.lines.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white p-3">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="brand-button mx-auto flex w-full max-w-2xl items-center justify-between rounded-lg px-4 py-3 font-medium"
          >
            <span>View cart · {cart.item_count} {cart.item_count === 1 ? "item" : "items"}</span>
            <span className="tabular-nums">{formatCents(cart.total_cents, cart.currency)}</span>
          </button>
        </div>
      ) : null}

      {openItem ? (
        <ModifierSheet
          // The shared sheet has no allergen note, so it travels in the description.
          item={
            openItem.allergen_note
              ? { ...openItem, description: `${openItem.description} ${openItem.allergen_note}.`.trim() }
              : openItem
          }
          currency={currency}
          onClose={() => setOpenItem(null)}
          onAdd={(ids, qty, notes) => add(openItem, ids, qty, notes)}
        />
      ) : null}
      {cartOpen ? (
        <CartSheet
          cart={cart}
          busy={busy}
          error={cartError}
          onClose={() => setCartOpen(false)}
          onQuantity={(id, q) => void change(() => guest.updateLine(context, id, q))}
          onRemove={(id) => void change(() => guest.removeLine(context, id))}
          checkout={
            <div className="mt-3 space-y-2">
              {pickup ? (
                <TextField
                  label="Your first name"
                  autoComplete="given-name"
                  maxLength={MAX_GUEST_NAME}
                  hint="We'll call this name with your pickup number."
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                />
              ) : null}
              <Button variant="brand" className="w-full" disabled={busy || blocked || !cart.can_checkout} onClick={() => void placeOrder()}>
                Pay {formatCents(cart.total_cents, cart.currency)} (demo)
              </Button>
              <p className="text-center text-xs text-gray-500">
                {blocked ? "Remove unavailable items to continue." : "No real payment is taken."}
              </p>
              <p className="text-center text-xs font-medium text-gray-600">{CHECKOUT_NOTE}</p>
            </div>
          }
        />
      ) : null}
    </div>
  );
}
