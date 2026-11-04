-- RLS / grants: tenant isolation, "tickets only after payment", qr_secret secrecy, status guard,
-- per-category tax integrity. Run with `make test-db` (supabase test db). Everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(19);

-- ------------------------------------------------------------------ fixtures (as postgres)
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'a-fulfillment@test.local'),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'b-owner@test.local');

insert into public.venues (id, slug, name) values
  ('20000000-0000-4000-8000-00000000000a', 'rls-test-a', 'RLS Test A'),
  ('20000000-0000-4000-8000-00000000000b', 'rls-test-b', 'RLS Test B');

insert into public.staff_members (user_id, venue_id, role) values
  ('10000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-00000000000a', 'fulfillment'),
  ('10000000-0000-4000-8000-00000000000b', '20000000-0000-4000-8000-00000000000b', 'owner');

insert into public.touchpoints (id, venue_id, label, kind, qr_secret) values
  ('30000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-00000000000a', 'A1', 'seat', 'test-secret-aaaaaaaa'),
  ('30000000-0000-4000-8000-00000000000b', '20000000-0000-4000-8000-00000000000b', 'B1', 'table', 'test-secret-bbbbbbbb');

insert into public.tax_categories (id, venue_id, name, rate_bps) values
  ('60000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-00000000000a', 'Food', 500),
  ('60000000-0000-4000-8000-00000000000b', '20000000-0000-4000-8000-00000000000b', 'Food', 500);

insert into public.menu_categories (id, venue_id, name) values
  ('40000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-00000000000a', 'Mains');
insert into public.menu_items (venue_id, category_id, tax_category_id, name, price_cents) values
  ('20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-00000000000a', '60000000-0000-4000-8000-00000000000a', 'Test Dish', 1000);

insert into public.orders
  (id, venue_id, touchpoint_id, status, currency, subtotal_cents, tax_cents, platform_fee_cents, total_cents,
   paid_at, ticket_number, ticket_date) values
  -- A: one paid, one pending
  ('50000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-00000000000a',
   'paid', 'CAD', 1000, 50, 30, 1050, now(), 1, current_date),
  ('50000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-00000000000a',
   'pending_payment', 'CAD', 1000, 50, 30, 1050, null, null, null),
  -- B: one paid
  ('50000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-00000000000b', '30000000-0000-4000-8000-00000000000b',
   'paid', 'CAD', 2000, 100, 60, 2100, now(), 1, current_date);

-- ------------------------------------------------------------------ as fulfillment staff of A
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

select is((select count(*)::int from public.orders where venue_id = '20000000-0000-4000-8000-00000000000b'),
  0, 'staff of A cannot read orders of B');
select is((select count(*)::int from public.orders where venue_id = '20000000-0000-4000-8000-00000000000a' and status = 'paid'),
  1, 'staff of A can read paid orders of A');
select is((select count(*)::int from public.orders where status = 'pending_payment'),
  0, 'staff cannot see pending_payment orders (tickets only after payment)');
select is((select count(*)::int from public.venues where id = '20000000-0000-4000-8000-00000000000b'),
  0, 'staff of A cannot read venue B');
select is((select count(id)::int from public.touchpoints where venue_id = '20000000-0000-4000-8000-00000000000b'),
  0, 'staff of A cannot read touchpoints of B');
select throws_ok('select qr_secret from public.touchpoints', '42501', null,
  'staff cannot read touchpoints.qr_secret');
select throws_ok($$update public.orders set status = 'accepted' where id = '50000000-0000-4000-8000-0000000000a1'$$,
  '42501', null, 'staff cannot write orders directly (writes go through the API)');
select throws_ok('select * from public.touchpoint_sessions', '42501', null,
  'staff cannot read diner sessions');
select throws_ok($$insert into public.tax_categories (venue_id, name, rate_bps) values ('20000000-0000-4000-8000-00000000000a', 'Sneaky', 0)$$,
  '42501', null, 'staff cannot write tax categories (rates are set by the API/owner tooling)');

-- ------------------------------------------------------------------ as owner of B
select set_config('request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);

select is((select count(*)::int from public.orders where venue_id = '20000000-0000-4000-8000-00000000000a'),
  0, 'owner of B cannot read orders of A');
select is((select count(*)::int from public.orders where venue_id = '20000000-0000-4000-8000-00000000000b'),
  1, 'owner of B can read paid orders of B');

-- ------------------------------------------------------------------ as anon (diner browser)
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select throws_ok('select * from public.orders', '42501', null, 'anon cannot read orders');
select ok((select count(*) from public.menu_items where venue_id = '20000000-0000-4000-8000-00000000000a') >= 1,
  'anon can read menu items');
select ok((select count(*) from public.tax_categories where venue_id = '20000000-0000-4000-8000-00000000000a') >= 1,
  'anon can read tax categories (rates shown per item)');
select throws_ok('select qr_secret from public.touchpoints', '42501', null, 'anon cannot read touchpoints.qr_secret');

-- ------------------------------------------------------------------ integrity + status guard (as postgres)
reset role;

select throws_ok($$insert into public.menu_items (venue_id, category_id, tax_category_id, name, price_cents)
  values ('20000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-00000000000a',
          '60000000-0000-4000-8000-00000000000b', 'Cross-venue tax', 100)$$,
  '23503', null, 'a menu item cannot use another venue''s tax category');

select throws_ok($$update public.orders set status = 'delivered' where id = '50000000-0000-4000-8000-0000000000a1'$$,
  '23514', null, 'invalid status transition paid -> delivered is rejected');
select lives_ok($$update public.orders set status = 'accepted' where id = '50000000-0000-4000-8000-0000000000a1'$$,
  'valid status transition paid -> accepted succeeds');
select isnt((select accepted_at from public.orders where id = '50000000-0000-4000-8000-0000000000a1'),
  null, 'accepted_at is stamped on transition');

select * from finish();
rollback;
