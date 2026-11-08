"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, FormError } from "@/components/ui";
import { staffViews, type StaffView } from "@/lib/staff/permissions";
import { useData } from "@/lib/use-data";
import { useLive } from "@/lib/use-live";
import { getServices, type StaffSession } from "@/services";
import { PinPad } from "./PinPad";
import { FulfillmentView, HostView, ReadyView } from "./StaffViews";

const VIEW_NAMES: Record<StaffView, string> = { fulfillment: "Prepare", ready: "Ready to deliver", host: "Orders" };
const SIGNED_OUT = "You've been signed out. Enter your PIN again.";

async function load(slug: string) {
  const { staffMode } = getServices();
  const [venue, session] = await Promise.all([staffMode.venue(slug), staffMode.current(slug)]);
  return { venue, session };
}

export function StaffModeScreen({ slug }: { slug: string }) {
  const { data, error, reload } = useData(useCallback(() => load(slug), [slug]));
  const [justSignedIn, setJustSignedIn] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<StaffView | null>(null);
  const session = data?.session ?? null;

  // A deactivation or PIN reset in the dashboard signs this device out on the next check.
  useLive(() => void reload());
  const [wasSignedIn, setWasSignedIn] = useState<string | null>(null);
  useEffect(() => {
    if (session) setWasSignedIn(session.staffId);
    else if (wasSignedIn) {
      setWasSignedIn(null);
      setNotice(SIGNED_OUT);
    }
  }, [session, wasSignedIn]);

  if (!data) return <div className="p-6"><FormError message={error} /></div>;
  if (!data.venue) {
    return (
      <main className="space-y-3 p-6">
        <h1 className="text-2xl font-black text-ink">We can&apos;t find this venue</h1>
        <p className="text-gray-600">Open staff mode from the Staff page of the venue&apos;s dashboard.</p>
      </main>
    );
  }

  if (!session) {
    return (
      <PinPad
        venueName={data.venue.name}
        labels={data.venue.roleLabels}
        notice={notice}
        onSubmit={async (pin) => {
          const result = await getServices().staffMode.login(slug, pin);
          if (result.status === "ok") {
            setNotice(null);
            setJustSignedIn(true);
            setView(null);
            await reload();
          }
          return result;
        }}
      />
    );
  }

  const views = staffViews(session.role);
  const shown = view && views.includes(view) ? view : views[0];

  async function switchUser() {
    await getServices().staffMode.logout(slug);
    setJustSignedIn(false);
    setWasSignedIn(null);
    await reload();
  }

  return (
    <StaffShell session={session} onSwitch={() => void switchUser()}>
      {justSignedIn ? (
        <p role="status" className="rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-800">
          Signed in as {session.roleLabel}
        </p>
      ) : null}
      {views.length > 1 ? (
        <div role="tablist" aria-label="Staff views" className="flex gap-2">
          {views.map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={v === shown}
              onClick={() => setView(v)}
              className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${
                v === shown ? "border-brand-700 bg-brand-50 text-brand-800" : "border-gray-300 bg-white text-gray-700"
              }`}
            >
              {VIEW_NAMES[v]}
            </button>
          ))}
        </div>
      ) : null}
      {shown === "fulfillment" ? <FulfillmentView slug={slug} session={session} /> : null}
      {shown === "ready" ? <ReadyView slug={slug} session={session} /> : null}
      {shown === "host" ? <HostView slug={slug} session={session} /> : null}
    </StaffShell>
  );
}

function StaffShell({ session, onSwitch, children }: { session: StaffSession; onSwitch: () => void; children: React.ReactNode }) {
  return (
    <div className="space-y-4 px-4 pb-10">
      <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 border-b bg-white/95 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <p className="truncate text-sm text-gray-600">{session.venueName}</p>
          <p data-testid="staff-header" className="truncate font-bold text-ink">
            {session.name} · {session.roleLabel}
          </p>
        </div>
        <Button variant="secondary" onClick={onSwitch}>Switch user</Button>
      </header>
      {children}
    </div>
  );
}
