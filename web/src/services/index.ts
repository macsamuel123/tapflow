import { DEMO_MODE } from "@/lib/demo";
import { DEMO_CLOUD } from "@/lib/demo-cloud/config";
import { mockServices } from "@/mocks";
import { cloudServices } from "@/mocks/cloud";
import type { Services } from "./types";

let shared: Services | undefined;

// To go live, replace one namespace at a time with a real implementation.
export function getServices(): Services {
  if (!DEMO_MODE) throw new Error("Only demo mode is implemented so far");
  if (!DEMO_CLOUD) return mockServices;
  shared ??= cloudServices(mockServices);
  return shared;
}

export * from "./types";
