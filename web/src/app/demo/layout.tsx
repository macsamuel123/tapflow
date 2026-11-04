import type { Metadata } from "next";
import { NotLive } from "@/components/ui";
import { DEMO_MODE } from "@/lib/demo";

export const metadata: Metadata = { title: "Menu", robots: { index: false } };

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return DEMO_MODE ? children : <NotLive />;
}
