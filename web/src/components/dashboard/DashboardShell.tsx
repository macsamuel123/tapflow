"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { getServices, type Venue, type WorkspaceSummary } from "@/services";
import { CLOUD_VENUE_NOTE, SHARED_DEMO_NOTE } from "@/lib/demo-cloud/config";
import { useRealtime, type LiveState } from "@/lib/use-realtime";
import { DashboardContext } from "./DashboardContext";
import { MORE_ICON, PRIMARY_NAV, SECONDARY_NAV, type NavItem } from "./nav";

const LIVE_LABELS: Record<LiveState, string> = { live: "Live", polling: "Polling", offline: "Offline" };
const LIVE_COLOURS: Record<LiveState, string> = {
  live: "bg-brand-600",
  polling: "bg-amber-500",
  offline: "bg-red-600",
};

function isCurrent(pathname: string, href: string): boolean {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}

function SideLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const current = isCurrent(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={current ? "page" : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium ${
        current ? "bg-brand-50 text-brand-800" : "text-gray-700 hover:bg-gray-50"
      }`}
    >
      {item.icon}
      {item.label}
    </Link>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [version, setVersion] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [shared, setShared] = useState(false);
  const [cloudVenue, setCloudVenue] = useState(false);
  const [tick, setTick] = useState(0);
  const live = useRealtime((shared || cloudVenue) && venue ? { kind: "venue", slug: venue.slug } : null, () =>
    setTick((t) => t + 1),
  );

  const refresh = useCallback(async () => {
    const services = getServices();
    const nextVenue = await services.venues.current();
    const [list, isShared, isCloudVenue] = await Promise.all([
      services.venues.listWorkspaces(),
      services.venues.isSharedDemo(),
      services.venues.isCloudVenue(),
    ]);
    setVenue(nextVenue);
    setShared(isShared);
    setCloudVenue(isCloudVenue);
    setWorkspaces(list);
    setWorkspaceId(list.find((w) => w.active)?.id ?? "");
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    void (async () => {
      if (await getServices().auth.getSession()) await refresh();
      else router.replace("/login");
    })();
  }, [refresh, router]);

  useEffect(() => setMoreOpen(false), [pathname]);

  const context = useMemo(
    () => (venue ? { venue, refresh, shared, cloudVenue, tick } : null),
    [venue, refresh, shared, cloudVenue, tick],
  );

  async function switchWorkspace(id: string) {
    await getServices().venues.switchTo(id);
    await refresh();
  }

  async function logOut() {
    await getServices().auth.logOut();
    router.push("/login");
  }

  if (!context) return <p role="status" className="p-6 text-gray-600">Loading...</p>;

  const moreActive = SECONDARY_NAV.some((item) => isCurrent(pathname, item.href));
  return (
    <DashboardContext.Provider value={context}>
      <div className="min-h-dvh bg-gray-50 md:grid md:grid-cols-[15rem_1fr]">
        <aside className="hidden border-r border-gray-200 bg-white p-4 md:flex md:flex-col">
          <Logo href="/dashboard" />
          <nav aria-label="Dashboard" className="mt-6 flex flex-1 flex-col gap-1">
            {[...PRIMARY_NAV, ...SECONDARY_NAV].map((item) => (
              <SideLink key={item.href} item={item} pathname={pathname} />
            ))}
          </nav>
          <button type="button" onClick={() => void logOut()} className="min-h-11 rounded-xl px-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50">
            Log out
          </button>
        </aside>

        <div className="min-w-0 pb-24 md:pb-8">
          <p role="note" className="bg-spark px-4 py-1.5 text-center text-sm font-semibold text-ink">
            Demo mode — sample data
          </p>
          {shared || cloudVenue ? (
            <div className="flex items-center justify-between gap-2 bg-white px-4 py-1.5 text-xs text-gray-600">
              <span data-testid={shared ? "shared-note" : "cloud-venue-note"}>
                {shared ? SHARED_DEMO_NOTE : CLOUD_VENUE_NOTE}
              </span>
              <span role="status" data-testid="connection" className="shrink-0 font-semibold">
                <span aria-hidden className={`mr-1 inline-block size-2 rounded-full ${LIVE_COLOURS[live]}`} />
                {LIVE_LABELS[live]}
              </span>
            </div>
          ) : null}
          <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
            <span className="md:hidden"><Logo href="/dashboard" /></span>
            <label className="ml-auto flex min-w-0 items-center gap-2 text-sm text-gray-600">
              <span className="sr-only md:not-sr-only">Venue</span>
              <select
                aria-label="Switch demo venue"
                value={workspaceId}
                onChange={(e) => void switchWorkspace(e.target.value)}
                className="min-h-11 max-w-44 truncate rounded-xl border border-gray-300 bg-white px-2 text-sm font-semibold text-ink md:max-w-64"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </label>
          </header>
          <main key={version} className="mx-auto max-w-4xl p-4 md:p-6">{children}</main>
        </div>

        {moreOpen ? (
          <div id="more-menu" className="fixed inset-x-3 bottom-20 z-20 rounded-2xl border border-gray-200 bg-white p-2 shadow-lg md:hidden">
            {SECONDARY_NAV.map((item) => (
              <SideLink key={item.href} item={item} pathname={pathname} />
            ))}
            <button type="button" onClick={() => void logOut()} className="min-h-11 w-full rounded-xl px-3 text-left text-sm font-medium text-gray-700">
              Log out
            </button>
          </div>
        ) : null}
        <nav aria-label="Dashboard mobile" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
          {PRIMARY_NAV.map((item) => {
            const current = isCurrent(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${current ? "text-brand-700" : "text-gray-600"}`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-controls="more-menu"
            onClick={() => setMoreOpen((open) => !open)}
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${moreActive || moreOpen ? "text-brand-700" : "text-gray-600"}`}
          >
            {MORE_ICON}
            More
          </button>
        </nav>
      </div>
    </DashboardContext.Provider>
  );
}
