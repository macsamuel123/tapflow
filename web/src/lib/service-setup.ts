import type { ServiceSetup, SpotType } from "@/services/types";

export const MIN_SPOTS = 1;
export const MAX_SPOTS = 500;
export const MAX_PICKUP_NAME = 40;

const SPOT_LABELS: Record<SpotType, string> = {
  table: "Table",
  seat: "Seat",
  lounger: "Lounger",
  cart: "Cart",
};

export const SPOT_TYPES = Object.keys(SPOT_LABELS) as SpotType[];

export function spotLabel(type: SpotType): string {
  return SPOT_LABELS[type];
}

export function spotName(type: SpotType, number: number): string {
  return `${SPOT_LABELS[type]} ${number}`;
}

export function spotPlural(type: SpotType): string {
  return `${SPOT_LABELS[type]}s`;
}

/** The count exactly as typed, so "12.5", "" and "abc" are rejected rather than coerced. */
export function parseSpotCount(raw: string): number | null {
  if (!/^\d{1,4}$/.test(raw.trim())) return null;
  const count = Number(raw.trim());
  return count >= MIN_SPOTS && count <= MAX_SPOTS ? count : null;
}

export type SetupErrors = { spotCount?: string; pickupName?: string; choice?: string };

export const CHOOSE_ONE_MESSAGE = "Choose at least one: tables or spots, or a pickup point.";

export function spotCountMessage(): string {
  return `Enter a whole number from ${MIN_SPOTS} to ${MAX_SPOTS}.`;
}

export function validateSetup(
  setup: Pick<ServiceSetup, "spotsEnabled" | "pickupEnabled" | "pickupName">,
  rawSpotCount: string,
): SetupErrors {
  const errors: SetupErrors = {};
  if (!setup.spotsEnabled && !setup.pickupEnabled) errors.choice = CHOOSE_ONE_MESSAGE;
  if (setup.spotsEnabled && parseSpotCount(rawSpotCount) === null) {
    errors.spotCount = spotCountMessage();
  }
  const pickupName = setup.pickupName.trim();
  if (setup.pickupEnabled && !pickupName) errors.pickupName = "Give your pickup point a name.";
  if (setup.pickupEnabled && pickupName.length > MAX_PICKUP_NAME) {
    errors.pickupName = `Use ${MAX_PICKUP_NAME} characters or fewer.`;
  }
  return errors;
}

/** "You'll get 12 table QR codes + 1 pickup QR code." */
export function setupPreview(
  spotsEnabled: boolean,
  spotType: SpotType,
  rawSpotCount: string,
  pickupEnabled: boolean,
): string | null {
  const parts: string[] = [];
  if (spotsEnabled) {
    const count = parseSpotCount(rawSpotCount);
    if (count === null) return null;
    const noun = SPOT_LABELS[spotType].toLowerCase();
    parts.push(`${count} ${noun} QR ${count === 1 ? "code" : "codes"}`);
  }
  if (pickupEnabled) parts.push("1 pickup QR code");
  return parts.length ? `You'll get ${parts.join(" + ")}.` : null;
}
