-- Testers' own venues in the shared demo (PLAN.md §12). Safe to re-run. Like 001 and 002 it writes
-- no migration history. The fixed demo venues stay in code and are never rows here.

-- Orders and stock now belong to any venue, so the two-venue checks go.
alter table demo.orders drop constraint if exists orders_venue_slug_check;
alter table demo.item_stock drop constraint if exists item_stock_venue_slug_check;

create table if not exists demo.venues (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique
                   check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 60),
  name             text not null check (length(name) between 1 and 120),
  industry         text not null,
  country          text not null check (country in ('CA', 'US')),
  region           text not null check (length(region) <= 60),
  currency         text not null check (currency in ('CAD', 'USD')),
  branding         jsonb,
  sample_menu      boolean not null default false,
  menu_version     int not null default 1,
  last_activity_at timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create index if not exists venues_last_activity_idx on demo.venues (last_activity_at);

create table if not exists demo.touchpoints (
  venue_id     uuid not null references demo.venues (id) on delete cascade,
  id           text not null check (length(id) between 1 and 60),
  label        text not null check (length(label) between 1 and 80),
  service_mode text not null check (service_mode in ('delivery', 'pickup')),
  spot_number  int check (spot_number > 0),
  active       boolean not null default true,
  sort_order   int not null default 0,
  primary key (venue_id, id)
);

-- Apart from touchpoints on purpose: public can read that table, and must never read tokens.
create table if not exists demo.touchpoint_secrets (
  venue_id      uuid not null,
  touchpoint_id text not null,
  token         text not null,
  primary key (venue_id, touchpoint_id),
  foreign key (venue_id, touchpoint_id) references demo.touchpoints (venue_id, id) on delete cascade
);

create table if not exists demo.venue_keys (
  venue_id uuid primary key references demo.venues (id) on delete cascade,
  key_hash text not null unique
);

-- One document per venue: a save is a single atomic write. Not in the Realtime publication:
-- guests watch venues.menu_version, because a large document can't travel through Realtime.
create table if not exists demo.venue_menus (
  venue_id   uuid primary key references demo.venues (id) on delete cascade,
  menu       jsonb not null check (jsonb_typeof(menu) = 'array'),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- access
revoke all on demo.venues, demo.touchpoints, demo.touchpoint_secrets, demo.venue_keys, demo.venue_menus
  from public, anon, authenticated;
grant select on demo.venues, demo.touchpoints, demo.venue_menus to anon, authenticated;
grant all on demo.venues, demo.touchpoints, demo.touchpoint_secrets, demo.venue_keys, demo.venue_menus
  to service_role;

alter table demo.venues             enable row level security;
alter table demo.touchpoints        enable row level security;
alter table demo.touchpoint_secrets enable row level security;
alter table demo.venue_keys         enable row level security;
alter table demo.venue_menus        enable row level security;

drop policy if exists venues_public_read on demo.venues;
create policy venues_public_read on demo.venues for select to anon, authenticated using (true);
drop policy if exists touchpoints_public_read on demo.touchpoints;
create policy touchpoints_public_read on demo.touchpoints for select to anon, authenticated using (true);
drop policy if exists venue_menus_public_read on demo.venue_menus;
create policy venue_menus_public_read on demo.venue_menus for select to anon, authenticated using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'demo' and tablename = 'venues'
  ) then
    alter publication supabase_realtime add table demo.venues;
  end if;
end $$;

-- ---------------------------------------------------------------- functions
create or replace function demo.take_daily_limit(p_bucket text, p_max int) returns void
language plpgsql set search_path = '' as $$
declare v_hits int;
begin
  insert into demo.rate_limits as r (bucket, window_start, hits)
  values (p_bucket, date_trunc('day', now()), 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  if v_hits > p_max then
    raise exception 'rate_limited';
  end if;
end $$;

create or replace function demo.new_token() returns text
language sql volatile set search_path = '' as $$
  select replace(gen_random_uuid()::text, '-', '');
$$;

create or replace function demo.save_touchpoints(p_venue uuid, p_touchpoints jsonb) returns void
language plpgsql set search_path = '' as $$
begin
  delete from demo.touchpoints t
  where t.venue_id = p_venue
    and t.id not in (select e ->> 'id' from jsonb_array_elements(p_touchpoints) e);

  insert into demo.touchpoints (venue_id, id, label, service_mode, spot_number, active, sort_order)
  select p_venue, e ->> 'id', e ->> 'label', e ->> 'service_mode', (e ->> 'spot_number')::int,
         (e ->> 'active')::boolean, (o - 1)::int
  from jsonb_array_elements(p_touchpoints) with ordinality as x(e, o)
  on conflict (venue_id, id) do update set
    label = excluded.label, service_mode = excluded.service_mode, spot_number = excluded.spot_number,
    active = excluded.active, sort_order = excluded.sort_order;

  -- A token the owner sent that isn't the stored one means Regenerate, so it becomes a new random
  -- token. Clients can never choose their own.
  insert into demo.touchpoint_secrets (venue_id, touchpoint_id, token)
  select p_venue, e ->> 'id', demo.new_token()
  from jsonb_array_elements(p_touchpoints) e
  on conflict (venue_id, touchpoint_id) do nothing;

  update demo.touchpoint_secrets s set token = demo.new_token()
  from jsonb_array_elements(p_touchpoints) e
  where s.venue_id = p_venue and s.touchpoint_id = e ->> 'id'
    and e ->> 'token' = 'regenerate';
end $$;

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

  insert into demo.venues (slug, name, industry, country, region, currency, sample_menu)
  values (v_slug, p_venue ->> 'name', p_venue ->> 'industry', p_venue ->> 'country',
          p_venue ->> 'region', p_venue ->> 'currency', p_sample)
  returning * into v_row;
  insert into demo.venue_keys (venue_id, key_hash) values (v_row.id, p_key_hash);
  insert into demo.venue_menus (venue_id, menu) values (v_row.id, p_menu);
  perform demo.save_touchpoints(v_row.id, p_touchpoints);
  return v_row;
end $$;

-- The version check stops a stale tab overwriting newer changes.
create or replace function demo.update_venue(
  p_id uuid, p_base_version int, p_details jsonb, p_menu jsonb, p_sample boolean, p_touchpoints jsonb
) returns demo.venues
language plpgsql set search_path = '' as $$
declare v_row demo.venues;
begin
  update demo.venues v set
    menu_version = v.menu_version + 1,
    last_activity_at = now(),
    sample_menu = coalesce(p_sample, v.sample_menu),
    name = coalesce(p_details ->> 'name', v.name),
    country = coalesce(p_details ->> 'country', v.country),
    region = coalesce(p_details ->> 'region', v.region),
    currency = coalesce(p_details ->> 'currency', v.currency)
  where v.id = p_id and v.menu_version = p_base_version
  returning * into v_row;
  if not found then
    raise exception 'version_conflict';
  end if;
  if p_menu is not null then
    update demo.venue_menus m set menu = p_menu, updated_at = now() where m.venue_id = p_id;
  end if;
  if p_touchpoints is not null then
    perform demo.save_touchpoints(p_id, p_touchpoints);
  end if;
  return v_row;
end $$;

create or replace function demo.touch_venue(p_slug text) returns void
language sql set search_path = '' as $$
  update demo.venues set last_activity_at = now() where slug = p_slug;
$$;

create or replace function demo.delete_venue(p_slug text) returns uuid
language plpgsql set search_path = '' as $$
declare v_id uuid;
begin
  delete from demo.orders where venue_slug = p_slug;
  delete from demo.item_stock where venue_slug = p_slug;
  delete from demo.daily_counters where venue_slug = p_slug;
  delete from demo.venues where slug = p_slug returning id into v_id;
  return v_id;
end $$;

create or replace function demo.expired_venues(p_limit int) returns table (id uuid, slug text)
language sql stable set search_path = '' as $$
  select v.id, v.slug from demo.venues v
  where v.last_activity_at < now() - interval '14 days'
  order by v.last_activity_at
  limit p_limit;
$$;

-- These two replace the versions in 002: they must leave testers' own venues alone.
create or replace function demo.clear_all() returns int
language plpgsql set search_path = '' as $$
declare v_count int;
begin
  delete from demo.item_stock where venue_slug in ('demo-brewery', 'demo-food-truck');
  delete from demo.orders where venue_slug in ('demo-brewery', 'demo-food-truck');
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function demo.cleanup_old() returns int
language plpgsql set search_path = '' as $$
declare v_count int;
begin
  delete from demo.orders
  where venue_slug in ('demo-brewery', 'demo-food-truck') and created_at < now() - interval '24 hours';
  get diagnostics v_count = row_count;
  delete from demo.item_stock
  where venue_slug in ('demo-brewery', 'demo-food-truck') and updated_at < now() - interval '24 hours';
  delete from demo.rate_limits where window_start < now() - interval '2 days';
  delete from demo.daily_counters where local_date < (now() at time zone 'America/Vancouver')::date - 2;
  return v_count;
end $$;

revoke all on all functions in schema demo from public, anon, authenticated;
grant execute on all functions in schema demo to service_role;

-- ---------------------------------------------------------------- photos
-- Public read. Only the server writes, and only small JPEGs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('demo-menu', 'demo-menu', true, 512000, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
