import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { NotLive } from "@/components/ui";
import { DEMO_MODE } from "@/lib/demo";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!DEMO_MODE) return <NotLive />;
  return <DashboardShell>{children}</DashboardShell>;
}
