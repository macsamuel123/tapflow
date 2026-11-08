-- Brand profile, staff and PIN staff mode for testers' own venues (PLAN.md §12, M6). Safe to
-- re-run. Like 001-003 it writes no migration history. Every write needs the venue's recovery
-- code, checked here in the database, and only the server (service_role) can call anything.

alter table demo.venues
  add column if not exists role_labels jsonb,
  add column if not exists venue_type text;
alter table demo.venues drop constraint if exists venues_venue_type_check;
alter table demo.venues add constraint venues_venue_type_check check (length(venue_type) between 1 and 40);
alter table demo.venues drop constraint if exists venues_role_labels_check;
alter table demo.venues add constraint venues_role_labels_check
  check (role_labels is null or jsonb_typeof(role_labels) = 'object');

-- PINs are stored only as a peppered HMAC made on the server. Never a raw PIN.
create table if not exists demo.staff (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references demo.venues (id) on delete cascade,
  name        text not null check (length(name) between 1 and 60),
  role        text not null
              check (role in ('owner', 'manager', 'fulfillment', 'bartender', 'server', 'runner', 'host')),
  pin_hash    text check (pin_hash is null or length(pin_hash) = 64),
  pin_version int  not null default 1,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists staff_venue_idx on demo.staff (venue_id, created_at);
-- Only active staff: a deactivated person's PIN can be given to someone else.
create unique index if not exists staff_venue_pin_key on demo.staff (venue_id, pin_hash)
  where pin_hash is not null and active;

-- One lock per venue: 5 wrong PINs lock PIN login for everyone at that venue for a minute.
create table if not exists demo.staff_pin_locks (
  venue_id     uuid primary key references demo.venues (id) on delete cascade,
  failures     int not null default 0 check (failures >= 0),
  locked_until timestamptz
);

-- ---------------------------------------------------------------- access
revoke all on demo.staff, demo.staff_pin_locks from public, anon, authenticated;
grant all on demo.staff, demo.staff_pin_locks to service_role;
alter table demo.staff           enable row level security;
alter table demo.staff_pin_locks enable row level security;
-- No policies on purpose: nothing but the server reads these tables.

-- ---------------------------------------------------------------- functions
create or replace function demo.check_key(p_venue uuid, p_key_hash text) returns void
language plpgsql stable set search_path = '' as $$
begin
  if p_key_hash is null or not exists (
    select 1 from demo.venue_keys k where k.venue_id = p_venue and k.key_hash = p_key_hash
  ) then
    raise exception 'bad_key';
  end if;
end $$;

-- Replaces 003's version: it also stores the free-text venue type for the "other" industry.
create or replace function demo.create_venue(
  p_ip text, p_max int, p_venue jsonb, p_touchpoints jsonb, p_menu jsonb, p_sample boolean, p_key_hash text
) returns demo.venues
language plpgsql set search_path = '' as $$
declare
  v_base text := p_venue ->> 'slug';
  v_slug text := v_base;
  v_n int := 1;
  v_row demo.venues;
begin
  perform demo.take_daily_limit('venues:' || p_ip, p_max);
  while v_slug in ('demo-brewery', 'demo-food-truck')
     or exists (select 1 from demo.venues v where v.slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  insert into demo.venues (slug, name, industry, venue_type, country, region, currency, sample_menu)
  values (v_slug, p_venue ->> 'name', p_venue ->> 'industry', nullif(p_venue ->> 'venue_type', ''),
          p_venue ->> 'country', p_venue ->> 'region', p_venue ->> 'currency', p_sample)
  returning * into v_row;
  insert into demo.venue_keys (venue_id, key_hash) values (v_row.id, p_key_hash);
  insert into demo.venue_menus (venue_id, menu) values (v_row.id, p_menu);
  perform demo.save_touchpoints(v_row.id, p_touchpoints);
  return v_row;
end $$;

create or replace function demo.save_branding(p_venue uuid, p_key_hash text, p_branding jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare v_clean jsonb;
begin
  perform demo.check_key(p_venue, p_key_hash);
  if jsonb_typeof(p_branding) is distinct from 'object' then
    raise exception 'bad_branding';
  end if;
  if (p_branding ->> 'color') is not null and (p_branding ->> 'color') !~ '^#[0-9a-f]{6}$' then
    raise exception 'bad_branding';
  end if;
  if jsonb_typeof(coalesce(p_branding -> 'logoUrl', 'null')) not in ('null', 'string')
     or jsonb_typeof(coalesce(p_branding -> 'coverUrl', 'null')) not in ('null', 'string') then
    raise exception 'bad_branding';
  end if;
  -- Only the three known keys are kept.
  v_clean := jsonb_build_object(
    'logoUrl', p_branding -> 'logoUrl', 'coverUrl', p_branding -> 'coverUrl', 'color', p_branding -> 'color');
  update demo.venues v set branding = v_clean, last_activity_at = now() where v.id = p_venue;
  return v_clean;
end $$;

create or replace function demo.save_role_labels(p_venue uuid, p_key_hash text, p_labels jsonb) returns void
language plpgsql set search_path = '' as $$
begin
  perform demo.check_key(p_venue, p_key_hash);
  if jsonb_typeof(p_labels) is distinct from 'object' or exists (
    select 1 from jsonb_each(p_labels) e
    where e.key not in ('owner', 'manager', 'fulfillment', 'bartender', 'server', 'runner', 'host')
       or jsonb_typeof(e.value) <> 'string' or length(e.value #>> '{}') not between 1 and 24
  ) then
    raise exception 'bad_labels';
  end if;
  update demo.venues v set role_labels = p_labels, last_activity_at = now() where v.id = p_venue;
end $$;

-- One staff change. A changed PIN bumps pin_version, which ends that person's staff sessions.
create or replace function demo.save_staff(p_venue uuid, p_key_hash text, p_op jsonb) returns demo.staff
language plpgsql set search_path = '' as $$
declare
  v_row demo.staff;
  v_kind text := p_op ->> 'op';
  v_hash text;
begin
  perform demo.check_key(p_venue, p_key_hash);
  begin
    if v_kind = 'add' then
      insert into demo.staff (venue_id, name, role, pin_hash)
      values (p_venue, p_op ->> 'name', p_op ->> 'role', p_op ->> 'pin_hash')
      returning * into v_row;
      return v_row;
    end if;

    select * into v_row from demo.staff s where s.id = (p_op ->> 'id')::uuid and s.venue_id = p_venue for update;
    if not found then
      raise exception 'staff_not_found';
    end if;

    if v_kind = 'set_role' then
      v_hash := case
        when (p_op ->> 'role') in ('owner', 'manager') then null
        else coalesce(p_op ->> 'pin_hash', v_row.pin_hash) end;
      if (p_op ->> 'role') not in ('owner', 'manager') and v_hash is null then
        raise exception 'pin_required';
      end if;
      update demo.staff s set
        role = p_op ->> 'role',
        pin_hash = v_hash,
        pin_version = s.pin_version + (case when v_hash is distinct from s.pin_hash then 1 else 0 end)
      where s.id = v_row.id returning * into v_row;
    elsif v_kind = 'reset_pin' then
      if v_row.role in ('owner', 'manager') or (p_op ->> 'pin_hash') is null then
        raise exception 'pin_required';
      end if;
      update demo.staff s set pin_hash = p_op ->> 'pin_hash', pin_version = s.pin_version + 1
      where s.id = v_row.id returning * into v_row;
    elsif v_kind = 'deactivate' then
      update demo.staff s set active = false, pin_version = s.pin_version + 1
      where s.id = v_row.id returning * into v_row;
    else
      raise exception 'bad_op';
    end if;
  exception when unique_violation then
    raise exception 'pin_taken';
  end;
  update demo.venues v set last_activity_at = now() where v.id = p_venue;
  return v_row;
end $$;

-- Returns a status instead of raising, so a wrong PIN's failure count is kept. The lock is
-- checked before the PIN: while it holds, even the right PIN gets 'locked'.
create or replace function demo.staff_login(p_venue uuid, p_pin_hash text)
returns table (result text, staff_id uuid, tries_left int)
language plpgsql set search_path = '' as $$
declare
  v_max constant int := 5;
  v_lock demo.staff_pin_locks;
  v_id uuid;
begin
  insert into demo.staff_pin_locks (venue_id) values (p_venue) on conflict (venue_id) do nothing;
  select * into v_lock from demo.staff_pin_locks l where l.venue_id = p_venue for update;
  if v_lock.locked_until is not null and v_lock.locked_until > now() then
    return query select 'locked'::text, null::uuid, 0;
    return;
  end if;

  select s.id into v_id from demo.staff s
  where s.venue_id = p_venue and s.active and s.pin_hash is not null and s.pin_hash = p_pin_hash;
  if v_id is null then
    if v_lock.failures + 1 >= v_max then
      update demo.staff_pin_locks l set failures = 0, locked_until = now() + interval '1 minute'
      where l.venue_id = p_venue;
      return query select 'locked'::text, null::uuid, 0;
    else
      update demo.staff_pin_locks l set failures = v_lock.failures + 1, locked_until = null
      where l.venue_id = p_venue;
      return query select 'wrong_pin'::text, null::uuid, v_max - (v_lock.failures + 1);
    end if;
    return;
  end if;

  update demo.staff_pin_locks l set failures = 0, locked_until = null where l.venue_id = p_venue;
  return query select 'ok'::text, v_id, v_max;
end $$;

-- Sold out from a staff device: the stored menu's inStock flag for one item. The version bump
-- makes guests' menus reload.
create or replace function demo.set_own_item_stock(p_venue uuid, p_item text, p_sold_out boolean) returns void
language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from demo.venue_menus m, jsonb_array_elements(m.menu) c, jsonb_array_elements(c -> 'items') i
    where m.venue_id = p_venue and i ->> 'id' = p_item
  ) then
    raise exception 'item_not_found';
  end if;
  update demo.venue_menus m set
    menu = (
      select coalesce(jsonb_agg(
        jsonb_set(c, '{items}', coalesce((
          select jsonb_agg(
            case when i ->> 'id' = p_item then jsonb_set(i, '{inStock}', to_jsonb(not p_sold_out)) else i end
            order by io)
          from jsonb_array_elements(c -> 'items') with ordinality as y(i, io)), '[]'::jsonb))
        order by co), '[]'::jsonb)
      from jsonb_array_elements(m.menu) with ordinality as x(c, co)
    ),
    updated_at = now()
  where m.venue_id = p_venue;
  update demo.venues v set menu_version = v.menu_version + 1, last_activity_at = now() where v.id = p_venue;
end $$;

revoke all on all functions in schema demo from public, anon, authenticated;
grant execute on all functions in schema demo to service_role;

-- ---------------------------------------------------------------- branding images
-- Public read. Only the server writes, and only small JPEGs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('demo-branding', 'demo-branding', true, 512000, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
