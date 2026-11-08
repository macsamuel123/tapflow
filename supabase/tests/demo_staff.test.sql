-- Staff and PIN login for testers' own venues (M6). Needs supabase/demo/004_staff_branding.sql,
-- which `make seed` loads. Everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

delete from demo.venues;
delete from demo.rate_limits;

create temp table k (name text primary key, venue uuid, key_hash text) on commit drop;
insert into k
select n, (demo.create_venue('ip-staff', 50,
  jsonb_build_object('slug', n, 'name', n, 'industry', 'breweries', 'country', 'CA', 'region', 'BC', 'currency', 'CAD'),
  '[{"id":"t1","label":"Table 1","service_mode":"delivery","spot_number":1,"active":true}]'::jsonb,
  '[{"id":"c1","name":"Drinks","items":[{"id":"i1","name":"Lager","inStock":true},{"id":"i2","name":"Ale","inStock":true}]}]'::jsonb,
  false, 'hash-' || n)).id, 'hash-' || n
from unnest(array['venue-a', 'venue-b']) n;

create function pg_temp.pin(p text) returns text language sql as $$ select encode(sha256(p::bytea), 'hex') $$;
create function pg_temp.venue(n text) returns uuid language sql as $$ select venue from k where name = n $$;
create function pg_temp.key(n text) returns text language sql as $$ select key_hash from k where name = n $$;
create function pg_temp.login(n text, p text) returns text language sql as $$
  select result from demo.staff_login(pg_temp.venue(n), pg_temp.pin(p)) $$;
grant execute on function pg_temp.venue(text), pg_temp.key(text), pg_temp.pin(text) to anon, authenticated;
grant select on k to anon, authenticated;

-- ------------------------------------------------------------------ lockdown
select ok(not has_table_privilege('anon', 'demo.staff', 'select'), 'anon cannot read staff');
select ok(not has_table_privilege('authenticated', 'demo.staff', 'select'), 'authenticated cannot read staff');
select ok(not has_table_privilege('anon', 'demo.staff_pin_locks', 'select'), 'anon cannot read PIN locks');
select ok(not has_table_privilege('anon', 'demo.staff', 'insert'), 'anon cannot add staff');
select ok(not has_function_privilege('anon', 'demo.staff_login(uuid, text)', 'execute'), 'anon cannot call staff_login');
select ok(not has_function_privilege('anon', 'demo.save_staff(uuid, text, jsonb)', 'execute'), 'anon cannot call save_staff');
select ok((select relrowsecurity from pg_class where oid = 'demo.staff'::regclass), 'RLS is on for staff');
select is((select count(*)::int from pg_policies where schemaname = 'demo' and tablename in ('staff', 'staff_pin_locks')), 0, 'no policies: no client access at all');
select is(
  (select array_agg(column_name::text order by column_name::text) from information_schema.columns
   where table_schema = 'demo' and table_name = 'staff' and column_name ilike '%pin%'),
  array['pin_hash', 'pin_version'], 'only a PIN hash is stored, never a raw PIN');

-- ------------------------------------------------------------------ the recovery code
select throws_ok($$ select demo.save_staff(pg_temp.venue('venue-a'), 'wrong', '{"op":"add","name":"Mina","role":"fulfillment"}') $$,
  'P0001', 'bad_key', 'a wrong code cannot add staff');
select throws_ok($$ select demo.save_staff(pg_temp.venue('venue-a'), null, '{"op":"add","name":"Mina","role":"fulfillment"}') $$,
  'P0001', 'bad_key', 'a missing code cannot add staff');
select throws_ok($$ select demo.save_staff(pg_temp.venue('venue-a'), pg_temp.key('venue-b'), '{"op":"add","name":"Mina","role":"fulfillment"}') $$,
  'P0001', 'bad_key', 'another venue''s code cannot add staff');
select throws_ok($$ select demo.save_role_labels(pg_temp.venue('venue-a'), 'wrong', '{"fulfillment":"Chef"}') $$,
  'P0001', 'bad_key', 'a wrong code cannot rename roles');

-- ------------------------------------------------------------------ uniqueness
create temp table cook on commit drop as
  select * from demo.save_staff(pg_temp.venue('venue-a'), pg_temp.key('venue-a'),
    jsonb_build_object('op', 'add', 'name', 'Mina', 'role', 'fulfillment', 'pin_hash', pg_temp.pin('1234')));
select throws_ok(format($$ select demo.save_staff(%L, %L, %L) $$, pg_temp.venue('venue-a'), pg_temp.key('venue-a'),
    jsonb_build_object('op', 'add', 'name', 'Ava', 'role', 'server', 'pin_hash', pg_temp.pin('1234'))),
  'P0001', 'pin_taken', 'a PIN is unique among a venue''s active staff');
select lives_ok(format($$ select demo.save_staff(%L, %L, %L) $$, pg_temp.venue('venue-b'), pg_temp.key('venue-b'),
    jsonb_build_object('op', 'add', 'name', 'Ava', 'role', 'server', 'pin_hash', pg_temp.pin('1234'))),
  'another venue can use the same PIN');

-- ------------------------------------------------------------------ the lock
select is(pg_temp.login('venue-a', '1234'), 'ok', 'the right PIN signs in');
select is((select tries_left from demo.staff_login(pg_temp.venue('venue-a'), pg_temp.pin('0000'))), 4, 'a wrong PIN counts down');
select pg_temp.login('venue-a', '0000') from generate_series(1, 3);
select is(pg_temp.login('venue-a', '0000'), 'locked', 'the fifth wrong PIN locks');
select is(pg_temp.login('venue-a', '1234'), 'locked', 'while locked, even the right PIN is refused');
select is(pg_temp.login('venue-b', '1234'), 'ok', 'the lock is per venue');
update demo.staff_pin_locks set locked_until = now() - interval '1 second' where venue_id = pg_temp.venue('venue-a');
select is(pg_temp.login('venue-a', '1234'), 'ok', 'once the minute is up, the right PIN works');

-- ------------------------------------------------------------------ resets take effect at once
select is((select pin_version from demo.save_staff(pg_temp.venue('venue-a'), pg_temp.key('venue-a'),
    jsonb_build_object('op', 'reset_pin', 'id', (select id from cook), 'pin_hash', pg_temp.pin('9876')))), 2,
  'a PIN reset bumps the version, ending old sessions');
select is(pg_temp.login('venue-a', '1234'), 'wrong_pin', 'the old PIN stops working');
select perform_deactivate from (select demo.save_staff(pg_temp.venue('venue-a'), pg_temp.key('venue-a'),
    jsonb_build_object('op', 'deactivate', 'id', (select id from cook))) is not null as perform_deactivate) x;
select is(pg_temp.login('venue-a', '9876'), 'wrong_pin', 'a deactivated person cannot sign in');

select * from finish();
rollback;
