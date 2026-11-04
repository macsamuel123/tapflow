"use client";

import { createContext, useContext } from "react";
import type { Venue } from "@/services/types";

export const DashboardContext = createContext<{ venue: Venue; refresh: () => Promise<void> } | null>(null);

export function useDashboard() {
  const value = useContext(DashboardContext);
  if (!value) throw new Error("useDashboard must be used inside DashboardShell");
  return value;
}
