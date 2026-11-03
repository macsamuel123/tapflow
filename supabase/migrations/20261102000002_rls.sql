-- 0002 — Grants + Row Level Security.
--
-- Model:
--   * anon (diners' browsers): read-only access to the four menu tables. Nothing else.
--   * authenticated (staff): read-only access to rows of restaurants they belong to.
--   * All writes go through the FastAPI service (connects as a privileged role).
--   * tables.qr_secret is never readable by anon/authenticated.

-- ---------------------------------------------------------------- grants
-- Supabase grants ALL on public tables to anon/authenticated by default. Start from zero.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

grant usage on schema public to anon, authenticated;

-- Public menu data (diners + staff).
grant select on public.menu_categories, public.menu_items, public.modifier_groups, public.modifiers
  to anon, authenticated;

-- Staff-only reads (row filtering by RLS below).
grant select on public.restaurants, public.staff_members, public.orders, public.order_items
  to authenticated;
-- Column-level: every column except qr_secret.
grant select (id, restaurant_id, label, active, created_at, updated_at) on public.tables to authenticated;

-- table_sessions, cart_items, stripe_events, ticket_counters: no client grants at all.

-- ---------------------------------------------------------------- membership helpers
create or replace function app.is_staff_of(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_members s
    where s.user_id = auth.uid() and s.restaurant_id = rid
  );
$$;

create or replace function app.is_owner_of(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_members s
    where s.user_id = auth.uid() and s.restaurant_id = rid and s.role = 'owner'
  );
$$;

revoke all on function app.is_staff_of(uuid), app.is_owner_of(uuid) from public;
grant usage on schema app to authenticated, service_role;
grant execute on function app.is_staff_of(uuid), app.is_owner_of(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- enable RLS everywhere
alter table public.restaurants      enable row level security;
alter table public.staff_members    enable row level security;
alter table public.tables           enable row level security;
alter table public.menu_categories  enable row level security;
alter table public.menu_items       enable row level security;
alter table public.modifier_groups  enable row level security;
alter table public.modifiers        enable row level security;
alter table public.table_sessions   enable row level security;
alter table public.cart_items       enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.stripe_events    enable row level security;
alter table public.ticket_counters  enable row level security;

-- ---------------------------------------------------------------- policies
-- Menu: public read.
create policy menu_categories_public_read on public.menu_categories
  for select to anon, authenticated using (true);
create policy menu_items_public_read on public.menu_items
  for select to anon, authenticated using (true);
create policy modifier_groups_public_read on public.modifier_groups
  for select to anon, authenticated using (true);
create policy modifiers_public_read on public.modifiers
  for select to anon, authenticated using (true);

-- Restaurants: staff of that restaurant.
create policy restaurants_staff_read on public.restaurants
  for select to authenticated using (app.is_staff_of(id));

-- Staff membership: your own rows, or all rows of a restaurant you own.
create policy staff_members_read on public.staff_members
  for select to authenticated
  using (user_id = auth.uid() or app.is_owner_of(restaurant_id));

-- Tables: staff need labels for tickets (qr_secret excluded by column grants).
create policy tables_staff_read on public.tables
  for select to authenticated using (app.is_staff_of(restaurant_id));

-- Orders: staff of the restaurant, and only once paid ("tickets only after payment").
create policy orders_staff_read on public.orders
  for select to authenticated
  using (app.is_staff_of(restaurant_id) and status <> 'pending_payment');

create policy order_items_staff_read on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id
      and app.is_staff_of(o.restaurant_id)
      and o.status <> 'pending_payment'
  ));

-- table_sessions, cart_items, stripe_events, ticket_counters: RLS on, no policies → deny all.
