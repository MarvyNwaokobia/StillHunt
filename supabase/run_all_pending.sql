-- ============================================================
-- COMBINED MIGRATION: Run this in Railway's Postgres Query tab
-- Covers: 004 (guns), 007 (remove melee), 008 (ammo + attachments)
-- Safe to re-run (uses IF NOT EXISTS / ON CONFLICT DO NOTHING)
-- ============================================================

-- ── 004: Add weapon_stats column + seed gun items ──────────────
ALTER TABLE items ADD COLUMN IF NOT EXISTS weapon_stats JSONB;

INSERT INTO items (id, name, description, rarity, category, stat_boost, price_g, image_url, weapon_stats)
VALUES
  ('22222222-2222-4222-8222-222222222222', 'Compact SMG',
   'High fire rate, low per-shot damage — shreds at close range.',
   'common', 'weapon', 55, 150, '',
   '{"gun_id":"smg","damage":9,"fireRate":600,"accuracy":0.62,"projectileSpeed":26,"range":7,"critChance":0.05,"critMult":1.5,"magazine":30,"reloadTime":2.0}'),

  ('33333333-3333-4333-8333-333333333333', 'Assault Rifle',
   'Balanced damage, rate and range — the reliable workhorse.',
   'rare', 'weapon', 78, 400, '',
   '{"gun_id":"assault_rifle","damage":18,"fireRate":360,"accuracy":0.72,"projectileSpeed":30,"range":10,"critChance":0.08,"critMult":1.6,"magazine":24,"reloadTime":2.2}'),

  ('44444444-4444-4444-8444-444444444444', 'Marksman Rifle',
   'Slow, accurate and hard-hitting — reward for dodging in and punishing.',
   'epic', 'weapon', 60, 900, '',
   '{"gun_id":"marksman","damage":45,"fireRate":90,"accuracy":0.90,"projectileSpeed":40,"range":14,"critChance":0.15,"critMult":2.0,"magazine":8,"reloadTime":2.4}'),

  ('55555555-5555-4555-8555-555555555555', 'StillHunt Prototype',
   'Top-tier hardware — high rate AND damage. The endgame gun.',
   'legendary', 'weapon', 120, 2000, '',
   '{"gun_id":"legendary","damage":30,"fireRate":480,"accuracy":0.80,"projectileSpeed":34,"range":12,"critChance":0.12,"critMult":1.8,"magazine":28,"reloadTime":1.8}')
ON CONFLICT (id) DO NOTHING;

-- ── 007: Remove legacy melee items ─────────────────────────────
DELETE FROM items WHERE on_chain_id IN (1, 2, 3, 4, 5, 6, 9);

-- ── 008: Expand categories + seed ammo & attachments ───────────
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_category_check;
ALTER TABLE items ADD CONSTRAINT items_category_check
  CHECK (category IN ('weapon', 'shield', 'booster', 'cosmetic', 'ammo', 'attachment'));

-- Ammo types
INSERT INTO items (id, name, description, rarity, category, stat_boost, price_g, image_url, weapon_stats)
VALUES
  ('aaaa0001-aaaa-4aaa-8aaa-aaaaaaaaa001', 'Hollow Point Rounds',
   'Expanding rounds — +20% damage on impact, tears through soft targets.',
   'common', 'ammo', 0, 80, '',
   '{"ammo_id":"hollow_point","damageMult":1.20,"accuracyMod":0,"fireRateMod":0,"critChanceMod":0,"burnDps":0}'),

  ('aaaa0002-aaaa-4aaa-8aaa-aaaaaaaaa002', 'Armor Piercing Rounds',
   'Tungsten-core penetrators — +10% damage and +5% crit chance, punches through armor.',
   'rare', 'ammo', 0, 200, '',
   '{"ammo_id":"armor_piercing","damageMult":1.10,"accuracyMod":0,"fireRateMod":0,"critChanceMod":0.05,"burnDps":0}'),

  ('aaaa0003-aaaa-4aaa-8aaa-aaaaaaaaa003', 'Tracer Rounds',
   'Phosphor-tipped tracers — +8% accuracy and +30 RPM from visual tracking.',
   'common', 'ammo', 0, 100, '',
   '{"ammo_id":"tracer","damageMult":1.0,"accuracyMod":0.08,"fireRateMod":30,"critChanceMod":0,"burnDps":0}'),

  ('aaaa0004-aaaa-4aaa-8aaa-aaaaaaaaa004', 'Incendiary Rounds',
   'Thermite-laced bullets — 3 HP/s burn damage after each hit for 2 seconds.',
   'epic', 'ammo', 0, 500, '',
   '{"ammo_id":"incendiary","damageMult":1.0,"accuracyMod":0,"fireRateMod":0,"critChanceMod":0,"burnDps":3}')
ON CONFLICT (id) DO NOTHING;

-- Attachments — Barrel
INSERT INTO items (id, name, description, rarity, category, stat_boost, price_g, image_url, weapon_stats)
VALUES
  ('bbbb0001-bbbb-4bbb-8bbb-bbbbbbbbb001', 'Suppressor',
   'Reduces muzzle flash — +6% accuracy, -1m range.',
   'common', 'attachment', 0, 120, '',
   '{"attachment_id":"suppressor","slot":"barrel","accuracyMod":0.06,"fireRateMod":0,"rangeMod":-1,"magazineMod":0,"reloadTimeMod":0}'),

  ('bbbb0002-bbbb-4bbb-8bbb-bbbbbbbbb002', 'Extended Barrel',
   'Longer barrel — +2m range, -20 RPM from added weight.',
   'rare', 'attachment', 0, 250, '',
   '{"attachment_id":"extended_barrel","slot":"barrel","accuracyMod":0,"fireRateMod":-20,"rangeMod":2,"magazineMod":0,"reloadTimeMod":0}')
ON CONFLICT (id) DO NOTHING;

-- Attachments — Optic
INSERT INTO items (id, name, description, rarity, category, stat_boost, price_g, image_url, weapon_stats)
VALUES
  ('bbbb0003-bbbb-4bbb-8bbb-bbbbbbbbb003', 'Red Dot Sight',
   'Fast target acquisition — +5% accuracy.',
   'common', 'attachment', 0, 100, '',
   '{"attachment_id":"red_dot","slot":"optic","accuracyMod":0.05,"fireRateMod":0,"rangeMod":0,"magazineMod":0,"reloadTimeMod":0}'),

  ('bbbb0004-bbbb-4bbb-8bbb-bbbbbbbbb004', 'ACOG Scope',
   'Magnified optic — +8% accuracy, +1m range.',
   'rare', 'attachment', 0, 300, '',
   '{"attachment_id":"acog_scope","slot":"optic","accuracyMod":0.08,"fireRateMod":0,"rangeMod":1,"magazineMod":0,"reloadTimeMod":0}')
ON CONFLICT (id) DO NOTHING;

-- Attachments — Grip
INSERT INTO items (id, name, description, rarity, category, stat_boost, price_g, image_url, weapon_stats)
VALUES
  ('bbbb0005-bbbb-4bbb-8bbb-bbbbbbbbb005', 'Foregrip',
   'Vertical grip — +4% accuracy from recoil control.',
   'common', 'attachment', 0, 90, '',
   '{"attachment_id":"foregrip","slot":"grip","accuracyMod":0.04,"fireRateMod":0,"rangeMod":0,"magazineMod":0,"reloadTimeMod":0}'),

  ('bbbb0006-bbbb-4bbb-8bbb-bbbbbbbbb006', 'Quick Grip',
   'Lightweight angled grip — +40 RPM from faster handling.',
   'rare', 'attachment', 0, 220, '',
   '{"attachment_id":"quick_grip","slot":"grip","accuracyMod":0,"fireRateMod":40,"rangeMod":0,"magazineMod":0,"reloadTimeMod":0}')
ON CONFLICT (id) DO NOTHING;

-- Attachments — Magazine
INSERT INTO items (id, name, description, rarity, category, stat_boost, price_g, image_url, weapon_stats)
VALUES
  ('bbbb0007-bbbb-4bbb-8bbb-bbbbbbbbb007', 'Extended Magazine',
   'Larger mag — +10 rounds, +0.4s reload from extra weight.',
   'common', 'attachment', 0, 100, '',
   '{"attachment_id":"extended_mag","slot":"magazine","accuracyMod":0,"fireRateMod":0,"rangeMod":0,"magazineMod":10,"reloadTimeMod":0.4}'),

  ('bbbb0008-bbbb-4bbb-8bbb-bbbbbbbbb008', 'Speed Loader',
   'Quick-release mechanism — -0.5s reload time.',
   'rare', 'attachment', 0, 280, '',
   '{"attachment_id":"speed_loader","slot":"magazine","accuracyMod":0,"fireRateMod":0,"rangeMod":0,"magazineMod":0,"reloadTimeMod":-0.5}')
ON CONFLICT (id) DO NOTHING;

-- ── Verify ─────────────────────────────────────────────────────
SELECT name, category, rarity, price_g FROM items ORDER BY category, price_g;
