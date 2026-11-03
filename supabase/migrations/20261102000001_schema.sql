-- 0001 — Core schema for the QR ordering MVP.
-- Money is always integer cents. Tenant consistency is enforced with composite
-- foreign keys (child.restaurant_id must equal parent.restaurant_id).

create schema if not exists app;

-- ---------------------------------------------------------------- enums
create type public.staff_role as enum ('owner', 'kitchen');
create type public.order_status as enum (
  'pending_payment', 'paid', 'accepted', 'ready', 'delivered', 'cancelled'
);

-- ---------------------------------------------------------------- helpers
create or replace function app.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function app.validate_timezone() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'invalid timezone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- restaurants
create table public.restaurants (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique
                         check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 60),
  name                   text not null check (length(name) between 1 and 120),
  currency               char(3) not null default 'CAD' check (currency ~ '^[A-Z]{3}$'),
  timezone               text not null default 'America/Vancouver',
  tax_rate_bps           int  not null default 500 check (tax_rate_bps between 0 and 10000),
  platform_fee_bps       int  not null default 300 check (platform_fee_bps between 0 and 10000),
  stripe_account_id      text unique,
  stripe_charges_enabled boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create trigger restaurants_updated_at before update on public.restaurants
  for each row execute function app.set_updated_at();
create trigger restaurants_timezone before insert or update of timezone on public.restaurants
  for each row execute function app.validate_timezone();

-- ---------------------------------------------------------------- staff
create table public.staff_members (
  user_id       uuid not null references auth.users (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  role          public.staff_role not null,
  created_at    timestamptz not null default now(),
  primary key (user_id, restaurant_id)
);
create index staff_members_restaurant_idx on public.staff_members (restaurant_id);

-- ---------------------------------------------------------------- tables (physical dining tables)
create table public.tables (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  label         text not null check (length(label) between 1 and 40),
  qr_secret     text not null default encode(extensions.gen_random_bytes(32), 'hex')
                check (length(qr_secret) >= 16),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (restaurant_id, label),
  unique (id, restaurant_id)
);
create trigger tables_updated_at before update on public.tables
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------- menu
create table public.menu_categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name          text not null check (length(name) between 1 and 80),
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, restaurant_id)
);
create index menu_categories_restaurant_idx on public.menu_categories (restaurant_id, sort_order);
create trigger menu_categories_updated_at before update on public.menu_categories
  for each row execute function app.set_updated_at();

create table public.menu_items (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  category_id   uuid not null,
  name          text not null check (length(name) between 1 and 120),
  description   text not null default '' check (length(description) <= 1000),
  price_cents   int  not null check (price_cents >= 0),
  image_url     text,
  ingredients   text[] not null default '{}',
  -- Canada's priority food allergens (Health Canada). Extend via a new migration.
  allergens     text[] not null default '{}'
                check (allergens <@ array['gluten','milk','egg','peanut','tree_nut','soy','fish',
                                          'crustacean','shellfish','sesame','mustard','sulphites']::text[]),
  dietary_tags  text[] not null default '{}',
  in_stock      boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, restaurant_id),
  foreign key (category_id, restaurant_id)
    references public.menu_categories (id, restaurant_id) on delete restrict
);
create index menu_items_restaurant_idx on public.menu_items (restaurant_id, category_id, sort_order);
create trigger menu_items_updated_at before update on public.menu_items
  for each row execute function app.set_updated_at();

create table public.modifier_groups (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  item_id       uuid not null,
  name          text not null check (length(name) between 1 and 80),
  min_select    int  not null default 0,
  max_select    int  not null default 1,
  required      boolean not null default false,
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, restaurant_id),
  foreign key (item_id, restaurant_id)
    references public.menu_items (id, restaurant_id) on delete cascade,
  check (min_select >= 0 and max_select between 1 and 20 and min_select <= max_select),
  -- `required` is a convenience flag; it must agree with min_select.
  check ((required and min_select >= 1) or (not required and min_select = 0))
);
create index modifier_groups_item_idx on public.modifier_groups (item_id, sort_order);
create trigger modifier_groups_updated_at before update on public.modifier_groups
  for each row execute function app.set_updated_at();

create table public.modifiers (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants (id) on delete cascade,
  group_id          uuid not null,
  name              text not null check (length(name) between 1 and 80),
  price_delta_cents int  not null default 0 check (price_delta_cents >= 0),
  in_stock          boolean not null default true,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (group_id, restaurant_id)
    references public.modifier_groups (id, restaurant_id) on delete cascade
);
create index modifiers_group_idx on public.modifiers (group_id, sort_order);
create trigger modifiers_updated_at before update on public.modifiers
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------- diner sessions + carts
create table public.table_sessions (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  table_id      uuid,
  verified      boolean not null default false,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '4 hours',
  last_seen_at  timestamptz not null default now(),
  foreign key (table_id, restaurant_id) references public.tables (id, restaurant_id) on delete cascade,
  check (not verified or table_id is not null)
);
create index table_sessions_restaurant_idx on public.table_sessions (restaurant_id, created_at);

create table public.cart_items (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.table_sessions (id) on delete cascade,
  item_id      uuid not null references public.menu_items (id) on delete cascade,
  modifier_ids uuid[] not null default '{}',
  quantity     int  not null check (quantity between 1 and 20),
  notes        text not null default '' check (length(notes) <= 200),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index cart_items_session_idx on public.cart_items (session_id);
create trigger cart_items_updated_at before update on public.cart_items
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------- orders
create table public.orders (
  id                       uuid primary key default gen_random_uuid(),
  restaurant_id            uuid not null references public.restaurants (id) on delete restrict,
  table_id                 uuid not null,
  session_id               uuid references public.table_sessions (id) on delete set null,
  status                   public.order_status not null default 'pending_payment',
  currency                 char(3) not null check (currency ~ '^[A-Z]{3}$'),
  subtotal_cents           int not null check (subtotal_cents >= 0),
  tax_cents                int not null check (tax_cents >= 0),
  tip_cents                int not null default 0 check (tip_cents >= 0),
  platform_fee_cents       int not null check (platform_fee_cents >= 0),
  total_cents              int not null check (total_cents >= 0),
  stripe_payment_intent_id text unique,
  ticket_number            int check (ticket_number > 0),
  ticket_date              date,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  status_updated_at        timestamptz not null default now(),
  paid_at                  timestamptz,
  accepted_at              timestamptz,
  ready_at                 timestamptz,
  delivered_at             timestamptz,
  cancelled_at             timestamptz,
  foreign key (table_id, restaurant_id) references public.tables (id, restaurant_id) on delete restrict,
  check (total_cents = subtotal_cents + tax_cents + tip_cents),
  check (platform_fee_cents <= total_cents),
  -- Anything past pending_payment (other than a cancelled unpaid order) must have been paid.
  check (status in ('pending_payment', 'cancelled')
         or (paid_at is not null and ticket_number is not null and ticket_date is not null))
);
create unique index orders_ticket_unique
  on public.orders (restaurant_id, ticket_date, ticket_number) where ticket_number is not null;
create index orders_restaurant_status_idx on public.orders (restaurant_id, status, created_at desc);
create index orders_session_idx on public.orders (session_id);
create trigger orders_updated_at before update on public.orders
  for each row execute function app.set_updated_at();

create table public.order_items (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders (id) on delete cascade,
  item_id            uuid references public.menu_items (id) on delete set null,
  name_snapshot      text not null,
  -- unit price = item base price + sum of modifier deltas, at purchase time
  unit_price_cents   int  not null check (unit_price_cents >= 0),
  modifiers_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(modifiers_snapshot) = 'array'),
  quantity           int  not null check (quantity between 1 and 20),
  notes              text not null default '' check (length(notes) <= 200),
  line_total_cents   int  not null check (line_total_cents >= 0),
  check (line_total_cents = unit_price_cents * quantity)
);
create index order_items_order_idx on public.order_items (order_id);

-- ---------------------------------------------------------------- stripe + tickets
create table public.stripe_events (
  event_id    text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);

create table public.ticket_counters (
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  local_date    date not null,
  last_number   int  not null check (last_number > 0),
  primary key (restaurant_id, local_date)
);
