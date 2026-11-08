import type { StaffRole } from "@/services/types";

/** The demo venues' sample team. Their PINs are shown on the Staff page so testers can try
 *  staff mode: demo data only, never a real venue's. */
export const SAMPLE_TEAM: { name: string; role: StaffRole; pin: string | null }[] = [
  { name: "Jordan Lee", role: "manager", pin: null },
  { name: "Mina Park", role: "fulfillment", pin: "1111" },
  { name: "Kai Brooks", role: "bartender", pin: "2222" },
  { name: "Ava Chen", role: "server", pin: "3333" },
  { name: "Theo Grant", role: "runner", pin: "4444" },
  { name: "Rosa Diaz", role: "host", pin: "5555" },
];
