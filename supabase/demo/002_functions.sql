-- Write functions for the shared demo. Only the server (service_role) can call them: the schema
-- is exposed through the API, so without the revokes below anon could call them directly.

create or replace function demo.take_rate_limit(p_bucket text, p_max int) returns void
language plpgsql set search_path = '' as $$
declare v_hits int;
begin
  insert into demo.rate_limits as r (bucket, window_start, hits)
  values (p_bucket, date_trunc('minute', now()), 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  if v_hits > p_max then
    raise exception 'rate_limited';
  end if;
end $$;

create or replace function demo.create_order(p_ip text, p_max int, p_order jsonb) returns demo.orders
language plpgsql set search_path = '' as $$
declare
  v_slug text := p_order ->> 'venue_slug';
  v_date date := (now() at time zone 'America/Vancouver')::date;
  v_number int;
  v_row demo.orders;
begin
  perform demo.take_rate_limit('orders:' || p_ip, p_max);

  insert into demo.daily_counters as c (venue_slug, local_date, last_number)
  values (v_slug, v_date, 1)
  on conflict (venue_slug, local_date) do update set last_number = c.last_number + 1
  returning last_number into v_number;

  insert into demo.orders (
    venue_slug, touchpoint_id, touchpoint_label, service_mode, items, subtotal_cents, tax_lines,
    tax_cents, tip_cents, total_cents, guest_name, ticket_number
  ) values (
    v_slug,
    p_order ->> 'touchpoint_id',
    p_order ->> 'touchpoint_label',
    p_order ->> 'service_mode',
    p_order -> 'items',
    (p_order ->> 'subtotal_cents')::int,
    p_order -> 'tax_lines',
    (p_order ->> 'tax_cents')::int,
    0,
    (p_order ->> 'total_cents')::int,
    p_order ->> 'guest_name',
    v_number
  ) returning * into v_row;
  return v_row;
end $$;

-- One atomic update, so two people tapping at once can't skip a step.
create or replace function demo.set_order_status(p_ip text, p_max int, p_id uuid, p_status text)
returns demo.orders
language plpgsql set search_path = '' as $$
declare v_row demo.orders;
begin
  perform demo.take_rate_limit('status:' || p_ip, p_max);

  update demo.orders o set status = p_status, updated_at = now()
  where o.id = p_id and (
       (o.status = 'paid'     and p_status in ('accepted', 'cancelled'))
    or (o.status = 'accepted' and p_status in ('ready', 'cancelled'))
    or (o.status = 'ready' and o.service_mode = 'delivery' and p_status = 'delivered')
    or (o.status = 'ready' and o.service_mode = 'pickup'   and p_status = 'picked_up')
  ) returning * into v_row;

  if found then
    return v_row;
  end if;
  if exists (select 1 from demo.orders o where o.id = p_id) then
    raise exception 'invalid_transition';
  end if;
  raise exception 'not_found';
end $$;

create or replace function demo.set_item_stock(p_ip text, p_max int, p_slug text, p_item text, p_sold_out boolean)
returns void
language plpgsql set search_path = '' as $$
begin
  perform demo.take_rate_limit('stock:' || p_ip, p_max);
  insert into demo.item_stock (venue_slug, item_id, sold_out)
  values (p_slug, p_item, p_sold_out)
  on conflict (venue_slug, item_id) do update set sold_out = excluded.sold_out, updated_at = now();
end $$;

create or replace function demo.check_admin_attempt(p_ip text, p_max int) returns void
language sql set search_path = '' as $$
  select demo.take_rate_limit('admin:' || p_ip, p_max);
$$;

create or replace function demo.clear_all() returns int
language plpgsql set search_path = '' as $$
declare v_count int;
begin
  delete from demo.item_stock where true;
  delete from demo.orders where true;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function demo.cleanup_old() returns int
language plpgsql set search_path = '' as $$
declare v_count int;
begin
  delete from demo.orders where created_at < now() - interval '24 hours';
  get diagnostics v_count = row_count;
  delete from demo.item_stock where updated_at < now() - interval '24 hours';
  delete from demo.rate_limits where window_start < now() - interval '1 hour';
  delete from demo.daily_counters where local_date < (now() at time zone 'America/Vancouver')::date - 2;
  return v_count;
end $$;

-- The keepalive route's trivial query.
create or replace function demo.ping() returns int
language sql stable set search_path = '' as $$ select 1 $$;

revoke all on all functions in schema demo from public, anon, authenticated;
grant execute on all functions in schema demo to service_role;

-- ---------------------------------------------------------------- hourly cleanup
create extension if not exists pg_cron;
select cron.schedule('demo-cleanup', '7 * * * *', 'select demo.cleanup_old()');
