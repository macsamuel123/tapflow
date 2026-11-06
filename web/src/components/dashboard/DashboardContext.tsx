"use client";

import { createContext, useContext, useEffect } from "react";
import type { Venue } from "@/services/types";

export type DashboardValue = {
  venue: Venue;
  refresh: () => Promise<void>;
  /** A demo venue shared across devices: read-only apart from orders and sold-out. */
  shared: boolean;
  /** A tester's venue saved in the cloud. Editable, and live like the demos. */
  cloudVenue: boolean;
  /** Counts up whenever shared data changes, so pages know to reload. */
  tick: number;
};

export const DashboardContext = createContext<DashboardValue | null>(null);

/** Reloads a page's data when shared orders or stock change. */
export function useDashboardReload(reload: () => unknown): void {
  const value = useContext(DashboardContext);
  const tick = value?.tick ?? 0;
  useEffect(() => {
    if (tick > 0) void reload();
  }, [tick, reload]);
}

export function useDashboard() {
  const value = useContext(DashboardContext);
  if (!value) throw new Error("useDashboard must be used inside DashboardShell");
  return value;
}
