-- ============================================================
-- 004 · Guns for the ranged stat-duel (shooter pivot)
-- ============================================================
-- Combat reads typed stats from the engine GUN_CATALOG (apps/web/src/engine/
-- combat/GunStats.ts), keyed by gun id. This table is the marketplace listing +
-- system-of-record; `weapon_stats` mirrors the catalog for display/forward-compat.
-- The frontend maps an owned item's UUID -> engine gun id (apps/web/src/lib/guns.ts),
-- so these UUIDs are fixed and must stay in sync with that file.
--
-- The free starter "sidearm" is the default loadout (every fighter has it), so it
-- is NOT sold here — only the upgrade tiers are purchasable.

ALTER TABLE items ADD COLUMN IF NOT EXISTS weapon_stats JSONB;

INSERT INTO items (id, name, description, rarity, category, stat_boost, price_g, image_url, weapon_stats)
VALUES
  ('22222222-2222-4222-8222-222222222222', 'Compact SMG',
   'High fire rate, low per-shot damage — shreds at close range.',
   'common', 'weapon', 55, 450, '',
   '{"gun_id":"smg","damage":9,"fireRate":600,"accuracy":0.62,"projectileSpeed":26,"range":7,"critChance":0.05,"critMult":1.5,"magazine":30,"reloadTime":2.0}'),

  ('33333333-3333-4333-8333-333333333333', 'Assault Rifle',
   'Balanced damage, rate and range — the reliable workhorse.',
   'rare', 'weapon', 78, 1200, '',
   '{"gun_id":"assault_rifle","damage":18,"fireRate":360,"accuracy":0.72,"projectileSpeed":30,"range":10,"critChance":0.08,"critMult":1.6,"magazine":24,"reloadTime":2.2}'),

  ('44444444-4444-4444-8444-444444444444', 'Marksman Rifle',
   'Slow, accurate and hard-hitting — reward for dodging in and punishing.',
   'epic', 'weapon', 60, 2700, '',
   '{"gun_id":"marksman","damage":45,"fireRate":90,"accuracy":0.90,"projectileSpeed":40,"range":14,"critChance":0.15,"critMult":2.0,"magazine":8,"reloadTime":2.4}'),

  ('55555555-5555-4555-8555-555555555555', 'StillHunt Prototype',
   'Top-tier hardware — high rate AND damage. The endgame gun.',
   'legendary', 'weapon', 120, 6000, '',
   '{"gun_id":"legendary","damage":30,"fireRate":480,"accuracy":0.80,"projectileSpeed":34,"range":12,"critChance":0.12,"critMult":1.8,"magazine":28,"reloadTime":1.8}')
ON CONFLICT (id) DO NOTHING;
