-- RLS / grants: tenant isolation, "tickets only after payment", qr_secret secrecy, status guard.
-- Run with `make test-db` (supabase test db). Everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

-- ------------------------------------------------------------------ fixtures (as postgres)
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'a-kitchen@test.local'),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'b-owner@test.local');

insert into public.restaurants (id, slug, name) values
  ('20000000-0000-4000-8000-00000000000a', 'rls-test-a', 'RLS Test A'),
  ('20000000-0000-4000-8000-00000000000b', 'rls-test-b', 'RLS Test B');

insert into public.staff_members (user_id, restaurant_id, role) values
  ('10000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-00000000000a', 'kitchen'),
  ('10000000-0000-4000-8000-00000000000b', '20000000-0000-4000-8000-00000000000b', 'owner');

insert into public.tables (id, restaurant_id, label, qr_secret) values
  ('30000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-00000000000a', 'A1', 'test-secret-aaaaaaaa'),
  ('30000000-0000-4000-8000-00000000000b', '20000000-0000-4000-8000-00000000000b', 'B1', 'test-secret-bbbbbbbb');

insert into public.menu_categories (id, restaurant_id, name) values
  ('40000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-00000000000a', 'Mains');
insert into public.menu_items (restaurant_id, category_id, name, price_cents) values
  ('20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-00000000000a', 'Test Dish', 1000);

insert into public.orders
  (id, restaurant_id, table_id, status, currency, subtotal_cents, tax_cents, platform_fee_cents, total_cents,
   paid_at, ticket_number, ticket_date) values
  -- A: one paid, one pending
  ('50000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-00000000000a',
   'paid', 'CAD', 1000, 50, 30, 1050, now(), 1, current_date),
  ('50000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-00000000000a',
   'pending_payment', 'CAD', 1000, 50, 30, 1050, null, null, null),
  -- B: one paid
  ('50000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-00000000000b', '30000000-0000-4000-8000-00000000000b',
   'paid', 'CAD', 2000, 100, 60, 2100, now(), 1, current_date);

-- ------------------------------------------------------------------ as kitchen staff of A
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

select is((select count(*)::int from public.orders where restaurant_id = '20000000-0000-4000-8000-00000000000b'),
  0, 'staff of A cannot read orders of B');
select is((select count(*)::int from public.orders where restaurant_id = '20000000-0000-4000-8000-00000000000a' and status = 'paid'),
  1, 'staff of A can read paid orders of A');
select is((select count(*)::int from public.orders where status = 'pending_payment'),
  0, 'staff cannot see pending_payment orders (tickets only after payment)');
select is((select count(*)::int from public.restaurants where id = '20000000-0000-4000-8000-00000000000b'),
  0, 'staff of A cannot read restaurant B');
select is((select count(id)::int from public.tables where restaurant_id = '20000000-0000-4000-8000-00000000000b'),
  0, 'staff of A cannot read tables of B');
select throws_ok('select qr_secret from public.tables', '42501', null,
  'staff cannot read tables.qr_secret');
select throws_ok($$update public.orders set status = 'accepted' where id = '50000000-0000-4000-8000-0000000000a1'$$,
  '42501', null, 'staff cannot write orders directly (writes go through the API)');
select throws_ok('select * from public.table_sessions', '42501', null,
  'staff cannot read diner sessions');

-- ------------------------------------------------------------------ as owner of B
select set_config('request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);

select is((select count(*)::int from public.orders where restaurant_id = '20000000-0000-4000-8000-00000000000a'),
  0, 'owner of B cannot read orders of A');
select is((select count(*)::int from public.orders where restaurant_id = '20000000-0000-4000-8000-00000000000b'),
  1, 'owner of B can read paid orders of B');

-- ------------------------------------------------------------------ as anon (diner browser)
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select throws_ok('select * from public.orders', '42501', null, 'anon cannot read orders');
select ok((select count(*) from public.menu_items where restaurant_id = '20000000-0000-4000-8000-00000000000a') >= 1,
  'anon can read menu items');
select throws_ok('select qr_secret from public.tables', '42501', null, 'anon cannot read tables.qr_secret');

-- ------------------------------------------------------------------ status guard (as postgres)
reset role;

select throws_ok($$update public.orders set status = 'delivered' where id = '50000000-0000-4000-8000-0000000000a1'$$,
  '23514', null, 'invalid status transition paid -> delivered is rejected');
select lives_ok($$update public.orders set status = 'accepted' where id = '50000000-0000-4000-8000-0000000000a1'$$,
  'valid status transition paid -> accepted succeeds');
select isnt((select accepted_at from public.orders where id = '50000000-0000-4000-8000-0000000000a1'),
  null, 'accepted_at is stamped on transition');

select * from finish();
rollback;
