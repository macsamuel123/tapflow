// Mirrors api/app/schemas/*. All amounts are integer cents computed by the API.

export type Modifier = {
  id: string;
  name: string;
  price_delta_cents: number;
  in_stock: boolean;
};

export type ModifierGroup = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  required: boolean;
  modifiers: Modifier[];
};

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  image_url: string | null;
  ingredients: string[];
  allergens: string[];
  dietary_tags: string[];
  in_stock: boolean;
  modifier_groups: ModifierGroup[];
};

export type MenuCategory = { id: string; name: string; items: MenuItem[] };

export type Menu = {
  restaurant: { slug: string; name: string; currency: string; tax_rate_bps: number };
  categories: MenuCategory[];
};

export type Session = {
  session_id: string;
  restaurant_slug: string;
  table_id: string | null;
  table_label: string | null;
  verified: boolean;
  expires_at: string;
};

export type CreatedSession = Session & { session_token: string };

export type CartLine = {
  id: string;
  item_id: string;
  name: string;
  modifiers: { id: string; name: string; price_delta_cents: number }[];
  quantity: number;
  notes: string;
  unit_price_cents: number;
  line_total_cents: number;
  available: boolean;
  problem: string | null;
};

export type Cart = {
  currency: string;
  lines: CartLine[];
  item_count: number;
  subtotal_cents: number;
  tax_rate_bps: number;
  tax_cents: number;
  tip_cents: number;
  total_cents: number;
  verified: boolean;
  can_checkout: boolean;
};

// What the client may send for a cart line. Never prices.
export type AddCartItem = {
  item_id: string;
  modifier_ids: string[];
  quantity: number;
  notes: string;
};
