import type { IndustryId, ServiceSetup, SpotType } from "@/services/types";

export type Industry = {
  id: IndustryId;
  name: string;
  blurb: string;
  spotsByDefault: boolean;
  spotType: SpotType;
  pickupByDefault: boolean;
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

export function findIndustry(id: string | null | undefined): Industry | null {
  return INDUSTRIES.find((industry) => industry.id === id) ?? null;
}

export function defaultSetup(industry: Industry | null): ServiceSetup {
  return {
    spotsEnabled: industry?.spotsByDefault ?? true,
    spotType: industry?.spotType ?? "table",
    spotCount: 12,
    pickupEnabled: industry?.pickupByDefault ?? false,
    pickupName: DEFAULT_PICKUP_NAME,
  };
}

export const DEFAULT_PICKUP_NAME = "Pickup counter";
