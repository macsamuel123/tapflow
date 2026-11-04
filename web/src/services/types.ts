// The contract between pages and data. Pages use only these types and the `Services`
// interface, so a mock can be replaced by Supabase Auth or the API one namespace at a time.
// Money is integer cents.

export type IndustryId =
  | "restaurants"
  | "breweries"
  | "stadiums"
  | "resorts"
  | "golf"
  | "food-halls"
  | "food-trucks";

export type SpotType = "table" | "seat" | "lounger" | "cart";
export type ServiceMode = "delivery" | "pickup";
export type StaffRole = "owner" | "manager" | "fulfillment" | "runner";
export type CountryCode = "CA" | "US";
export type OrderStatus = "paid" | "accepted" | "ready" | "delivered" | "picked_up" | "cancelled";

export type Session = { name: string; email: string };

export type Venue = {
  id: string;
  slug: string;
  name: string;
  industry: IndustryId;
  country: CountryCode;
  region: string;
  currency: string;
};

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

export type OrderLine = { name: string; quantity: number; unitPriceCents: number };

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
  allergens: AllergenId[];
  optionGroups: OptionGroup[];
  photoUrl: string | null;
};

export type MenuCategory = { id: string; name: string; items: MenuItem[] };

/** What a form saves. `category` is a name: a new name creates the category. */
export type MenuItemInput = Omit<MenuItem, "id" | "photoUrl"> & { category: string };

/** One imported item. Null keeps the current value when a duplicate is updated. */
export type MenuImportRow = {
  category: string;
  name: string;
  priceCents: number;
  taxCategory: TaxCategory;
  description: string | null;
  soldOut: boolean | null;
  allergens: AllergenId[] | null;
};

export type DuplicateMode = "skip" | "update";

export type ImportResult = { imported: number; updated: number; skipped: number };

export type StaffMember = { id: string; name: string; email: string; role: StaffRole };

export type PaymentStatus = { connected: boolean; accountLabel: string | null };

export type TaxRate = { code: string; name: string; rateBps: number };

export type WorkspaceSummary = { id: string; name: string; active: boolean };

export type SignUpInput = {
  industry: IndustryId;
  name: string;
  email: string;
  password: string;
  venueName: string;
  country: CountryCode;
  region: string;
  setup: ServiceSetup;
  /** Empty when step 5 was skipped: the venue starts with the sample menu. */
  menuRows: MenuImportRow[];
};

export type VenueDetails = Pick<Venue, "name" | "country" | "region">;

/** A failure with a message that is safe to show as it is. */
export class ServiceError extends Error {}

export interface AuthService {
  getSession(): Promise<Session | null>;
  signUp(input: SignUpInput): Promise<Session>;
  logIn(email: string, password: string): Promise<Session>;
  requestPasswordReset(email: string): Promise<void>;
  logOut(): Promise<void>;
}

export interface VenueService {
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
  setPhoto(itemId: string, photo: Blob): Promise<void>;
  removePhoto(itemId: string): Promise<void>;
  importRows(rows: MenuImportRow[], onDuplicate: DuplicateMode): Promise<ImportResult>;
}

export interface StaffService {
  list(): Promise<StaffMember[]>;
  invite(member: Omit<StaffMember, "id">): Promise<void>;
  setRole(id: string, role: StaffRole): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface PaymentService {
  status(): Promise<PaymentStatus>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface Services {
  auth: AuthService;
  venues: VenueService;
  touchpoints: TouchpointService;
  orders: OrderService;
  menu: MenuService;
  staff: StaffService;
  payments: PaymentService;
}
