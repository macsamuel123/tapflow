import type { Metadata } from "next";
import { NotLive } from "@/components/ui";
import { DEMO_MODE } from "@/lib/demo";

export const metadata: Metadata = { title: "Staff mode", robots: { index: false } };

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return DEMO_MODE ? <div className="mx-auto min-h-dvh max-w-2xl">{children}</div> : <NotLive />;
}
