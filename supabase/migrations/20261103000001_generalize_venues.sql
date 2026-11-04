-- 0005 — Generalize the model: restaurants → venues, tables → touchpoints, kitchen → fulfillment.
--
-- A touchpoint is any place a diner can order from (table, seat, lounger, cart, room, counter).
-- Renames are metadata-only; RLS policies, column grants and FKs follow the renamed objects.
-- Function bodies reference columns by name, so they are re-created below.
-- Constraint, index, trigger and policy names are renamed with a generic sweep so none is left
-- behind with an old word in it.

-- ---------------------------------------------------------------- tables
alter table public.restaurants      rename to venues;
alter table public.tables           rename to touchpoints;
alter table public.table_sessions   rename to touchpoint_sessions;

-- ---------------------------------------------------------------- columns
alter table public.staff_members        rename column restaurant_id to venue_id;
alter table public.touchpoints          rename column restaurant_id to venue_id;
alter table public.menu_categories      rename column restaurant_id to venue_id;
alter table public.menu_items           rename column restaurant_id to venue_id;
alter table public.modifier_groups      rename column restaurant_id to venue_id;
alter table public.modifiers            rename column restaurant_id to venue_id;
alter table public.touchpoint_sessions  rename column restaurant_id to venue_id;
alter table public.touchpoint_sessions  rename column table_id      to touchpoint_id;
alter table public.orders               rename column restaurant_id to venue_id;
alter table public.orders               rename column table_id      to touchpoint_id;
alter table public.ticket_counters      rename column restaurant_id to venue_id;

-- ---------------------------------------------------------------- constraints, indexes, triggers, policies
do $$
declare r record;
begin
  for r in
    select n.nspname as sch, cl.relname as tbl, c.conname as old_name
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'public'
      and (c.conname like '%restaurant%' or c.conname like '%table%')
  loop
    execute format('alter table %I.%I rename constraint %I to %I',
      r.sch, r.tbl, r.old_name,
      replace(replace(r.old_name, 'restaurant', 'venue'), 'table', 'touchpoint'));
  end loop;

  for r in
    select schemaname as sch, indexname as old_name
    from pg_indexes
    where schemaname = 'public'
      and (indexname like '%restaurant%' or indexname like '%table%')
  loop
    execute format('alter index %I.%I rename to %I', r.sch, r.old_name,
      replace(replace(r.old_name, 'restaurant', 'venue'), 'table', 'touchpoint'));
  end loop;

  for r in
    select cl.relname as tbl, t.tgname as old_name
    from pg_trigger t
    join pg_class cl on cl.oid = t.tgrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'public' and not t.tgisinternal
      and (t.tgname like '%restaurant%' or t.tgname like '%table%')
  loop
    execute format('alter trigger %I on public.%I rename to %I', r.old_name, r.tbl,
      replace(replace(r.old_name, 'restaurant', 'venue'), 'table', 'touchpoint'));
  end loop;

  for r in
    select tablename as tbl, policyname as old_name
    from pg_policies
    where schemaname = 'public'
      and (policyname like '%restaurant%' or policyname like '%table%')
  loop
    execute format('alter policy %I on public.%I rename to %I', r.old_name, r.tbl,
      replace(replace(r.old_name, 'restaurant', 'venue'), 'table', 'touchpoint'));
  end loop;
end $$;

-- ---------------------------------------------------------------- staff role
alter type public.staff_role rename value 'kitchen' to 'fulfillment';

-- ---------------------------------------------------------------- touchpoint kind
create type public.touchpoint_kind as enum ('table', 'seat', 'lounger', 'cart', 'room', 'counter', 'other');
alter table public.touchpoints
  add column kind public.touchpoint_kind not null default 'table';
-- Staff (tickets, runner view) need the kind and label; qr_secret stays hidden.
grant select (kind) on public.touchpoints to authenticated;

-- ---------------------------------------------------------------- functions (bodies name columns)
create or replace function app.is_staff_of(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_members s
    where s.user_id = auth.uid() and s.venue_id = rid
  );
$$;

create or replace function app.is_owner_of(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_members s
    where s.user_id = auth.uid() and s.venue_id = rid and s.role = 'owner'
  );
$$;

create or replace function app.next_ticket_number(rid uuid, p_local_date date) returns int
language sql volatile security definer set search_path = '' as $$
  insert into public.ticket_counters as tc (venue_id, local_date, last_number)
  values (rid, p_local_date, 1)
  on conflict (venue_id, local_date)
    do update set last_number = tc.last_number + 1
  returning last_number;
$$;
