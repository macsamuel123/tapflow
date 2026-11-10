-- 0011 — Pay core (M7): service mode, pickup orders, guest names, and the status guard and
-- visibility rules that go with them.
--
-- Already present from earlier migrations, so only guarded here (each "only if missing"):
--   orders.tip_cents (0001), stripe_events (0001), ticket_counters + app.next_ticket_number
--   (0001/0004), order_tax_lines (0007), order_payments (0009).
--
-- Pickup numbers reuse ticket_counters via app.next_ticket_number(venue_id, local_date): a
-- pickup order's ticket number is the number called at the counter.

-- ---------------------------------------------------------------- service mode
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'service_mode'
  ) then
    create type public.service_mode as enum ('delivery', 'pickup');
  end if;
end $$;

-- A delivery touchpoint: a runner brings the order. A pickup touchpoint: the diner collects it.
alter table public.touchpoints
  add column if not exists service_mode public.service_mode not null default 'delivery';
-- Staff need it (runner view, KDS); qr_secret stays hidden.
grant select (service_mode) on public.touchpoints to authenticated;

-- ---------------------------------------------------------------- orders
-- service_mode is a snapshot of the touchpoint's mode at checkout, so "a pickup order" stays
-- stable if the touchpoint is later reconfigured. It never changes (see the guard below).
alter table public.orders
  add column if not exists service_mode public.service_mode not null default 'delivery',
  add column if not exists guest_name   text check (guest_name is null or length(guest_name) between 1 and 40),
  add column if not exists picked_up_at timestamptz,
  add column if not exists tip_cents    int not null default 0 check (tip_cents >= 0);

alter table public.orders
  add constraint orders_pickup_guest_name_required
    check (service_mode <> 'pickup' or guest_name is not null),
  add constraint orders_picked_up_only_pickup
    check (status <> 'picked_up' or service_mode = 'pickup'),
  add constraint orders_delivered_only_delivery
    check (status <> 'delivered' or service_mode = 'delivery');

-- At most one checkout in flight per diner session (re-checkout replaces or reuses it).
create unique index if not exists orders_one_pending_per_session
  on public.orders (session_id) where status = 'pending_payment';

-- ---------------------------------------------------------------- existing tables (no-ops)
create table if not exists public.order_tax_lines (
  order_id   uuid not null references public.orders (id) on delete cascade,
  tax_code   text not null,
  tax_name   text not null,
  rate_bps   int  not null check (rate_bps between 0 and 10000),
  base_cents int  not null check (base_cents >= 0),
  tax_cents  int  not null check (tax_cents >= 0),
  primary key (order_id, tax_code)
);

create table if not exists public.stripe_events (
  event_id    text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- status guard
-- Defense in depth for the status machine (api/app/domain/order_status.py validates first):
--   pending_payment → paid | cancelled
--   paid            → accepted | cancelled
--   accepted        → ready | cancelled
--   ready           → delivered   (delivery orders only)
--   ready           → picked_up   (pickup orders only)
-- Each transition stamps its timestamp if the caller did not. service_mode is immutable.
create or replace function app.guard_order_status() returns trigger
language plpgsql as $$
begin
  if new.service_mode is distinct from old.service_mode then
    raise exception 'orders.service_mode cannot change' using errcode = '23514';
  end if;

  if new.status = old.status then
    return new;
  end if;

  if not (
       (old.status = 'pending_payment' and new.status in ('paid', 'cancelled'))
    or (old.status = 'paid'            and new.status in ('accepted', 'cancelled'))
    or (old.status = 'accepted'        and new.status in ('ready', 'cancelled'))
    or (old.status = 'ready' and new.status = 'delivered' and old.service_mode = 'delivery')
    or (old.status = 'ready' and new.status = 'picked_up' and old.service_mode = 'pickup')
  ) then
    raise exception 'invalid order status transition: % -> % (%)',
      old.status, new.status, old.service_mode
      using errcode = '23514';
  end if;

  new.status_updated_at := now();
  case new.status
    when 'paid'      then new.paid_at      := coalesce(new.paid_at, now());
    when 'accepted'  then new.accepted_at  := coalesce(new.accepted_at, now());
    when 'ready'     then new.ready_at     := coalesce(new.ready_at, now());
    when 'delivered' then new.delivered_at := coalesce(new.delivered_at, now());
    when 'picked_up' then new.picked_up_at := coalesce(new.picked_up_at, now());
    when 'cancelled' then new.cancelled_at := coalesce(new.cancelled_at, now());
    else null;
  end case;
  return new;
end $$;

-- The old trigger fired only on `update of status`; service_mode must be guarded too.
drop trigger if exists orders_status_guard on public.orders;
create trigger orders_status_guard before update of status, service_mode on public.orders
  for each row execute function app.guard_order_status();

-- ---------------------------------------------------------------- order visibility
-- Who can read which orders:
--   owner, manager  every paid order of their venue
--   fulfillment     active orders (paid, accepted, ready), plus orders delivered, picked up
--                   or cancelled today (venue local time)
--   runner          ready delivery orders (pickup orders are collected, not run)
--   platform admin  every order of every venue, including unpaid ones, read-only
create or replace function app.can_read_order(
  p_venue_id uuid,
  p_status public.order_status,
  p_paid_at timestamptz,
  p_status_updated_at timestamptz,
  p_service_mode public.service_mode
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
            or (p_status in ('delivered', 'picked_up', 'cancelled')
                and (p_status_updated_at at time zone v.timezone)::date
                    = (now() at time zone v.timezone)::date)
          ))
          or (s.role = 'runner' and p_status = 'ready' and p_service_mode = 'delivery')
        )
    )
  );
$$;

revoke all on function app.can_read_order(
  uuid, public.order_status, timestamptz, timestamptz, public.service_mode) from public, anon;
grant execute on function app.can_read_order(
  uuid, public.order_status, timestamptz, timestamptz, public.service_mode)
  to authenticated, service_role;

drop policy orders_read on public.orders;
create policy orders_read on public.orders
  for select to authenticated
  using (app.can_read_order(venue_id, status, paid_at, status_updated_at, service_mode));

drop function app.can_read_order(uuid, public.order_status, timestamptz, timestamptz);
