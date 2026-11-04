import { DEFAULT_PICKUP_NAME } from "@/lib/industries";
import { spotName } from "@/lib/service-setup";
import type {
  CountryCode,
  IndustryId,
  MenuCategory,
  MenuItem,
  Order,
  OrderStatus,
  ServiceMode,
  ServiceSetup,
  StaffMember,
  TaxRate,
  Touchpoint,
  Venue,
} from "@/services/types";
import type { Workspace } from "./store";

export const BREWERY_ID = "demo-brewery";
export const FOOD_TRUCK_ID = "demo-food-truck";
export const YOUR_VENUE_ID = "your-venue";

const GST: TaxRate = { code: "GST", name: "Goods and Services Tax", rateBps: 500 };
const PST: TaxRate = { code: "PST", name: "Provincial Sales Tax", rateBps: 1000 };

const GUESTS = ["Amara", "Noah", "Priya", "Leo", "Sofia", "Mateo", "Hana", "Owen", "Zoe"];
const FIRST_TICKET = 7;

function id(): string {
  return crypto.randomUUID();
}

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
  return slug.length >= 2 ? slug : "venue";
}

export function makeSpot(type: ServiceSetup["spotType"], number: number): Touchpoint {
  return {
    id: id(),
    label: spotName(type, number),
    serviceMode: "delivery",
    spotNumber: number,
    active: true,
    token: "demo",
  };
}

export function makePickup(name: string): Touchpoint {
  return { id: id(), label: name, serviceMode: "pickup", spotNumber: null, active: true, token: "demo" };
}

function item(
  name: string,
  description: string,
  priceCents: number,
  taxCategory: MenuItem["taxCategory"] = "Food",
  inStock = true,
): MenuItem {
  return { id: id(), name, description, priceCents, taxCategory, inStock };
}

function breweryMenu(): MenuCategory[] {
  return [
    {
      id: id(),
      name: "On tap",
      items: [
        item("Harbour Lager", "Crisp and clean, 5.0%.", 800, "Alcohol"),
        item("Cedar IPA", "Pine and citrus, 6.5%.", 900, "Alcohol"),
        item("Night Shift Stout", "Coffee and dark chocolate, 5.8%.", 900, "Alcohol", false),
        item("Tasting flight", "Four small pours of your choice.", 1400, "Alcohol"),
      ],
    },
    {
      id: id(),
      name: "Bites",
      items: [
        item("Soft pretzel", "Baked here, with beer mustard.", 900),
        item("Smash burger", "Double patty, pickles, house sauce.", 1800),
        item("Crispy wings", "Eight wings with hot honey.", 1600),
      ],
    },
    {
      id: id(),
      name: "No alcohol",
      items: [
        item("Sparkling lemonade", "Made fresh daily.", 500),
        item("Cold brew", "Slow-steeped for 18 hours.", 550),
      ],
    },
  ];
}

function foodMenu(): MenuCategory[] {
  return [
    {
      id: id(),
      name: "Mains",
      items: [
        item("Birria tacos", "Three tacos with consomme for dipping.", 1600),
        item("Crispy fish tacos", "Lime slaw and chipotle crema.", 1500),
        item("Loaded fries", "Cheese, green onion, house sauce.", 1100),
        item("Veggie burrito", "Black beans, rice, roasted peppers.", 1400, "Food", false),
      ],
    },
    {
      id: id(),
      name: "Drinks",
      items: [
        item("Horchata", "Cinnamon rice milk over ice.", 500),
        item("Hibiscus iced tea", "Lightly sweet and tart.", 450),
      ],
    },
  ];
}

function taxFor(lines: { amount: number; category: MenuItem["taxCategory"] }[]): number {
  // Same rule as the API: each tax rounds half-up on its own pre-tax base.
  const total = (lines_: typeof lines) => lines_.reduce((sum, l) => sum + l.amount, 0);
  const halfUp = (base: number, bps: number) => {
    const scaled = base * bps + 5000;
    return (scaled - (scaled % 10000)) / 10000;
  };
  return (
    halfUp(total(lines), GST.rateBps) +
    halfUp(total(lines.filter((l) => l.category === "Alcohol")), PST.rateBps)
  );
}

function closedStatus(mode: ServiceMode): OrderStatus {
  return mode === "pickup" ? "picked_up" : "delivered";
}

// Oldest first: closed orders, one cancelled, then the live board.
const ORDER_PLAN: { status: OrderStatus | "closed"; minutesAgo: number }[] = [
  { status: "closed", minutesAgo: 96 },
  { status: "closed", minutesAgo: 81 },
  { status: "closed", minutesAgo: 64 },
  { status: "cancelled", minutesAgo: 52 },
  { status: "closed", minutesAgo: 41 },
  { status: "accepted", minutesAgo: 17 },
  { status: "ready", minutesAgo: 11 },
  { status: "accepted", minutesAgo: 6 },
  { status: "paid", minutesAgo: 2 },
];

function sampleOrders(menu: MenuCategory[], touchpoints: Touchpoint[]): Order[] {
  const items = menu.flatMap((c) => c.items).filter((i) => i.inStock);
  const spots = touchpoints.filter((t) => t.serviceMode === "delivery" && t.active);
  const pickups = touchpoints.filter((t) => t.serviceMode === "pickup" && t.active);
  const now = Date.now();

  const orders = ORDER_PLAN.map((plan, i): Order => {
    const pickup = pickups.length > 0 && (spots.length === 0 || i % 3 === 0);
    const spot = spots[(i * 5) % Math.max(spots.length, 1)];
    const point = pickup ? pickups[i % pickups.length] : spot;
    if (!point || items.length === 0) throw new Error("A workspace needs a touchpoint and items");
    const mode: ServiceMode = pickup ? "pickup" : "delivery";
    const chosen = [items[i % items.length]!, items[(i * 2 + 1) % items.length]!];
    const lines = chosen.map((m, n) => ({
      name: m.name,
      quantity: n === 0 ? (i % 2) + 1 : 1,
      unitPriceCents: m.priceCents,
      category: m.taxCategory,
    }));
    const amounts = lines.map((l) => ({ amount: l.unitPriceCents * l.quantity, category: l.category }));
    const subtotalCents = amounts.reduce((sum, l) => sum + l.amount, 0);
    const taxCents = taxFor(amounts);
    return {
      id: id(),
      ticketNumber: FIRST_TICKET + i,
      serviceMode: mode,
      touchpointLabel: point.label,
      guestName: pickup ? GUESTS[i % GUESTS.length]! : null,
      status: plan.status === "closed" ? closedStatus(mode) : plan.status,
      placedAt: new Date(now - plan.minutesAgo * 60_000).toISOString(),
      lines: lines.map(({ name, quantity, unitPriceCents }) => ({ name, quantity, unitPriceCents })),
      subtotalCents,
      taxCents,
      totalCents: subtotalCents + taxCents,
    };
  });
  return orders.reverse();
}

function sampleStaff(owner: { name: string; email: string }, domain: string): StaffMember[] {
  return [
    { id: id(), name: owner.name, email: owner.email, role: "owner" },
    { id: id(), name: "Jordan Lee", email: `jordan@${domain}`, role: "manager" },
    { id: id(), name: "Mina Park", email: `mina@${domain}`, role: "fulfillment" },
    { id: id(), name: "Theo Grant", email: `theo@${domain}`, role: "runner" },
  ];
}

function venue(
  name: string,
  slug: string,
  industry: IndustryId,
  country: CountryCode,
  region: string,
): Venue {
  return { id: id(), slug, name, industry, country, region, currency: country === "US" ? "USD" : "CAD" };
}

export function demoBrewery(): Workspace {
  const touchpoints = [
    ...Array.from({ length: 12 }, (_, i) => makeSpot("table", i + 1)),
    makePickup("Bar counter"),
  ];
  const menu = breweryMenu();
  return {
    id: BREWERY_ID,
    venue: venue("Demo Brewery", "demo-brewery", "breweries", "CA", "British Columbia"),
    spotType: "table",
    touchpoints,
    orders: sampleOrders(menu, touchpoints),
    menu,
    staff: sampleStaff({ name: "Sam Rivera", email: "sam@demobrewery.test" }, "demobrewery.test"),
    payment: { connected: true, accountLabel: "Demo Brewery (test account)" },
    taxes: [GST, PST],
  };
}

export function demoFoodTruck(): Workspace {
  const touchpoints = [makePickup("Pickup window")];
  const menu = foodMenu();
  return {
    id: FOOD_TRUCK_ID,
    venue: venue("Demo Food Truck", "demo-food-truck", "food-trucks", "CA", "British Columbia"),
    spotType: "table",
    touchpoints,
    orders: sampleOrders(menu, touchpoints),
    menu,
    staff: sampleStaff({ name: "Ana Torres", email: "ana@demotruck.test" }, "demotruck.test"),
    payment: { connected: false, accountLabel: null },
    taxes: [GST, PST],
  };
}

export function workspaceFromSignUp(input: {
  industry: IndustryId;
  name: string;
  email: string;
  venueName: string;
  country: CountryCode;
  region: string;
  setup: ServiceSetup;
}): Workspace {
  const { setup } = input;
  const touchpoints = [
    ...(setup.spotsEnabled
      ? Array.from({ length: setup.spotCount }, (_, i) => makeSpot(setup.spotType, i + 1))
      : []),
    ...(setup.pickupEnabled ? [makePickup(setup.pickupName.trim() || DEFAULT_PICKUP_NAME)] : []),
  ];
  const menu = input.industry === "breweries" ? breweryMenu() : foodMenu();
  return {
    id: YOUR_VENUE_ID,
    venue: venue(input.venueName, slugify(input.venueName), input.industry, input.country, input.region),
    spotType: setup.spotType,
    touchpoints,
    orders: sampleOrders(menu, touchpoints),
    menu,
    staff: sampleStaff({ name: input.name, email: input.email }, "example.test"),
    payment: { connected: false, accountLabel: null },
    taxes: [GST, PST],
  };
}
