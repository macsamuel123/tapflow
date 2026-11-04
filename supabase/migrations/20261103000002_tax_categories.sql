-- 0006 — Per-category tax. Replaces the single venues.tax_rate_bps.
--
-- Every menu item belongs to a tax category with its own rate (Food 5%, Alcohol 15%, ...).
-- Tax is computed per category on that category's subtotal, rounded half-up, then summed.
-- Order items snapshot the category name and rate at purchase time (CLAUDE.md invariant 1).

create table public.tax_categories (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.venues (id) on delete cascade,
  name       text not null check (length(name) between 1 and 40),
  rate_bps   int  not null check (rate_bps between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, name),
  unique (id, venue_id)
);
create index tax_categories_venue_idx on public.tax_categories (venue_id);
create trigger tax_categories_updated_at before update on public.tax_categories
  for each row execute function app.set_updated_at();

-- Public like the rest of the menu: diners see the tax rate per item.
alter table public.tax_categories enable row level security;
grant select on public.tax_categories to anon, authenticated;
create policy tax_categories_public_read on public.tax_categories
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------- backfill
-- Each existing venue gets one "Standard" category carrying its old single rate.
insert into public.tax_categories (venue_id, name, rate_bps)
  select id, 'Standard', tax_rate_bps from public.venues;

alter table public.menu_items add column tax_category_id uuid;

update public.menu_items i
   set tax_category_id = tc.id
  from public.tax_categories tc
 where tc.venue_id = i.venue_id and tc.name = 'Standard';

alter table public.menu_items alter column tax_category_id set not null;
alter table public.menu_items
  add constraint menu_items_tax_category_fk
  foreign key (tax_category_id, venue_id)
  references public.tax_categories (id, venue_id);
create index menu_items_tax_category_idx on public.menu_items (tax_category_id);

alter table public.venues drop column tax_rate_bps;

-- ---------------------------------------------------------------- order snapshots
-- Checkout is not built yet (M3), so order_items has no rows to backfill.
alter table public.order_items
  add column tax_category_name_snapshot text not null,
  add column tax_rate_bps_snapshot int not null check (tax_rate_bps_snapshot between 0 and 10000);
