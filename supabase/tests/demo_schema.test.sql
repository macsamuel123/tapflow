-- The shared demo schema: public reads only, atomic writes, rate limits and 24h cleanup.
-- Needs supabase/demo/*.sql, which `make seed` loads. Everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(28);

create function pg_temp.order_json(slug text default 'demo-brewery') returns jsonb language sql as $$
  select jsonb_build_object(
    'venue_slug', slug, 'touchpoint_id', 't7', 'touchpoint_label', 'Table 7', 'service_mode', 'delivery',
    'items', '[]'::jsonb, 'subtotal_cents', 1000, 'tax_lines', '[]'::jsonb, 'tax_cents', 150, 'total_cents', 1150
  );
$$;
grant execute on function pg_temp.order_json(text) to anon;

select demo.clear_all();
delete from demo.daily_counters;
delete from demo.rate_limits;

-- ------------------------------------------------------------------ writes, as the server
select lives_ok($$ select demo.create_order('ip-a', 10, pg_temp.order_json()) $$, 'the server can create an order');
create temp table first_order on commit drop as select id, ticket_number from demo.orders limit 1;
grant select on first_order to anon;
select is((select status from demo.orders limit 1), 'paid', 'orders start paid');
select is((select demo.create_order('ip-a', 10, pg_temp.order_json())).ticket_number, 2, 'ticket numbers count up per venue');
select is((select demo.create_order('ip-a', 10, pg_temp.order_json('demo-food-truck'))).ticket_number, 1, 'each venue has its own counter');

select throws_ok($$ select demo.create_order('ip-a', 10, pg_temp.order_json() || '{"total_cents": 1}') $$,
  '23514', null, 'a total that does not add up is rejected by the database');
select throws_ok($$ select demo.create_order('ip-a', 10, pg_temp.order_json('someone-else')) $$,
  '23514', null, 'only the demo venues can have orders');

-- ------------------------------------------------------------------ status steps
select throws_ok($$ select demo.set_order_status('ip-a', 60, (select id from first_order), 'delivered') $$,
  'P0001', 'invalid_transition', 'paid -> delivered is rejected');
select throws_ok($$ select demo.set_order_status('ip-a', 60, (select id from first_order), 'picked_up') $$,
  'P0001', 'invalid_transition', 'picked_up is rejected');
select lives_ok($$ select demo.set_order_status('ip-a', 60, (select id from first_order), 'accepted') $$, 'paid -> accepted');
select throws_ok($$ select demo.set_order_status('ip-a', 60, (select id from first_order), 'accepted') $$,
  'P0001', 'invalid_transition', 'a second tap on the same step is rejected');
select lives_ok($$ select demo.set_order_status('ip-a', 60, (select id from first_order), 'ready') $$, 'accepted -> ready');
select throws_ok($$ select demo.set_order_status('ip-a', 60, (select id from first_order), 'picked_up') $$,
  'P0001', 'invalid_transition', 'a delivery order cannot be picked up');
select throws_ok($$ select demo.set_order_status('ip-a', 60, (select id from first_order), 'cancelled') $$,
  'P0001', 'invalid_transition', 'ready orders cannot be cancelled');
select lives_ok($$ select demo.set_order_status('ip-a', 60, (select id from first_order), 'delivered') $$, 'ready -> delivered');
select throws_ok($$ select demo.set_order_status('ip-a', 60, gen_random_uuid(), 'accepted') $$,
  'P0001', 'not_found', 'an unknown order is reported as not found');

-- ------------------------------------------------------------------ rate limit
select demo.take_rate_limit('test', 2);
select demo.take_rate_limit('test', 2);
select throws_ok($$ select demo.take_rate_limit('test', 2) $$, 'P0001', 'rate_limited', 'the limit triggers');
select lives_ok($$ select demo.take_rate_limit('other', 2) $$, 'another IP is unaffected');

-- ------------------------------------------------------------------ cleanup
select demo.set_item_stock('ip-a', 60, 'demo-brewery', 'old-item', true);
select demo.set_item_stock('ip-a', 60, 'demo-brewery', 'new-item', true);
update demo.item_stock set updated_at = now() - interval '25 hours' where item_id = 'old-item';
update demo.orders set created_at = now() - interval '25 hours' where ticket_number = 1 and venue_slug = 'demo-brewery';
update demo.orders set created_at = now() - interval '23 hours' where ticket_number = 2;
select is(demo.cleanup_old(), 1, 'cleanup deletes orders older than 24 hours');
select is((select count(*)::int from demo.orders where ticket_number = 2), 1, 'cleanup keeps newer orders');
select is((select array_agg(item_id) from demo.item_stock), array['new-item'], 'cleanup resets old sold-out overrides');
select is((select count(*)::int from cron.job where jobname = 'demo-cleanup'), 1, 'cleanup is scheduled');

-- ------------------------------------------------------------------ as anon
set local role anon;
select ok((select count(*) from demo.orders) >= 1, 'anon can read orders (Realtime needs it)');
select throws_ok($$ insert into demo.orders (venue_slug) values ('demo-brewery') $$, '42501', null, 'anon cannot insert orders');
select throws_ok($$ update demo.orders set status = 'cancelled' $$, '42501', null, 'anon cannot update orders');
select throws_ok($$ delete from demo.orders $$, '42501', null, 'anon cannot delete orders');
select throws_ok($$ delete from demo.item_stock $$, '42501', null, 'anon cannot change stock');
select throws_ok($$ select * from demo.rate_limits $$, '42501', null, 'anon cannot read rate limits');
select throws_ok($$ select demo.clear_all() $$, '42501', null, 'anon cannot call the write functions');

select * from finish();
rollback;
