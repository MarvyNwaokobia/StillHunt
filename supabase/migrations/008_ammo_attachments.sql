-- ============================================================
-- 008 · Ammo types + Attachments for the marketplace
-- ============================================================
-- Expands the item category CHECK to include 'ammo' and 'attachment',
-- then seeds the full ammo + attachment catalog. Each has a `weapon_stats`
-- JSON that the frontend reads for display; the engine Loadout.ts holds
-- the authoritative typed stats (keep in sync).

-- 1. Widen the category constraint to allow ammo + attachment
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_category_check;
ALTER TABLE items ADD CONSTRAINT items_category_check
  CHECK (category IN ('weapon', 'shield', 'booster', 'cosmetic', 'ammo', 'attachment'));

-- 2. Seed ammo types (no on_chain_id — off-chain for now)
INSERT INTO items (id, name, description, rarity, category, stat_boost, price_g, image_url, weapon_stats)
VALUES
  ('aaaa0001-aaaa-4aaa-8aaa-aaaaaaaaa001', 'Hollow Point Rounds',
   'Expanding rounds — +20% damage on impact, tears through soft targets.',
   'common', 'ammo', 0, 240, '',
   '{"ammo_id":"hollow_point","damageMult":1.20,"accuracyMod":0,"fireRateMod":0,"critChanceMod":0,"burnDps":0}'),

  ('aaaa0002-aaaa-4aaa-8aaa-aaaaaaaaa002', 'Armor Piercing Rounds',
   'Tungsten-core penetrators — +10% damage and +5% crit chance, punches through armor.',
   'rare', 'ammo', 0, 600, '',
   '{"ammo_id":"armor_piercing","damageMult":1.10,"accuracyMod":0,"fireRateMod":0,"critChanceMod":0.05,"burnDps":0}'),

  ('aaaa0003-aaaa-4aaa-8aaa-aaaaaaaaa003', 'Tracer Rounds',
   'Phosphor-tipped tracers — +8% accuracy and +30 RPM from visual tracking.',
   'common', 'ammo', 0, 300, '',
   '{"ammo_id":"tracer","damageMult":1.0,"accuracyMod":0.08,"fireRateMod":30,"critChanceMod":0,"burnDps":0}'),

  ('aaaa0004-aaaa-4aaa-8aaa-aaaaaaaaa004', 'Incendiary Rounds',
   'Thermite-laced bullets — 3 HP/s burn damage after each hit for 2 seconds.',
   'epic', 'ammo', 0, 1500, '',
   '{"ammo_id":"incendiary","damageMult":1.0,"accuracyMod":0,"fireRateMod":0,"critChanceMod":0,"burnDps":3}')
ON CONFLICT (id) DO NOTHING;

-- 3. Seed attachments (no on_chain_id — off-chain for now)
-- Barrel slot
INSERT INTO items (id, name, description, rarity, category, stat_boost, price_g, image_url, weapon_stats)
VALUES
  ('bbbb0001-bbbb-4bbb-8bbb-bbbbbbbbb001', 'Suppressor',
   'Reduces muzzle flash — +6% accuracy, -1m range.',
   'common', 'attachment', 0, 360, '',
   '{"attachment_id":"suppressor","slot":"barrel","accuracyMod":0.06,"fireRateMod":0,"rangeMod":-1,"magazineMod":0,"reloadTimeMod":0}'),

  ('bbbb0002-bbbb-4bbb-8bbb-bbbbbbbbb002', 'Extended Barrel',
   'Longer barrel — +2m range, -20 RPM from added weight.',
   'rare', 'attachment', 0, 750, '',
   '{"attachment_id":"extended_barrel","slot":"barrel","accuracyMod":0,"fireRateMod":-20,"rangeMod":2,"magazineMod":0,"reloadTimeMod":0}')
ON CONFLICT (id) DO NOTHING;

-- Optic slot
INSERT INTO items (id, name, description, rarity, category, stat_boost, price_g, image_url, weapon_stats)
VALUES
  ('bbbb0003-bbbb-4bbb-8bbb-bbbbbbbbb003', 'Red Dot Sight',
   'Fast target acquisition — +5% accuracy.',
   'common', 'attachment', 0, 300, '',
   '{"attachment_id":"red_dot","slot":"optic","accuracyMod":0.05,"fireRateMod":0,"rangeMod":0,"magazineMod":0,"reloadTimeMod":0}'),

  ('bbbb0004-bbbb-4bbb-8bbb-bbbbbbbbb004', 'ACOG Scope',
   'Magnified optic — +8% accuracy, +1m range.',
   'rare', 'attachment', 0, 900, '',
   '{"attachment_id":"acog_scope","slot":"optic","accuracyMod":0.08,"fireRateMod":0,"rangeMod":1,"magazineMod":0,"reloadTimeMod":0}')
ON CONFLICT (id) DO NOTHING;

-- Grip slot
INSERT INTO items (id, name, description, rarity, category, stat_boost, price_g, image_url, weapon_stats)
VALUES
  ('bbbb0005-bbbb-4bbb-8bbb-bbbbbbbbb005', 'Foregrip',
   'Vertical grip — +4% accuracy from recoil control.',
   'common', 'attachment', 0, 270, '',
   '{"attachment_id":"foregrip","slot":"grip","accuracyMod":0.04,"fireRateMod":0,"rangeMod":0,"magazineMod":0,"reloadTimeMod":0}'),

  ('bbbb0006-bbbb-4bbb-8bbb-bbbbbbbbb006', 'Quick Grip',
   'Lightweight angled grip — +40 RPM from faster handling.',
   'rare', 'attachment', 0, 660, '',
   '{"attachment_id":"quick_grip","slot":"grip","accuracyMod":0,"fireRateMod":40,"rangeMod":0,"magazineMod":0,"reloadTimeMod":0}')
ON CONFLICT (id) DO NOTHING;

-- Magazine slot
INSERT INTO items (id, name, description, rarity, category, stat_boost, price_g, image_url, weapon_stats)
VALUES
  ('bbbb0007-bbbb-4bbb-8bbb-bbbbbbbbb007', 'Extended Magazine',
   'Larger mag — +10 rounds, +0.4s reload from extra weight.',
   'common', 'attachment', 0, 300, '',
   '{"attachment_id":"extended_mag","slot":"magazine","accuracyMod":0,"fireRateMod":0,"rangeMod":0,"magazineMod":10,"reloadTimeMod":0.4}'),

  ('bbbb0008-bbbb-4bbb-8bbb-bbbbbbbbb008', 'Speed Loader',
   'Quick-release mechanism — -0.5s reload time.',
   'rare', 'attachment', 0, 840, '',
   '{"attachment_id":"speed_loader","slot":"magazine","accuracyMod":0,"fireRateMod":0,"rangeMod":0,"magazineMod":0,"reloadTimeMod":-0.5}')
ON CONFLICT (id) DO NOTHING;
