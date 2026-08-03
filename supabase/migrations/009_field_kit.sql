-- ============================================================
-- 009 · Field Kit — purchasable tactical gear for the loadout
-- ============================================================
-- Flashlight / Night Vision / Laser were free "standard-issue" toggles; make
-- them ownable gear you buy in the Marketplace and bring in the Loadout — a real
-- G$ sink. Sold ON-CHAIN: on_chain_id 26/27/28 (guns/ammo/attachments took the
-- 10-25 range, boosters 7/8). The purchase-relay routes items WITH an on_chain_id
-- through the marketplace contract (real EIP-2612 permit + on-chain transfer), so
-- buying charges real G$. weapon_stats.kit_id maps to the engine's tactical
-- attachment (FpsSim Attachment: 'light'|'nvg'|'laser').
--
-- REQUIRES the on-chain registration to run FIRST (or in the same deploy):
--   contracts/script/RegisterFieldKit.s.sol  (registerItem + listItem, items 26-28).
-- Without it the marketplace call reverts (item not listed on-chain).

-- 1. Allow the new 'gear' category.
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_category_check;
ALTER TABLE items ADD CONSTRAINT items_category_check
  CHECK (category IN ('weapon', 'shield', 'booster', 'cosmetic', 'ammo', 'attachment', 'gear'));

-- 2. Seed the field kit (on-chain — on_chain_id set so a purchase charges real G$).
INSERT INTO items (id, on_chain_id, name, description, rarity, category, stat_boost, price_g, image_url, weapon_stats)
VALUES
  ('cccc0001-cccc-4ccc-8ccc-cccccccccc01', 26, 'Tactical Flashlight',
   'A barrel-mounted flashlight — throws a forward light cone so you can push dark rooms without night vision.',
   'common', 'gear', 0, 270, '',
   '{"kit_id":"light"}'),

  ('cccc0002-cccc-4ccc-8ccc-cccccccccc02', 27, 'Night Vision Goggles',
   'Head-mounted NVG — lifts the dark on night operations so the whole field reads in green.',
   'rare', 'gear', 0, 1050, '',
   '{"kit_id":"nvg"}'),

  ('cccc0003-cccc-4ccc-8ccc-cccccccccc03', 28, 'Laser Sight',
   'An under-barrel laser — tightens hip-fire so snap shots land without aiming down sights.',
   'common', 'gear', 0, 420, '',
   '{"kit_id":"laser"}')
ON CONFLICT (id) DO NOTHING;
