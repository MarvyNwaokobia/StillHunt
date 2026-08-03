-- The shooter-era shop catalogue: on_chain_id 10-28.
--
-- These 19 items are LIVE IN PRODUCTION but no migration ever created them. They
-- were inserted by hand when the game pivoted from melee to the FPS, and never
-- captured in a file. Found by rebuilding the schema from migrations/ alone and
-- diffing the catalogue against prod: a fresh database came up with the ORIGINAL
-- melee items (Iron Sword, StillHunt Guard, on_chain_id 1-9) and none of the guns,
-- ammo, attachments or gear that players actually buy.
--
-- That mattered immediately rather than theoretically: add_avalanche_item_prices.sql
-- prices items by joining on `on_chain_id`, so against a fresh database it priced 7
-- of 26 and reported success. A silent partial, surfacing later as guns that cannot
-- be bought on Avalanche.
--
-- Rows are dumped verbatim from production, not retyped. ON CONFLICT DO NOTHING
-- keeps this a no-op against prod, which already has every one of them.
--
-- NOT DELETED HERE: the melee items (1-6, 9) that exist in init.sql but no longer
-- exist in prod. Removing seed data is a different kind of change from adding it,
-- and it should be a deliberate decision rather than a side effect of this fix.

-- The category CHECK also drifted. init.sql only allows the melee-era categories
-- (weapon, shield, booster, cosmetic); production was widened by hand to accept the
-- three the FPS shop introduced. Without this the INSERT below fails outright, which
-- is how the drift was found. Copied from prod's live constraint definition.
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_category_check;
ALTER TABLE items ADD CONSTRAINT items_category_check
  CHECK (category = ANY (ARRAY['weapon','shield','booster','cosmetic','ammo','attachment','gear']));

INSERT INTO items (
    id, on_chain_id, name, description, rarity, category,
    stat_boost, price_g, image_url, layer_type, layer_asset_url,
    total_supply, remaining_supply, weapon_stats
) VALUES
  ('22222222-2222-4222-8222-222222222222'::uuid, 10, 'Compact SMG', 'High fire rate, low per-shot damage — shreds at close range.', 'common', 'weapon', 55, 90.00000000, '', NULL, NULL, NULL, NULL, '{"range": 7, "damage": 9, "gun_id": "smg", "accuracy": 0.62, "critMult": 1.5, "fireRate": 600, "magazine": 30, "critChance": 0.05, "reloadTime": 2.0, "projectileSpeed": 26}'::jsonb),
  ('33333333-3333-4333-8333-333333333333'::uuid, 11, 'Assault Rifle', 'Balanced damage, rate and range — the reliable workhorse.', 'rare', 'weapon', 78, 250.00000000, '', NULL, NULL, NULL, NULL, '{"range": 10, "damage": 18, "gun_id": "assault_rifle", "accuracy": 0.72, "critMult": 1.6, "fireRate": 360, "magazine": 24, "critChance": 0.08, "reloadTime": 2.2, "projectileSpeed": 30}'::jsonb),
  ('44444444-4444-4444-8444-444444444444'::uuid, 12, 'Marksman Rifle', 'Slow, accurate and hard-hitting — reward for dodging in and punishing.', 'epic', 'weapon', 60, 500.00000000, '', NULL, NULL, NULL, NULL, '{"range": 14, "damage": 45, "gun_id": "marksman", "accuracy": 0.90, "critMult": 2.0, "fireRate": 90, "magazine": 8, "critChance": 0.15, "reloadTime": 2.4, "projectileSpeed": 40}'::jsonb),
  ('55555555-5555-4555-8555-555555555555'::uuid, 13, 'StillHunt Prototype', 'Top-tier hardware — high rate AND damage. The endgame gun.', 'legendary', 'weapon', 120, 1200.00000000, '', NULL, NULL, NULL, NULL, '{"range": 12, "damage": 30, "gun_id": "legendary", "accuracy": 0.80, "critMult": 1.8, "fireRate": 480, "magazine": 28, "critChance": 0.12, "reloadTime": 1.8, "projectileSpeed": 34}'::jsonb),
  ('aaaa0001-aaaa-4aaa-8aaa-aaaaaaaaa001'::uuid, 14, 'Hollow Point Rounds', 'Expanding rounds — +20% damage on impact, tears through soft targets.', 'common', 'ammo', 0, 40.00000000, '', NULL, NULL, NULL, NULL, '{"ammo_id": "hollow_point", "burnDps": 0, "damageMult": 1.20, "accuracyMod": 0, "fireRateMod": 0, "critChanceMod": 0}'::jsonb),
  ('aaaa0002-aaaa-4aaa-8aaa-aaaaaaaaa002'::uuid, 15, 'Armor Piercing Rounds', 'Tungsten-core penetrators — +10% damage and +5% crit chance, punches through armor.', 'rare', 'ammo', 0, 120.00000000, '', NULL, NULL, NULL, NULL, '{"ammo_id": "armor_piercing", "burnDps": 0, "damageMult": 1.10, "accuracyMod": 0, "fireRateMod": 0, "critChanceMod": 0.05}'::jsonb),
  ('aaaa0003-aaaa-4aaa-8aaa-aaaaaaaaa003'::uuid, 16, 'Tracer Rounds', 'Phosphor-tipped tracers — +8% accuracy and +30 RPM from visual tracking.', 'common', 'ammo', 0, 50.00000000, '', NULL, NULL, NULL, NULL, '{"ammo_id": "tracer", "burnDps": 0, "damageMult": 1.0, "accuracyMod": 0.08, "fireRateMod": 30, "critChanceMod": 0}'::jsonb),
  ('aaaa0004-aaaa-4aaa-8aaa-aaaaaaaaa004'::uuid, 17, 'Incendiary Rounds', 'Thermite-laced bullets — 3 HP/s burn damage after each hit for 2 seconds.', 'epic', 'ammo', 0, 250.00000000, '', NULL, NULL, NULL, NULL, '{"ammo_id": "incendiary", "burnDps": 3, "damageMult": 1.0, "accuracyMod": 0, "fireRateMod": 0, "critChanceMod": 0}'::jsonb),
  ('bbbb0001-bbbb-4bbb-8bbb-bbbbbbbbb001'::uuid, 18, 'Suppressor', 'Reduces muzzle flash — +6% accuracy, -1m range.', 'common', 'attachment', 0, 60.00000000, '', NULL, NULL, NULL, NULL, '{"slot": "barrel", "rangeMod": -1, "accuracyMod": 0.06, "fireRateMod": 0, "magazineMod": 0, "attachment_id": "suppressor", "reloadTimeMod": 0}'::jsonb),
  ('bbbb0002-bbbb-4bbb-8bbb-bbbbbbbbb002'::uuid, 19, 'Extended Barrel', 'Longer barrel — +2m range, -20 RPM from added weight.', 'rare', 'attachment', 0, 140.00000000, '', NULL, NULL, NULL, NULL, '{"slot": "barrel", "rangeMod": 2, "accuracyMod": 0, "fireRateMod": -20, "magazineMod": 0, "attachment_id": "extended_barrel", "reloadTimeMod": 0}'::jsonb),
  ('bbbb0003-bbbb-4bbb-8bbb-bbbbbbbbb003'::uuid, 20, 'Red Dot Sight', 'Fast target acquisition — +5% accuracy.', 'common', 'attachment', 0, 50.00000000, '', NULL, NULL, NULL, NULL, '{"slot": "optic", "rangeMod": 0, "accuracyMod": 0.05, "fireRateMod": 0, "magazineMod": 0, "attachment_id": "red_dot", "reloadTimeMod": 0}'::jsonb),
  ('bbbb0004-bbbb-4bbb-8bbb-bbbbbbbbb004'::uuid, 21, 'ACOG Scope', 'Magnified optic — +8% accuracy, +1m range.', 'rare', 'attachment', 0, 160.00000000, '', NULL, NULL, NULL, NULL, '{"slot": "optic", "rangeMod": 1, "accuracyMod": 0.08, "fireRateMod": 0, "magazineMod": 0, "attachment_id": "acog_scope", "reloadTimeMod": 0}'::jsonb),
  ('bbbb0005-bbbb-4bbb-8bbb-bbbbbbbbb005'::uuid, 22, 'Foregrip', 'Vertical grip — +4% accuracy from recoil control.', 'common', 'attachment', 0, 45.00000000, '', NULL, NULL, NULL, NULL, '{"slot": "grip", "rangeMod": 0, "accuracyMod": 0.04, "fireRateMod": 0, "magazineMod": 0, "attachment_id": "foregrip", "reloadTimeMod": 0}'::jsonb),
  ('bbbb0006-bbbb-4bbb-8bbb-bbbbbbbbb006'::uuid, 23, 'Quick Grip', 'Lightweight angled grip — +40 RPM from faster handling.', 'rare', 'attachment', 0, 130.00000000, '', NULL, NULL, NULL, NULL, '{"slot": "grip", "rangeMod": 0, "accuracyMod": 0, "fireRateMod": 40, "magazineMod": 0, "attachment_id": "quick_grip", "reloadTimeMod": 0}'::jsonb),
  ('bbbb0007-bbbb-4bbb-8bbb-bbbbbbbbb007'::uuid, 24, 'Extended Magazine', 'Larger mag — +10 rounds, +0.4s reload from extra weight.', 'common', 'attachment', 0, 50.00000000, '', NULL, NULL, NULL, NULL, '{"slot": "magazine", "rangeMod": 0, "accuracyMod": 0, "fireRateMod": 0, "magazineMod": 10, "attachment_id": "extended_mag", "reloadTimeMod": 0.4}'::jsonb),
  ('bbbb0008-bbbb-4bbb-8bbb-bbbbbbbbb008'::uuid, 25, 'Speed Loader', 'Quick-release mechanism — -0.5s reload time.', 'rare', 'attachment', 0, 150.00000000, '', NULL, NULL, NULL, NULL, '{"slot": "magazine", "rangeMod": 0, "accuracyMod": 0, "fireRateMod": 0, "magazineMod": 0, "attachment_id": "speed_loader", "reloadTimeMod": -0.5}'::jsonb),
  ('cccc0001-cccc-4ccc-8ccc-cccccccccc01'::uuid, 26, 'Tactical Flashlight', 'A barrel-mounted flashlight — throws a forward light cone so you can push dark rooms without night vision.', 'common', 'gear', 0, 45.00000000, '', NULL, NULL, NULL, NULL, '{"kit_id": "light"}'::jsonb),
  ('cccc0002-cccc-4ccc-8ccc-cccccccccc02'::uuid, 27, 'Night Vision Goggles', 'Head-mounted NVG — lifts the dark on night operations so the whole field reads in green.', 'rare', 'gear', 0, 180.00000000, '', NULL, NULL, NULL, NULL, '{"kit_id": "nvg"}'::jsonb),
  ('cccc0003-cccc-4ccc-8ccc-cccccccccc03'::uuid, 28, 'Laser Sight', 'An under-barrel laser — tightens hip-fire so snap shots land without aiming down sights.', 'common', 'gear', 0, 70.00000000, '', NULL, NULL, NULL, NULL, '{"kit_id": "laser"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
