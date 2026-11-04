-- 0007 — Tax components. A tax category (Food, Alcohol) now maps to a set of taxes (GST, PST).
--
-- Rates live on `taxes` only. Each tax is rounded half-up on its own taxable base, then the
-- taxes are summed; tax is never applied to tax. Tax codes are free text so a venue outside BC
-- can define its own; the seed creates GST and PST.

-- There is no deployed database, and seed.sql runs after migrations, so this table is empty in
-- every environment. Stop rather than guess how an existing rate splits into taxes.
do $$
begin
  if exists (select 1 from public.tax_categories) then
    raise exception 'tax_categories has rows: split their rates into taxes before this migration';
  end if;
end $$;

create table public.taxes (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.venues (id) on delete cascade,
  code       text not null check (length(code) between 1 and 12),
  name       text not null check (length(name) between 1 and 60),
  rate_bps   int  not null check (rate_bps between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, code),
  unique (id, venue_id)
);
create trigger taxes_updated_at before update on public.taxes
  for each row execute function app.set_updated_at();

-- venue_id appears in both composite FKs, so a category cannot use another venue's tax.
create table public.tax_category_taxes (
  tax_category_id uuid not null,
  tax_id          uuid not null,
  venue_id        uuid not null,
  primary key (tax_category_id, tax_id),
  foreign key (tax_category_id, venue_id)
    references public.tax_categories (id, venue_id) on delete cascade,
  foreign key (tax_id, venue_id)
    references public.taxes (id, venue_id) on delete restrict
);
create index tax_category_taxes_tax_idx on public.tax_category_taxes (tax_id);

alter table public.tax_categories drop column rate_bps;

-- ---------------------------------------------------------------- order snapshots
-- One category can carry several rates, so a line snapshots its tax codes. The rates and
-- amounts charged are stored once per tax in order_tax_lines. Checkout is not built yet (M3),
-- so order_items has no rows to backfill.
alter table public.order_items
  drop column tax_rate_bps_snapshot,
  add column tax_codes_snapshot text[] not null;

create table public.order_tax_lines (
  order_id   uuid not null references public.orders (id) on delete cascade,
  tax_code   text not null,
  tax_name   text not null,
  rate_bps   int  not null check (rate_bps between 0 and 10000),
  base_cents int  not null check (base_cents >= 0),
  tax_cents  int  not null check (tax_cents >= 0),
  primary key (order_id, tax_code),
  check (tax_cents = (base_cents::bigint * rate_bps + 5000) / 10000)
);

-- ---------------------------------------------------------------- RLS
-- Public like the rest of the menu: diners see which taxes apply to an item.
alter table public.taxes enable row level security;
grant select on public.taxes to anon, authenticated;
create policy taxes_public_read on public.taxes
  for select to anon, authenticated using (true);

alter table public.tax_category_taxes enable row level security;
grant select on public.tax_category_taxes to anon, authenticated;
create policy tax_category_taxes_public_read on public.tax_category_taxes
  for select to anon, authenticated using (true);

-- Same visibility as order_items. Rows are written once by the API and never by clients.
alter table public.order_tax_lines enable row level security;
grant select on public.order_tax_lines to authenticated;
create policy order_tax_lines_staff_read on public.order_tax_lines
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id
      and app.is_staff_of(o.venue_id)
      and o.status <> 'pending_payment'
  ));
