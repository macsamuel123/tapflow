// The contract between pages and data. Pages use only these types and the `Services`
// interface, so a mock can be replaced by Supabase Auth or the API one namespace at a time.
// Money is integer cents.

import type { AddCartItem, Cart, Menu } from "@/lib/api-types";

export type IndustryId =
  | "restaurants"
  | "breweries"
  | "stadiums"
  | "resorts"
  | "golf"
  | "food-halls"
  | "food-trucks"
  | "other";

export type SpotType = "table" | "seat" | "lounger" | "cart";
export type ServiceMode = "delivery" | "pickup";
/** `fulfillment` is shown as "Cook" by default. Labels are owner-editable and never grant anything. */
export type StaffRole = "owner" | "manager" | "fulfillment" | "bartender" | "server" | "runner" | "host";
export type StaffAction =
  | "view_fulfillment"
  | "accept"
  | "ready"
  | "delivered"
  | "picked_up"
  | "cancel"
  | "sold_out"
  | "view_ready"
  | "view_orders"
  | "view_touchpoints"
  | "manage_staff"
  | "edit_branding";
export type RoleLabels = Record<StaffRole, string>;
export type CountryCode = "CA" | "US";
export type OrderStatus = "paid" | "accepted" | "ready" | "delivered" | "picked_up" | "cancelled";

export type Session = { name: string; email: string };

export type Venue = {
  id: string;
  slug: string;
  name: string;
  industry: IndustryId;
  /** Free text, only for the "other" industry. */
  venueType: string | null;
  country: CountryCode;
  region: string;
  currency: string;
};

/** A hex colour like #1d4ed8. Null keeps the TapFlow look. */
export type Branding = { logoUrl: string | null; coverUrl: string | null; color: string | null };
export type BrandImage = "logo" | "cover";

export type ServiceSetup = {
  spotsEnabled: boolean;
  spotType: SpotType;
  spotCount: number;
  pickupEnabled: boolean;
  pickupName: string;
};

export type Touchpoint = {
  id: string;
  label: string;
  serviceMode: ServiceMode;
  spotNumber: number | null;
  active: boolean;
  token: string;
};

export type OrderLine = {
  name: string;
  quantity: number;
  unitPriceCents: number;
  options: string[];
  notes: string;
};

export type Order = {
  id: string;
  ticketNumber: number;
  serviceMode: ServiceMode;
  touchpointLabel: string;
  guestName: string | null;
  status: OrderStatus;
  placedAt: string;
  lines: OrderLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

export type OrderSummary = {
  ordersToday: number;
  revenueCents: number;
  averageTicketCents: number;
};

export type TaxCategory = "Food" | "Alcohol";

/** The same codes as menu_items.allergens in the database. */
export type AllergenId =
  | "milk"
  | "egg"
  | "fish"
  | "crustacean"
  | "shellfish"
  | "tree_nut"
  | "peanut"
  | "gluten"
  | "soy"
  | "sesame"
  | "mustard"
  | "sulphites";

export type MenuOption = { id: string; name: string; priceDeltaCents: number };

export type OptionGroup = {
  id: string;
  name: string;
  required: boolean;
  minPicks: number;
  maxPicks: number;
  options: MenuOption[];
};

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  taxCategory: TaxCategory;
  inStock: boolean;
  /** With allergensDeclared, an empty list means the owner said there are none. */
  allergens: AllergenId[];
  /** False for an import with no allergen information: guests are told to ask staff. */
  allergensDeclared: boolean;
  /** Free text from an import that matched no known allergen. */
  otherAllergens: string;
  /** Set when an import had to assume the tax type. Cleared once the owner saves the item. */
  taxNote: string | null;
  /** Allergens were written by us, not declared by the owner. Cleared once the owner changes them. */
  sampleAllergens: boolean;
  optionGroups: OptionGroup[];
  photoUrl: string | null;
};

export type MenuCategory = { id: string; name: string; items: MenuItem[] };

/** What a form saves. `category` is a name: a new name creates the category. */
export type MenuItemInput = Omit<MenuItem, "id" | "photoUrl" | "sampleAllergens" | "allergensDeclared" | "taxNote"> & {
  category: string;
};

/** One imported item. Null keeps the current value when a duplicate is updated. Null allergens
 *  on a new item means not declared, and null tax means Food, with a note on the item. */
export type MenuImportRow = {
  category: string;
  name: string;
  priceCents: number;
  taxCategory: TaxCategory | null;
  description: string | null;
  soldOut: boolean | null;
  allergens: AllergenId[] | null;
  otherAllergens: string;
};

export type DuplicateMode = "skip" | "update";

export type ImportResult = { imported: number; updated: number; skipped: number };

/** PINs never leave the service: a member only says whether one is set. */
export type StaffMember = {
  id: string;
  name: string;
  role: StaffRole;
  active: boolean;
  hasPin: boolean;
  /** The person who signed the venue up: can't be changed or deactivated here. */
  accountOwner: boolean;
  /** Owner and Manager only: a mock link until real accounts exist. */
  inviteUrl?: string;
};

export type NewStaffMember = { name: string; role: StaffRole; pin: string | null };

/** Who is signed in on a staff device. The role is re-read on every request. */
export type StaffSession = {
  staffId: string;
  name: string;
  role: StaffRole;
  roleLabel: string;
  venueName: string;
  currency: string;
};

export type StaffLoginResult =
  | { status: "ok"; session: StaffSession }
  | { status: "wrong_pin"; triesLeft: number }
  | { status: "locked" }
  | { status: "no_venue" };

export type PaymentStatus = { connected: boolean; accountLabel: string | null };

export type TaxRate = { code: string; name: string; rateBps: number };

export type WorkspaceSummary = { id: string; name: string; active: boolean };

export type SignUpInput = {
  industry: IndustryId;
  venueType: string | null;
  name: string;
  email: string;
  password: string;
  venueName: string;
  country: CountryCode;
  region: string;
  setup: ServiceSetup;
  /** Empty when step 5 was skipped: the venue starts with the sample menu. */
  menuRows: MenuImportRow[];
  /** Photos for items in menuRows, matched by category and name. */
  menuPhotos: { category: string; name: string; photo: Blob }[];
};

export type VenueDetails = Pick<Venue, "name" | "country" | "region">;

/** A failure with a message that is safe to show as it is. */
export class ServiceError extends Error {}

export interface AuthService {
  getSession(): Promise<Session | null>;
  signUp(input: SignUpInput): Promise<Session>;
  logIn(email: string, password: string): Promise<Session>;
  requestPasswordReset(email: string): Promise<void>;
  /** Opens a venue on this device. Only the shared demo has this. */
  openVenue(code: string): Promise<void>;
  logOut(): Promise<void>;
}

export interface VenueService {
  /** True for a venue that exists only in this browser. */
  isLocalOnly(): Promise<boolean>;
  /** True for a demo venue shared across devices, whose menu and touchpoints are read-only. */
  isSharedDemo(): Promise<boolean>;
  /** True for a tester's venue saved in the cloud: it works on any device. */
  isCloudVenue(): Promise<boolean>;
  /** The code to show the owner, once. Null if there's nothing to show. */
  recoveryCode(): Promise<string | null>;
  markRecoveryCodeShown(): Promise<void>;
  listWorkspaces(): Promise<WorkspaceSummary[]>;
  current(): Promise<Venue>;
  switchTo(workspaceId: string): Promise<void>;
  updateDetails(details: VenueDetails): Promise<Venue>;
  getTaxes(): Promise<TaxRate[]>;
  resetDemo(): Promise<void>;
}

export interface TouchpointService {
  list(): Promise<Touchpoint[]>;
  getSetup(): Promise<ServiceSetup>;
  applySetup(setup: ServiceSetup): Promise<void>;
  addSpots(count: number): Promise<void>;
  addPickup(name: string): Promise<void>;
  removePickup(id: string): Promise<void>;
  setActive(id: string, active: boolean): Promise<void>;
  regenerateQr(id: string): Promise<void>;
}

export interface OrderService {
  list(): Promise<Order[]>;
  summary(): Promise<OrderSummary>;
  setStatus(id: string, status: OrderStatus): Promise<void>;
}

export interface MenuService {
  list(): Promise<MenuCategory[]>;
  isSample(): Promise<boolean>;
  clearSample(): Promise<void>;
  addCategory(name: string): Promise<void>;
  renameCategory(id: string, name: string): Promise<void>;
  reorderCategories(orderedIds: string[]): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  addItem(input: MenuItemInput): Promise<string>;
  updateItem(id: string, input: MenuItemInput): Promise<void>;
  deleteItem(id: string): Promise<void>;
  setInStock(itemId: string, inStock: boolean): Promise<void>;
  setAllergens(itemId: string, allergens: AllergenId[], otherAllergens: string): Promise<void>;
  setPhoto(itemId: string, photo: Blob): Promise<void>;
  removePhoto(itemId: string): Promise<void>;
  importRows(rows: MenuImportRow[], onDuplicate: DuplicateMode): Promise<ImportResult>;
}

export interface StaffService {
  list(): Promise<StaffMember[]>;
  /** A PIN role needs a 4-digit PIN, unique in the venue. Owner and Manager get an invite link. */
  add(member: NewStaffMember): Promise<StaffMember>;
  /** Moving to a PIN role needs a PIN if the person has none. */
  setRole(id: string, role: StaffRole, pin?: string | null): Promise<void>;
  /** Signs the person out of every staff device. */
  resetPin(id: string, pin: string): Promise<void>;
  /** Takes effect at once: their staff device signs out. */
  deactivate(id: string): Promise<void>;
  roleLabels(): Promise<RoleLabels>;
  renameRole(role: StaffRole, label: string): Promise<void>;
}

export interface BrandingService {
  get(): Promise<Branding>;
  /** The colour is darkened to pass WCAG AA before it's stored. Returns what was stored. */
  saveColor(color: string | null): Promise<Branding>;
  upload(kind: BrandImage, image: Blob): Promise<void>;
  remove(kind: BrandImage): Promise<void>;
}

/** A shared staff device at /staff/<slug>. Every action is checked against the role. */
export interface StaffModeService {
  /** The PIN pad's labels and the venue name, before anyone signs in. Null for an unknown venue. */
  venue(slug: string): Promise<{ name: string; roleLabels: RoleLabels } | null>;
  login(slug: string, pin: string): Promise<StaffLoginResult>;
  logout(slug: string): Promise<void>;
  /** Null once signed out, deactivated or after a PIN reset. */
  current(slug: string): Promise<StaffSession | null>;
  orders(slug: string): Promise<Order[]>;
  menu(slug: string): Promise<MenuCategory[]>;
  touchpoints(slug: string): Promise<Touchpoint[]>;
  setStatus(slug: string, orderId: string, status: OrderStatus): Promise<void>;
  setSoldOut(slug: string, itemId: string, soldOut: boolean): Promise<void>;
}

export interface PaymentService {
  status(): Promise<PaymentStatus>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

/** Everything a guest request carries. The token is re-checked every time, so regenerating a
 *  QR stops an already-open page from ordering. */
export type GuestContext = { slug: string; touchpointId: string; token: string | null };

export type GuestAccess = "verified" | "no-token" | "bad-token" | "inactive";

export type GuestVenue = {
  menu: Menu;
  touchpointLabel: string;
  serviceMode: ServiceMode;
  access: GuestAccess;
  /** Only in this browser: the tester's own venue, not a fixed demo venue. */
  localOnly: boolean;
  branding: Branding;
};

export type GuestOrder = {
  id: string;
  venueName: string;
  currency: string;
  ticketNumber: number;
  serviceMode: ServiceMode;
  touchpointLabel: string;
  guestName: string | null;
  status: OrderStatus;
  lines: OrderLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

export interface GuestService {
  /** Null when this browser doesn't know the venue or touchpoint. */
  open(context: GuestContext): Promise<GuestVenue | null>;
  getCart(context: GuestContext): Promise<Cart>;
  addItem(context: GuestContext, line: AddCartItem): Promise<Cart>;
  updateLine(context: GuestContext, lineId: string, quantity: number): Promise<Cart>;
  removeLine(context: GuestContext, lineId: string): Promise<Cart>;
  placeOrder(context: GuestContext, guestName: string | null): Promise<string>;
  getOrder(slug: string, orderId: string): Promise<GuestOrder | null>;
  /** Demo only: stands in for staff and moves the order on one step. */
  simulateNextStep(slug: string, orderId: string): Promise<void>;
}

export interface Services {
  guest: GuestService;
  auth: AuthService;
  venues: VenueService;
  touchpoints: TouchpointService;
  orders: OrderService;
  menu: MenuService;
  staff: StaffService;
  branding: BrandingService;
  staffMode: StaffModeService;
  payments: PaymentService;
}
