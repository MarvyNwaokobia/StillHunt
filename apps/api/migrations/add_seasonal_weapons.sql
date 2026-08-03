-- Seasonal weapons (2026-07-26)
--
-- Five weapons above the StillHunt Prototype, priced 3,000-10,000 G$. Each is a real
-- upgrade on it and each is better in a DIFFERENT way, so buying one is a choice of
-- playstyle rather than just a bigger number:
--
--   Ashfall Carbine   3,000  fast, accurate, forgiving — the entry seasonal
--   Warden's Repeater 4,500  heavy hitter, slow and deliberate
--   Rift Lance        6,500  energy marksman; huge per-shot, punishing to miss
--   Seraph            8,000  belt-fed LMG; 75-round mag, long reload
--   Ember Halo       10,000  the exotic; best at everything
--
-- The UUIDs are FIXED and mirrored in apps/web/src/lib/guns.ts (GUN_ITEM_ID) and in
-- the on-chain registration script. All three must agree or a purchased item won't
-- resolve to a gun in the fight.
--
-- ⚠️ `on_chain_id` values 29-33 must ALSO be registered on StillHuntArmory +
-- StillHuntMarketplace before these can be bought — a purchase builds a permit against
-- the on-chain listing, so an unregistered item reverts. See
-- contracts/script/RegisterSeasonalWeapons.s.sol.
--
-- `sale_ends_at` is NULL for all of them = on sale indefinitely. Set it on the ones
-- that should close when the season does; the marketplace reads this column and an
-- item without one simply never expires.

ALTER TABLE items ADD COLUMN IF NOT EXISTS sale_ends_at TIMESTAMPTZ;

-- `weapon_stats` exists in the production database but NO migration ever created it: it
-- was applied by hand and never captured in a file. The INSERT below writes to it, so
-- against any database built purely from these migrations this file failed with
-- `column "weapon_stats" of relation "items" does not exist` — which means the migration
-- set could not rebuild prod's schema at all. That is the whole promise migrate.rs makes,
-- so the column is declared here, matching prod exactly (jsonb, nullable, no default).
-- No-op against prod, which already has it.
ALTER TABLE items ADD COLUMN IF NOT EXISTS weapon_stats JSONB;

INSERT INTO items (id, on_chain_id, name, description, rarity, category, stat_boost, price_g, image_url, weapon_stats)
VALUES
  ('66666666-6666-4666-8666-666666666666', 29, 'Ashfall Carbine',
   'Bullpup carbine cut down for close work. Brass furniture, burnt gunmetal, and a rate of fire that forgives a shaky hand.',
   'epic', 'weapon', 26, 3000, '',
   '{"slot":"primary","tier":6,"gun_id":"ashfall_carbine"}'::jsonb),

  ('77777777-7777-4777-8777-777777777777', 30, 'Warden''s Repeater',
   'A battle rifle from the Proving Ground armoury. Slow, heavy, and it ends arguments in two rounds.',
   'epic', 'weapon', 52, 4500, '',
   '{"slot":"primary","tier":7,"gun_id":"warden_repeater"}'::jsonb),

  ('88888888-8888-4888-8888-888888888888', 31, 'Rift Lance',
   'Coil-driven marksman rifle recovered from the Rift. One shot, one answer — if you can land it.',
   'legendary', 'weapon', 95, 6500, '',
   '{"slot":"primary","tier":8,"gun_id":"rift_lance"}'::jsonb),

  ('99999999-9999-4999-8999-999999999999', 32, 'Seraph',
   'Belt-fed support gun with a seventy-five round drum. It does not stop. Reloading it is another matter.',
   'legendary', 'weapon', 34, 8000, '',
   '{"slot":"primary","tier":9,"gun_id":"seraph_lmg"}'::jsonb),

  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 33, 'Ember Halo',
   'Ceramic and gold, with a ring of ember light standing off the muzzle. The finest weapon anyone has carried out of Ashfall.',
   'legendary', 'weapon', 58, 10000, '',
   '{"slot":"primary","tier":10,"gun_id":"ember_halo"}'::jsonb)
ON CONFLICT (on_chain_id) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      rarity      = EXCLUDED.rarity,
      price_g     = EXCLUDED.price_g,
      weapon_stats = EXCLUDED.weapon_stats;

-- ── Season 1 exclusivity ─────────────────────────────────────────────────────
-- The Ember Halo is the ONLY weapon that leaves the shop when Season 1 closes
-- (27 Jul 2026 23:59 WAT = 22:59 UTC). Everything else above stays on sale.
--
-- Anyone who bought it KEEPS it — this only stops new sales. That is what makes it
-- worth 10,000 G$: after the season it can't be bought at any price.
UPDATE items SET sale_ends_at = TIMESTAMPTZ '2026-07-27 22:59:00+00'
WHERE on_chain_id = 33;
