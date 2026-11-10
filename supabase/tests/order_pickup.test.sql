-- M7: pickup orders. Status guard (picked_up only from ready on a pickup order), runner and
-- fulfillment visibility, guest_name, service_mode grants, one pending order per session.
-- Run with `make test-db` (supabase test db). Everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(20);

-- ------------------------------------------------------------------ fixtures (as postgres)
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'fulfillment@pickup.test'),
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'runner@pickup.test');

insert into public.venues (id, slug, name, timezone) values
  ('22000000-0000-4000-8000-00000000000a', 'pickup-test-a', 'Pickup A', 'America/Vancouver');

insert into public.staff_members (user_id, venue_id, role) values
  ('12000000-0000-4000-8000-000000000003', '22000000-0000-4000-8000-00000000000a', 'fulfillment'),
  ('12000000-0000-4000-8000-000000000004', '22000000-0000-4000-8000-00000000000a', 'runner');

insert into public.touchpoints (id, venue_id, label, kind, service_mode, qr_secret) values
  ('32000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-00000000000a', 'T1', 'table', 'delivery', 'test-secret-pickup-1'),
  ('32000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-00000000000a', 'Counter', 'counter', 'pickup', 'test-secret-pickup-2');

select is((select service_mode::text from public.touchpoints where id = '32000000-0000-4000-8000-000000000001'),
  'delivery', 'touchpoints.service_mode defaults to delivery');

insert into public.touchpoint_sessions (id, venue_id, touchpoint_id, verified) values
  ('42000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-00000000000a', '32000000-0000-4000-8000-000000000002', true);

-- Orders, all paid. "today"/"yesterday" sit either side of the venue's local midnight.
insert into public.orders
  (id, venue_id, touchpoint_id, status, service_mode, guest_name, currency,
   subtotal_cents, tax_cents, total_cents, paid_at, ticket_number, ticket_date, status_updated_at)
select o.id::uuid, '22000000-0000-4000-8000-00000000000a', o.touchpoint::uuid,
       o.status::public.order_status, o.mode::public.service_mode, o.guest,
       'CAD', 1000, 50, 1050, now(), o.ticket, current_date,
       case o.day
         when 'today' then date_trunc('day', now() at time zone 'America/Vancouver') at time zone 'America/Vancouver'
         when 'yesterday' then (date_trunc('day', now() at time zone 'America/Vancouver') - interval '1 minute') at time zone 'America/Vancouver'
       end
from (values
  ('52000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'ready',     'delivery', null,  1, 'today'),
  ('52000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000002', 'ready',     'pickup',   'Ana', 2, 'today'),
  ('52000000-0000-4000-8000-000000000003', '32000000-0000-4000-8000-000000000002', 'accepted',  'pickup',   'Bo',  3, 'today'),
  ('52000000-0000-4000-8000-000000000004', '32000000-0000-4000-8000-000000000002', 'paid',      'pickup',   'Cy',  4, 'today'),
  ('52000000-0000-4000-8000-000000000005', '32000000-0000-4000-8000-000000000002', 'picked_up', 'pickup',   'Di',  5, 'today'),
  ('52000000-0000-4000-8000-000000000006', '32000000-0000-4000-8000-000000000002', 'picked_up', 'pickup',   'Ed',  6, 'yesterday'),
  ('52000000-0000-4000-8000-000000000007', '32000000-0000-4000-8000-000000000001', 'ready',     'delivery', null,  7, 'today')
) as o(id, touchpoint, status, mode, guest, ticket, day);

-- ------------------------------------------------------------------ guest_name, pending uniqueness
select throws_ok($$
  insert into public.orders (venue_id, touchpoint_id, service_mode, currency, subtotal_cents, tax_cents, total_cents)
  values ('22000000-0000-4000-8000-00000000000a', '32000000-0000-4000-8000-000000000002', 'pickup', 'CAD', 100, 5, 105)
$$, '23514', null, 'a pickup order needs a guest_name');

select throws_ok($$
  insert into public.orders (venue_id, touchpoint_id, service_mode, guest_name, currency, subtotal_cents, tax_cents, total_cents)
  values ('22000000-0000-4000-8000-00000000000a', '32000000-0000-4000-8000-000000000002', 'pickup', repeat('x', 41), 'CAD', 100, 5, 105)
$$, '23514', null, 'guest_name is at most 40 characters');

select lives_ok($$
  insert into public.orders (venue_id, touchpoint_id, session_id, service_mode, guest_name, currency, subtotal_cents, tax_cents, total_cents)
  values ('22000000-0000-4000-8000-00000000000a', '32000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000001', 'pickup', 'Fay', 'CAD', 100, 5, 105)
$$, 'a pending pickup order with a guest name is accepted');

select throws_ok($$
  insert into public.orders (venue_id, touchpoint_id, session_id, service_mode, guest_name, currency, subtotal_cents, tax_cents, total_cents)
  values ('22000000-0000-4000-8000-00000000000a', '32000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000001', 'pickup', 'Fay', 'CAD', 100, 5, 105)
$$, '23505', null, 'a session has at most one pending_payment order');

-- ------------------------------------------------------------------ as runner
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

select is((select array_agg(ticket_number order by ticket_number) from public.orders), array[1, 7],
  'runner sees ready delivery orders and not the ready pickup order');
select is((select service_mode::text from public.touchpoints where id = '32000000-0000-4000-8000-000000000002'),
  'pickup', 'staff can read touchpoints.service_mode');
select throws_ok('select qr_secret from public.touchpoints', '42501', null,
  'touchpoints.qr_secret is still not readable');

-- ------------------------------------------------------------------ as fulfillment
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select is((select array_agg(ticket_number order by ticket_number) from public.orders), array[1, 2, 3, 4, 5, 7],
  'fulfillment sees active orders and orders picked up today, not yesterday');
select is((select count(*)::int from public.orders where status = 'picked_up'), 1,
  'fulfillment''s closed-today rule includes picked_up');

reset role;

-- ------------------------------------------------------------------ status guard (as postgres)
select throws_ok($$update public.orders set status = 'picked_up' where id = '52000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'a delivery order cannot be picked up');
select throws_ok($$update public.orders set status = 'delivered' where id = '52000000-0000-4000-8000-000000000002'$$,
  '23514', null, 'a pickup order cannot be delivered');
select throws_ok($$update public.orders set status = 'picked_up' where id = '52000000-0000-4000-8000-000000000003'$$,
  '23514', null, 'accepted -> picked_up is rejected');
select throws_ok($$update public.orders set status = 'picked_up' where id = '52000000-0000-4000-8000-000000000004'$$,
  '23514', null, 'paid -> picked_up is rejected');
select throws_ok($$update public.orders set status = 'ready' where id = '52000000-0000-4000-8000-000000000005'$$,
  '23514', null, 'picked_up is terminal');
select throws_ok($$update public.orders set service_mode = 'delivery' where id = '52000000-0000-4000-8000-000000000002'$$,
  '23514', null, 'an order''s service_mode cannot change');

select lives_ok($$update public.orders set status = 'picked_up' where id = '52000000-0000-4000-8000-000000000002'$$,
  'a ready pickup order can be picked up');
select isnt((select picked_up_at from public.orders where id = '52000000-0000-4000-8000-000000000002'), null,
  'picked_up stamps picked_up_at');
select lives_ok($$update public.orders set status = 'delivered' where id = '52000000-0000-4000-8000-000000000001'$$,
  'a ready delivery order can still be delivered');
select isnt((select delivered_at from public.orders where id = '52000000-0000-4000-8000-000000000001'), null,
  'delivered stamps delivered_at');

select * from finish();
rollback;
