import type { OpenSetup } from "@/lib/service-setup";
import type { IndustryId, SpotType } from "@/services/types";

export type Industry = {
  id: IndustryId;
  name: string;
  blurb: string;
  /** Null asks the owner, with nothing pre-selected. */
  spotsByDefault: boolean | null;
  spotType: SpotType;
  pickupByDefault: boolean | null;
};

export const INDUSTRIES: readonly Industry[] = [
  {
    id: "restaurants",
    name: "Restaurants & cafes",
    blurb: "Every table orders the moment it's ready.",
    spotsByDefault: true,
    spotType: "table",
    pickupByDefault: false,
  },
  {
    id: "breweries",
    name: "Breweries & taprooms",
    blurb: "Rounds keep coming without a line at the bar.",
    spotsByDefault: true,
    spotType: "table",
    pickupByDefault: false,
  },
  {
    id: "stadiums",
    name: "Stadiums & arenas",
    blurb: "Fans order from their seat and miss none of the game.",
    spotsByDefault: true,
    spotType: "seat",
    pickupByDefault: false,
  },
  {
    id: "resorts",
    name: "Resorts & pools",
    blurb: "Drinks and snacks come right to the lounger.",
    spotsByDefault: true,
    spotType: "lounger",
    pickupByDefault: false,
  },
  {
    id: "golf",
    name: "Golf courses",
    blurb: "Order from the cart and pick up the pace of play.",
    spotsByDefault: true,
    spotType: "cart",
    pickupByDefault: false,
  },
  {
    id: "food-halls",
    name: "Food halls",
    blurb: "Guests order ahead and collect when it's called.",
    spotsByDefault: false,
    spotType: "table",
    pickupByDefault: true,
  },
  {
    id: "food-trucks",
    name: "Food trucks",
    blurb: "Shorter lines at the window, even at the rush.",
    spotsByDefault: false,
    spotType: "table",
    pickupByDefault: true,
  },
];

/** Any other kind of venue: the owner names it, and answers the setup questions themselves. */
export const OTHER_INDUSTRY: Industry = {
  id: "other",
  name: "Other",
  blurb: "Tell us what you run.",
  spotsByDefault: null,
  spotType: "table",
  pickupByDefault: null,
};

/** The sign-up picker: every industry, then Other. */
export const SIGNUP_INDUSTRIES: readonly Industry[] = [...INDUSTRIES, OTHER_INDUSTRY];

export const MAX_VENUE_TYPE = 40;

export function venueTypeError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Tell us what kind of venue it is.";
  return trimmed.length > MAX_VENUE_TYPE ? `Use ${MAX_VENUE_TYPE} characters or fewer.` : null;
}

export function findIndustry(id: string | null | undefined): Industry | null {
  return SIGNUP_INDUSTRIES.find((industry) => industry.id === id) ?? null;
}

export function defaultSetup(industry: Industry | null): OpenSetup {
  return {
    spotsEnabled: industry ? industry.spotsByDefault : true,
    spotType: industry?.spotType ?? "table",
    spotCount: 12,
    pickupEnabled: industry ? industry.pickupByDefault : false,
    pickupName: DEFAULT_PICKUP_NAME,
  };
}

export const DEFAULT_PICKUP_NAME = "Pickup counter";
