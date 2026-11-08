-- Brand profile for testers' own venues (M6): saves need the recovery code, checked in the
-- database. Needs supabase/demo/004_staff_branding.sql. Everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(11);

delete from demo.venues;
delete from demo.rate_limits;

create temp table v on commit drop as
select * from demo.create_venue('ip-brand', 50,
  '{"slug":"brand-venue","name":"Brand","industry":"other","venue_type":"Mini golf","country":"CA","region":"BC","currency":"CAD"}'::jsonb,
  '[{"id":"t1","label":"Hole 1","service_mode":"delivery","spot_number":1,"active":true}]'::jsonb,
  '[]'::jsonb, false, 'right-hash');

select is((select venue_type from v), 'Mini golf', 'an Other venue keeps its venue type');
select throws_ok($$ select demo.save_branding((select id from v), null, '{"color":"#1d4ed8"}') $$,
  'P0001', 'bad_key', 'a save without the recovery code is refused');
select throws_ok($$ select demo.save_branding((select id from v), 'wrong-hash', '{"color":"#1d4ed8"}') $$,
  'P0001', 'bad_key', 'a save with a wrong recovery code is refused');
select is((select branding from demo.venues where id = (select id from v)), null, 'a refused save changes nothing');
select throws_ok($$ select demo.save_branding((select id from v), 'right-hash', '{"color":"red"}') $$,
  'P0001', 'bad_branding', 'a colour must be a hex colour');
select throws_ok($$ select demo.save_branding((select id from v), 'right-hash', '{"logoUrl":42}') $$,
  'P0001', 'bad_branding', 'image URLs must be text');
select is(demo.save_branding((select id from v), 'right-hash', '{"color":"#1d4ed8","logoUrl":null,"coverUrl":null,"extra":1}'),
  '{"color":"#1d4ed8","logoUrl":null,"coverUrl":null}'::jsonb, 'the right code saves, keeping only known keys');
select is((select branding ->> 'color' from demo.venues where id = (select id from v)), '#1d4ed8', 'the colour is stored');
select ok(not has_function_privilege('anon', 'demo.save_branding(uuid, text, jsonb)', 'execute'), 'anon cannot call save_branding');

select is((select public from storage.buckets where id = 'demo-branding'), true, 'the branding bucket is public to read');
select is((select array[file_size_limit::text] || allowed_mime_types from storage.buckets where id = 'demo-branding'),
  array['512000', 'image/jpeg'], 'the branding bucket takes JPEGs up to 500 KB');

select * from finish();
rollback;
