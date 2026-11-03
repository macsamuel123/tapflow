-- Local development seed. Applied by `supabase db reset` (make seed). NEVER run against production:
-- it contains fixed, publicly-known QR secrets and demo users.
--
-- Demo Bistro — Vancouver, CAD, GST 5% (500 bps), platform fee 3% (300 bps).
-- Fixed UUIDs keep `make qr-urls` and tests deterministic.

-- ---------------------------------------------------------------- staff users (magic link via Inbucket :54324)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'owner@demo.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'kitchen@demo.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values
  (gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   '{"sub":"a0000000-0000-4000-8000-000000000001","email":"owner@demo.test","email_verified":true}', 'email', now(), now(), now()),
  (gen_random_uuid(), 'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002',
   '{"sub":"a0000000-0000-4000-8000-000000000002","email":"kitchen@demo.test","email_verified":true}', 'email', now(), now(), now());

-- ---------------------------------------------------------------- restaurant
insert into public.restaurants (id, slug, name, currency, timezone, tax_rate_bps, platform_fee_bps)
values ('b0000000-0000-4000-8000-000000000001', 'demo-bistro', 'Demo Bistro', 'CAD', 'America/Vancouver', 500, 300);

insert into public.staff_members (user_id, restaurant_id, role) values
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'owner'),
  ('a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'kitchen');

-- ---------------------------------------------------------------- tables (dev-only fixed secrets)
insert into public.tables (id, restaurant_id, label, qr_secret) values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Table 1', 'dev-only-qr-secret-table-01'),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'Table 2', 'dev-only-qr-secret-table-02'),
  ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'Table 3', 'dev-only-qr-secret-table-03'),
  ('c0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'Table 4', 'dev-only-qr-secret-table-04'),
  ('c0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001', 'Table 5', 'dev-only-qr-secret-table-05');

-- ---------------------------------------------------------------- categories
insert into public.menu_categories (id, restaurant_id, name, sort_order) values
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Starters', 1),
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'Mains',    2),
  ('d0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'Desserts', 3),
  ('d0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'Drinks',   4);

-- ---------------------------------------------------------------- items
-- id suffix: 01xx starters, 02xx mains, 03xx desserts, 04xx drinks
insert into public.menu_items
  (id, restaurant_id, category_id, name, description, price_cents, ingredients, allergens, dietary_tags, in_stock, sort_order)
values
  -- Starters
  ('e0000000-0000-4000-8000-000000000101', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'Truffle Fries', 'Hand-cut Kennebec fries, truffle oil, parmesan, parsley.', 1100,
   '{potato,sunflower oil,truffle oil,parmesan,parsley,sea salt}', '{milk}', '{vegetarian}', true, 1),
  ('e0000000-0000-4000-8000-000000000102', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'Crispy Calamari', 'Lightly floured squid, lemon, garlic aioli.', 1600,
   '{squid,wheat flour,egg,lemon,garlic,canola oil}', '{shellfish,gluten,egg}', '{}', true, 2),
  ('e0000000-0000-4000-8000-000000000103', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'Tomato Bruschetta', 'Grilled sourdough, heirloom tomato, basil, balsamic.', 1200,
   '{sourdough bread,tomato,basil,garlic,olive oil,balsamic vinegar}', '{gluten,sulphites}', '{vegan}', true, 3),
  ('e0000000-0000-4000-8000-000000000104', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'Spot Prawn Tempura', 'BC spot prawns in tempura batter, soy-ginger dip.', 1900,
   '{spot prawns,wheat flour,egg,soy sauce,ginger,canola oil}', '{crustacean,gluten,egg,soy}', '{}', true, 4),
  ('e0000000-0000-4000-8000-000000000105', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'Roasted Beet Salad', 'Roasted beets, arugula, goat cheese, candied walnuts, honey-mustard vinaigrette.', 1500,
   '{beets,arugula,goat cheese,walnuts,honey,dijon mustard,olive oil}', '{milk,tree_nut,mustard}', '{vegetarian,gluten-free}', true, 5),

  -- Mains
  ('e0000000-0000-4000-8000-000000000201', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002',
   'Bistro Burger', '6oz beef patty, sesame brioche, aged cheddar, lettuce, tomato, pickles, dijon aioli.', 2200,
   '{beef,brioche bun,sesame seeds,cheddar,lettuce,tomato,pickles,dijon mustard,egg yolk}',
   '{gluten,milk,egg,sesame,mustard}', '{}', true, 1),
  ('e0000000-0000-4000-8000-000000000202', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002',
   'Wild Sockeye Salmon', 'Pan-seared sockeye, lemon butter, asparagus, fingerling potatoes.', 3200,
   '{sockeye salmon,butter,lemon,asparagus,fingerling potatoes}', '{fish,milk}', '{gluten-free}', true, 2),
  ('e0000000-0000-4000-8000-000000000203', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002',
   'Wild Mushroom Risotto', 'Arborio rice, local mushrooms, parmesan, white wine, thyme.', 2400,
   '{arborio rice,mushrooms,parmesan,white wine,butter,thyme,shallot}', '{milk,sulphites}', '{vegetarian,gluten-free}', true, 3),
  ('e0000000-0000-4000-8000-000000000204', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002',
   'Steak Frites', 'AAA striploin, fries, green peppercorn sauce.', 3600,
   '{beef striploin,potato,cream,green peppercorns,brandy,dijon mustard}', '{milk,mustard,sulphites}', '{gluten-free}', true, 4),
  ('e0000000-0000-4000-8000-000000000205', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002',
   'Chickpea Coconut Curry', 'Chickpeas, coconut milk, tomato, spinach, basmati rice, toasted cashews.', 2000,
   '{chickpeas,coconut milk,tomato,spinach,basmati rice,cashews,garam masala}', '{tree_nut}', '{vegan,gluten-free}', true, 5),
  ('e0000000-0000-4000-8000-000000000206', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002',
   'Fish & Chips', 'Beer-battered lingcod, fries, tartar sauce, lemon.', 2300,
   '{lingcod,wheat flour,beer,potato,mayonnaise,pickles,lemon}', '{fish,gluten,egg}', '{}', true, 6),
  ('e0000000-0000-4000-8000-000000000207', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002',
   'Pad Thai', 'Rice noodles, egg, bean sprouts, tamarind, crushed peanuts, lime.', 2100,
   '{rice noodles,egg,bean sprouts,tamarind,fish sauce,peanuts,soy sauce,lime}', '{peanut,egg,fish,soy}', '{}', true, 7),

  -- Desserts
  ('e0000000-0000-4000-8000-000000000301', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003',
   'Chocolate Lava Cake', 'Warm dark chocolate cake, molten centre, vanilla cream.', 1200,
   '{dark chocolate,butter,egg,wheat flour,sugar,cream,soy lecithin}', '{gluten,milk,egg,soy}', '{vegetarian}', true, 1),
  ('e0000000-0000-4000-8000-000000000302', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003',
   'Crème Brûlée', 'Vanilla bean custard, caramelized sugar.', 1100,
   '{cream,egg yolk,vanilla bean,sugar}', '{milk,egg}', '{vegetarian,gluten-free}', true, 2),
  ('e0000000-0000-4000-8000-000000000303', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003',
   'Seasonal Fruit Sorbet', 'Two scoops of house sorbet. Ask your server for today''s flavours.', 900,
   '{seasonal fruit,sugar,water,lemon}', '{}', '{vegan,gluten-free}', true, 3),
  ('e0000000-0000-4000-8000-000000000304', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003',
   'Nanaimo Bar', 'The BC classic: graham-coconut-walnut base, custard, chocolate.', 800,
   '{graham crumbs,coconut,walnuts,custard powder,butter,chocolate,sugar}', '{gluten,milk,tree_nut,soy}', '{vegetarian}',
   false, 4),  -- seeded as 86'd to demo out-of-stock

  -- Drinks
  ('e0000000-0000-4000-8000-000000000401', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004',
   'Latte', 'Double espresso, steamed milk.', 550,
   '{espresso,milk}', '{milk}', '{vegetarian}', true, 1),
  ('e0000000-0000-4000-8000-000000000402', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004',
   'Americano', 'Double espresso, hot water.', 400,
   '{espresso,water}', '{}', '{vegan}', true, 2),
  ('e0000000-0000-4000-8000-000000000403', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004',
   'Fresh Lemonade', 'Squeezed to order, mint.', 500,
   '{lemon,sugar,water,mint}', '{}', '{vegan,gluten-free}', true, 3),
  ('e0000000-0000-4000-8000-000000000404', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004',
   'Iced Tea', 'House-brewed black tea, lemon.', 450,
   '{black tea,sugar,lemon,water}', '{}', '{vegan,gluten-free}', true, 4),
  ('e0000000-0000-4000-8000-000000000405', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004',
   'Sparkling Water', '500 ml bottle.', 350,
   '{carbonated water}', '{}', '{vegan,gluten-free}', true, 5);

-- ---------------------------------------------------------------- modifier groups
insert into public.modifier_groups (id, restaurant_id, item_id, name, min_select, max_select, required, sort_order) values
  -- Truffle Fries: size (required)
  ('f0000000-0000-4000-8000-000000000101', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000101', 'Size',          1, 1, true,  1),
  -- Beet Salad: add protein (optional, pick up to 1)
  ('f0000000-0000-4000-8000-000000000105', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000105', 'Add protein',   0, 1, false, 1),
  -- Burger: doneness (required) + add-ons (optional, up to 3)
  ('f0000000-0000-4000-8000-000000000201', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000201', 'Doneness',      1, 1, true,  1),
  ('f0000000-0000-4000-8000-000000000202', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000201', 'Add-ons',       0, 3, false, 2),
  -- Steak Frites: doneness (required)
  ('f0000000-0000-4000-8000-000000000204', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000204', 'Doneness',      1, 1, true,  1),
  -- Curry: spice level (required)
  ('f0000000-0000-4000-8000-000000000205', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000205', 'Spice level',   1, 1, true,  1),
  -- Pad Thai: protein (required)
  ('f0000000-0000-4000-8000-000000000207', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000207', 'Protein',       1, 1, true,  1),
  -- Latte: milk (required) + extra shot (optional)
  ('f0000000-0000-4000-8000-000000000401', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000401', 'Milk',          1, 1, true,  1),
  ('f0000000-0000-4000-8000-000000000402', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000401', 'Extras',        0, 1, false, 2);

-- ---------------------------------------------------------------- modifiers
insert into public.modifiers (restaurant_id, group_id, name, price_delta_cents, in_stock, sort_order) values
  -- Fries size
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000101', 'Regular',            0, true, 1),
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000101', 'Large',            400, true, 2),
  -- Salad protein
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000105', 'Grilled chicken',  600, true, 1),
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000105', 'Seared salmon',    900, true, 2),
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000105', 'Crispy tofu',      400, true, 3),
  -- Burger doneness
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000201', 'Medium rare',        0, true, 1),
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000201', 'Medium',             0, true, 2),
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000201', 'Well done',          0, true, 3),
  -- Burger add-ons
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000202', 'Bacon',            300, true, 1),
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000202', 'Avocado',          250, true, 2),
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000202', 'Fried egg',        200, true, 3),
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000202', 'Extra cheddar',    200, true, 4),
  -- Steak doneness
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000204', 'Rare',               0, true, 1),
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000204', 'Medium rare',        0, true, 2),
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000204', 'Medium',             0, true, 3),
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000204', 'Well done',          0, true, 4),
  -- Curry spice
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000205', 'Mild',               0, true, 1),
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000205', 'Medium',             0, true, 2),
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000205', 'Hot',                0, true, 3),
  -- Pad Thai protein
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000207', 'Tofu',               0, true, 1),
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000207', 'Chicken',          300, true, 2),
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000207', 'Prawns',           500, true, 3),
  -- Latte milk
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000401', 'Whole milk',         0, true, 1),
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000401', 'Oat milk',          75, true, 2),
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000401', 'Almond milk',       75, true, 3),
  -- Latte extras
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000402', 'Extra shot',       100, true, 1);
