-- Shared demo backend (PLAN.md §12). Isolated from the real product tables, and safe to re-run.
-- Applied to the cloud project with `supabase db query --linked -f`, so it writes no migration
-- history. Locally it loads with seed.sql.

create schema if not exists demo;

create table if not exists demo.orders (
  id               uuid primary key default gen_random_uuid(),
  venue_slug       text not null check (venue_slug in ('demo-brewery', 'demo-food-truck')),
  touchpoint_id    text not null,
  touchpoint_label text not null check (length(touchpoint_label) between 1 and 80),
  service_mode     text not null check (service_mode in ('delivery', 'pickup')),
  items            jsonb not null check (jsonb_typeof(items) = 'array'),
  subtotal_cents   int  not null check (subtotal_cents >= 0),
  tax_lines        jsonb not null check (jsonb_typeof(tax_lines) = 'array'),
  tax_cents        int  not null check (tax_cents >= 0),
  tip_cents        int  not null default 0 check (tip_cents >= 0),
  total_cents      int  not null check (total_cents >= 0),
  guest_name       text check (length(guest_name) <= 30),
  ticket_number    int  not null check (ticket_number > 0),
  status           text not null default 'paid'
                   check (status in ('paid', 'accepted', 'ready', 'delivered', 'picked_up', 'cancelled')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (total_cents = subtotal_cents + tax_cents + tip_cents),
  check (service_mode = 'delivery' or guest_name is not null)
);
create index if not exists orders_venue_created_idx on demo.orders (venue_slug, created_at desc);

-- Pickup and ticket numbers restart each day, per venue.
create table if not exists demo.daily_counters (
  venue_slug  text not null,
  local_date  date not null,
  last_number int  not null check (last_number > 0),
  primary key (venue_slug, local_date)
);

-- In Postgres because serverless instances share no memory.
create table if not exists demo.rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  hits         int  not null,
  primary key (bucket, window_start)
);

-- A row overrides the code menu's sold-out state until cleanup removes it.
create table if not exists demo.item_stock (
  venue_slug text not null check (venue_slug in ('demo-brewery', 'demo-food-truck')),
  item_id    text not null,
  sold_out   boolean not null,
  updated_at timestamptz not null default now(),
  primary key (venue_slug, item_id)
);

-- ---------------------------------------------------------------- access
-- anon can read orders and stock, because Realtime needs it. Nothing else, and no writes.
revoke all on schema demo from public;
grant usage on schema demo to anon, authenticated, service_role;
revoke all on all tables in schema demo from public, anon, authenticated;
grant select on demo.orders, demo.item_stock to anon, authenticated;
grant all on all tables in schema demo to service_role;

alter table demo.orders         enable row level security;
alter table demo.item_stock     enable row level security;
alter table demo.daily_counters enable row level security;
alter table demo.rate_limits    enable row level security;

drop policy if exists orders_public_read on demo.orders;
create policy orders_public_read on demo.orders for select to anon, authenticated using (true);
drop policy if exists item_stock_public_read on demo.item_stock;
create policy item_stock_public_read on demo.item_stock for select to anon, authenticated using (true);

-- ---------------------------------------------------------------- realtime
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['orders', 'item_stock'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'demo' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table demo.%I', t);
    end if;
  end loop;
end $$;
