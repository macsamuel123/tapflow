import { DEMO_MODE } from "@/lib/demo";
import { mockServices } from "@/mocks";
import type { Services } from "./types";

// To go live, replace one namespace at a time with a real implementation.
export function getServices(): Services {
  if (!DEMO_MODE) throw new Error("Only demo mode is implemented so far");
  return mockServices;
}

export * from "./types";
