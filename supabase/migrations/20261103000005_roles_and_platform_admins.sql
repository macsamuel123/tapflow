-- 0009 — Role-based visibility, platform admins, and owner-only payment data.
--
-- Who can read which orders:
--   owner, manager  every paid order of their venue
--   fulfillment     active orders, plus orders delivered or cancelled today (venue local time)
--   runner          ready orders
--   platform admin  every order of every venue, including unpaid ones, read-only
--
-- Venue staff test paid_at rather than status: re-checkout cancels unpaid orders, and those
-- must stay hidden from staff too ("tickets only after payment").
--
-- All staff share the `authenticated` Postgres role, so column grants cannot separate an owner
-- from a manager. Payment data therefore moves to tables with their own policies.

-- ---------------------------------------------------------------- platform admins
-- The TapFlow team. Not a venue role. Rows are managed outside the app; no client can write.
create table public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
grant select on public.platform_admins to authenticated;

create function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins a where a.user_id = auth.uid());
$$;

create policy platform_admins_read on public.platform_admins
  for select to authenticated using (app.is_platform_admin());

-- ---------------------------------------------------------------- order visibility
create function app.can_read_order(
  p_venue_id uuid,
  p_status public.order_status,
  p_paid_at timestamptz,
  p_status_updated_at timestamptz
) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_platform_admin() or (
    p_paid_at is not null and exists (
      select 1
      from public.staff_members s
      join public.venues v on v.id = s.venue_id
      where s.user_id = auth.uid()
        and s.venue_id = p_venue_id
        and (
          s.role in ('owner', 'manager')
          or (s.role = 'fulfillment' and (
            p_status in ('paid', 'accepted', 'ready')
            or (p_status_updated_at at time zone v.timezone)::date
               = (now() at time zone v.timezone)::date
          ))
          or (s.role = 'runner' and p_status = 'ready')
        )
    )
  );
$$;

revoke all on function app.is_platform_admin() from public, anon;
revoke all on function app.can_read_order(uuid, public.order_status, timestamptz, timestamptz)
  from public, anon;
grant execute on function app.is_platform_admin() to authenticated, service_role;
grant execute on function app.can_read_order(uuid, public.order_status, timestamptz, timestamptz)
  to authenticated, service_role;

drop policy orders_staff_read on public.orders;
create policy orders_read on public.orders
  for select to authenticated
  using (app.can_read_order(venue_id, status, paid_at, status_updated_at));

-- Both follow the orders policy: the subquery only finds orders this user can read.
drop policy order_items_staff_read on public.order_items;
create policy order_items_read on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

drop policy order_tax_lines_staff_read on public.order_tax_lines;
create policy order_tax_lines_read on public.order_tax_lines
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

-- ---------------------------------------------------------------- platform admin reads
-- touchpoints.qr_secret stays hidden: the column grants still leave it out.
create policy venues_platform_admin_read on public.venues
  for select to authenticated using (app.is_platform_admin());
create policy staff_members_platform_admin_read on public.staff_members
  for select to authenticated using (app.is_platform_admin());
create policy touchpoints_platform_admin_read on public.touchpoints
  for select to authenticated using (app.is_platform_admin());

-- ---------------------------------------------------------------- payment data
create table public.venue_payment_settings (
  venue_id               uuid primary key references public.venues (id) on delete cascade,
  platform_fee_bps       int  not null default 300 check (platform_fee_bps between 0 and 10000),
  stripe_account_id      text unique,
  stripe_charges_enabled boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create trigger venue_payment_settings_updated_at before update on public.venue_payment_settings
  for each row execute function app.set_updated_at();

insert into public.venue_payment_settings
    (venue_id, platform_fee_bps, stripe_account_id, stripe_charges_enabled)
  select id, platform_fee_bps, stripe_account_id, stripe_charges_enabled from public.venues;

alter table public.venues
  drop column platform_fee_bps,
  drop column stripe_account_id,
  drop column stripe_charges_enabled;

-- Every venue has exactly one settings row, however it was created.
create function app.create_venue_payment_settings() returns trigger
language plpgsql as $$
begin
  insert into public.venue_payment_settings (venue_id) values (new.id);
  return new;
end $$;
create trigger venues_create_payment_settings after insert on public.venues
  for each row execute function app.create_venue_payment_settings();

alter table public.venue_payment_settings enable row level security;
grant select on public.venue_payment_settings to authenticated;
create policy venue_payment_settings_read on public.venue_payment_settings
  for select to authenticated
  using (app.is_owner_of(venue_id) or app.is_platform_admin());

-- Checkout is not built yet (M3), so orders has no payment data to move. M3 must keep
-- platform_fee_cents <= orders.total_cents: a check constraint cannot span two tables.
alter table public.orders
  drop column platform_fee_cents,
  drop column stripe_payment_intent_id;

create table public.order_payments (
  order_id                 uuid primary key references public.orders (id) on delete cascade,
  platform_fee_cents       int  not null check (platform_fee_cents >= 0),
  stripe_payment_intent_id text unique,
  created_at               timestamptz not null default now()
);
alter table public.order_payments enable row level security;
grant select on public.order_payments to authenticated;
-- The orders policy applies inside the subquery, so an owner never sees an unpaid order here.
create policy order_payments_read on public.order_payments
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id
      and (app.is_owner_of(o.venue_id) or app.is_platform_admin())
  ));
