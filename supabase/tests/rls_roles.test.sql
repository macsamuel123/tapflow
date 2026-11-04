-- RLS by role: owner, manager, fulfillment, runner and platform admin.
-- Run with `make test-db` (supabase test db). Everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(35);

-- ------------------------------------------------------------------ fixtures (as postgres)
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner@roles.test'),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'manager@roles.test'),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'fulfillment@roles.test'),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'runner@roles.test'),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'admin@roles.test');

insert into public.venues (id, slug, name, timezone) values
  ('21000000-0000-4000-8000-00000000000a', 'roles-test-a', 'Roles A', 'America/Vancouver'),
  ('21000000-0000-4000-8000-00000000000b', 'roles-test-b', 'Roles B', 'America/Vancouver');

update public.venue_payment_settings set stripe_account_id = 'acct_roles_a'
  where venue_id = '21000000-0000-4000-8000-00000000000a';

insert into public.staff_members (user_id, venue_id, role) values
  ('11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-00000000000a', 'owner'),
  ('11000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-00000000000a', 'manager'),
  ('11000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-00000000000a', 'fulfillment'),
  ('11000000-0000-4000-8000-000000000004', '21000000-0000-4000-8000-00000000000a', 'runner');

insert into public.platform_admins (user_id) values ('11000000-0000-4000-8000-000000000005');

insert into public.touchpoints (id, venue_id, label, qr_secret) values
  ('31000000-0000-4000-8000-00000000000a', '21000000-0000-4000-8000-00000000000a', 'A1', 'test-secret-roles-a'),
  ('31000000-0000-4000-8000-00000000000b', '21000000-0000-4000-8000-00000000000b', 'B1', 'test-secret-roles-b');

-- status_updated_at sits on either side of the venue's local midnight, whatever the UTC date.
insert into public.orders
  (id, venue_id, touchpoint_id, status, currency, subtotal_cents, tax_cents, total_cents,
   paid_at, ticket_number, ticket_date, status_updated_at)
select o.id::uuid, o.venue::uuid, o.touchpoint::uuid, o.status::public.order_status, 'CAD', 1000, 50, 1050,
       case when o.paid then now() end,
       case when o.paid then o.ticket end,
       case when o.paid then current_date end,
       case o.day
         when 'today' then date_trunc('day', now() at time zone 'America/Vancouver') at time zone 'America/Vancouver'
         when 'yesterday' then (date_trunc('day', now() at time zone 'America/Vancouver') - interval '1 minute') at time zone 'America/Vancouver'
       end
from (values
  ('51000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-00000000000a', '31000000-0000-4000-8000-00000000000a', 'paid',            true,  1, 'today'),
  ('51000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-00000000000a', '31000000-0000-4000-8000-00000000000a', 'accepted',        true,  2, 'yesterday'),
  ('51000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-00000000000a', '31000000-0000-4000-8000-00000000000a', 'ready',           true,  3, 'yesterday'),
  ('51000000-0000-4000-8000-000000000004', '21000000-0000-4000-8000-00000000000a', '31000000-0000-4000-8000-00000000000a', 'delivered',       true,  4, 'today'),
  ('51000000-0000-4000-8000-000000000005', '21000000-0000-4000-8000-00000000000a', '31000000-0000-4000-8000-00000000000a', 'delivered',       true,  5, 'yesterday'),
  ('51000000-0000-4000-8000-000000000006', '21000000-0000-4000-8000-00000000000a', '31000000-0000-4000-8000-00000000000a', 'cancelled',       true,  6, 'today'),
  ('51000000-0000-4000-8000-000000000007', '21000000-0000-4000-8000-00000000000a', '31000000-0000-4000-8000-00000000000a', 'cancelled',       true,  7, 'yesterday'),
  ('51000000-0000-4000-8000-000000000008', '21000000-0000-4000-8000-00000000000a', '31000000-0000-4000-8000-00000000000a', 'pending_payment', false, 0, 'today'),
  -- An abandoned checkout: cancelled, never paid.
  ('51000000-0000-4000-8000-000000000009', '21000000-0000-4000-8000-00000000000a', '31000000-0000-4000-8000-00000000000a', 'cancelled',       false, 0, 'today'),
  ('51000000-0000-4000-8000-00000000000b', '21000000-0000-4000-8000-00000000000b', '31000000-0000-4000-8000-00000000000b', 'paid',            true,  1, 'today')
) as o(id, venue, touchpoint, status, paid, ticket, day);

insert into public.order_items (order_id, name_snapshot, unit_price_cents, quantity, line_total_cents,
                                tax_category_name_snapshot, tax_codes_snapshot)
select id, 'Dish', 1000, 1, 1000, 'Food', '{GST}' from public.orders
where venue_id in ('21000000-0000-4000-8000-00000000000a', '21000000-0000-4000-8000-00000000000b');

insert into public.order_payments (order_id, platform_fee_cents, stripe_payment_intent_id) values
  ('51000000-0000-4000-8000-000000000001', 30, 'pi_roles_paid'),
  ('51000000-0000-4000-8000-000000000008', 30, 'pi_roles_pending'),
  ('51000000-0000-4000-8000-00000000000b', 30, 'pi_roles_other_venue');

select is((select count(*)::int from public.venue_payment_settings
           where venue_id in ('21000000-0000-4000-8000-00000000000a', '21000000-0000-4000-8000-00000000000b')),
  2, 'every new venue gets a payment settings row');

-- Orders of the fixture venues only: seed data must not change these counts.
create function pg_temp.ticket_numbers() returns int[] language sql as $$
  select coalesce(array_agg(ticket_number order by ticket_number), '{}')
  from public.orders
  where venue_id = '21000000-0000-4000-8000-00000000000a';
$$;
grant execute on function pg_temp.ticket_numbers() to authenticated;

-- ------------------------------------------------------------------ as owner
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(pg_temp.ticket_numbers(), array[1, 2, 3, 4, 5, 6, 7], 'owner sees every paid order of the venue');
select is((select stripe_account_id from public.venue_payment_settings), 'acct_roles_a',
  'owner reads the Stripe settings of their venue');
select is((select array_agg(stripe_payment_intent_id) from public.order_payments), array['pi_roles_paid'],
  'owner reads payouts for paid orders of their venue only');
select is((select count(*)::int from public.orders where status = 'pending_payment'), 0,
  'owner cannot see pending_payment orders');
select is((select count(*)::int from public.orders where paid_at is null), 0,
  'owner cannot see abandoned checkouts');
select is((select count(*)::int from public.platform_admins), 0, 'owner cannot read platform_admins');
select throws_ok($$update public.venue_payment_settings set platform_fee_bps = 0$$,
  '42501', null, 'owner cannot write payment settings directly');

-- ------------------------------------------------------------------ as manager
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(pg_temp.ticket_numbers(), array[1, 2, 3, 4, 5, 6, 7], 'manager sees all orders and history of the venue');
select is((select count(*)::int from public.venue_payment_settings), 0, 'manager cannot see Stripe settings');
select is((select count(*)::int from public.order_payments), 0, 'manager cannot see payouts');
select throws_ok('select stripe_payment_intent_id from public.orders', '42703', null,
  'payment columns are not on orders');
select throws_ok('select platform_fee_bps from public.venues', '42703', null,
  'payment columns are not on venues');
select is((select count(*)::int from public.orders where paid_at is null), 0,
  'manager cannot see unpaid orders');
select is((select count(*)::int from public.platform_admins), 0, 'manager cannot read platform_admins');

-- ------------------------------------------------------------------ as fulfillment
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select is(pg_temp.ticket_numbers(), array[1, 2, 3, 4, 6],
  'fulfillment sees active orders and orders closed today, not older ones');
select is((select count(*)::int from public.order_items i join public.orders o on o.id = i.order_id
           where o.ticket_number = 5), 0, 'fulfillment cannot read items of older closed orders');
select is((select count(*)::int from public.venue_payment_settings), 0, 'fulfillment cannot see Stripe settings');
select is((select count(*)::int from public.order_payments), 0, 'fulfillment cannot see payouts');
select is((select count(*)::int from public.platform_admins), 0, 'fulfillment cannot read platform_admins');
select throws_ok($$update public.orders set status = 'accepted'$$, '42501', null,
  'fulfillment access to orders is read-only');

-- ------------------------------------------------------------------ as runner
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

select is(pg_temp.ticket_numbers(), array[3], 'runner sees ready orders only');
select is((select count(*)::int from public.order_items where order_id in (
             '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000004')),
  0, 'runner cannot read items of orders that are not ready');
select is((select count(*)::int from public.order_items), 1, 'runner reads items of the ready order');
select is((select label from public.touchpoints where id = '31000000-0000-4000-8000-00000000000a'), 'A1',
  'runner can read the touchpoint label to deliver to');
select is((select count(*)::int from public.platform_admins), 0, 'runner cannot read platform_admins');

-- ------------------------------------------------------------------ as platform admin
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000005","role":"authenticated"}', true);

select is((select count(*)::int from public.venues
           where id in ('21000000-0000-4000-8000-00000000000a', '21000000-0000-4000-8000-00000000000b')),
  2, 'platform admin can read all venues');
select is((select count(*)::int from public.orders
           where venue_id in ('21000000-0000-4000-8000-00000000000a', '21000000-0000-4000-8000-00000000000b')),
  10, 'platform admin can read every order, across venues');
select is((select count(*)::int from public.orders where id = '51000000-0000-4000-8000-000000000008'),
  1, 'platform admin can read pending_payment orders for support');
select is((select count(*)::int from public.order_payments
           where stripe_payment_intent_id like 'pi_roles_%'), 3, 'platform admin can read payments across venues');
select ok((select count(*) from public.platform_admins) >= 1, 'platform admin can read platform_admins');
select throws_ok('select qr_secret from public.touchpoints', '42501', null,
  'platform admin cannot read touchpoints.qr_secret');
select throws_ok($$update public.orders set status = 'cancelled'$$, '42501', null,
  'platform admin cannot write orders directly');
select throws_ok($$update public.venues set name = 'Hacked'$$, '42501', null,
  'platform admin cannot write venues directly');
select throws_ok($$insert into public.platform_admins (user_id) values ('11000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'no client can add a platform admin');

select * from finish();
rollback;
