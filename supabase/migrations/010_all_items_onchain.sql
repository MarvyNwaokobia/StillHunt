-- ============================================================
-- 010 · Every combat item on-chain
-- ============================================================
-- Guns / ammo / attachments were registered + listed on-chain by
-- contracts/script/RegisterNewItems.s.sol (items 10-25, verified in the Celo
-- broadcast), but the post-migration Neon rebuild left their on_chain_id NULL,
-- so purchase-relay was routing them off-chain (no real G$ moved). Restore the
-- on_chain_id so every purchase goes through the marketplace contract and
-- charges real G$. IDs + prices match RegisterNewItems exactly.

-- Guns (10-13)
UPDATE items SET on_chain_id = 10 WHERE id = '22222222-2222-4222-8222-222222222222'; -- Compact SMG
UPDATE items SET on_chain_id = 11 WHERE id = '33333333-3333-4333-8333-333333333333'; -- Assault Rifle
UPDATE items SET on_chain_id = 12 WHERE id = '44444444-4444-4444-8444-444444444444'; -- Marksman Rifle
UPDATE items SET on_chain_id = 13 WHERE id = '55555555-5555-4555-8555-555555555555'; -- StillHunt Prototype

-- Ammo (14-17)
UPDATE items SET on_chain_id = 14 WHERE id = 'aaaa0001-aaaa-4aaa-8aaa-aaaaaaaaa001'; -- Hollow Point
UPDATE items SET on_chain_id = 15 WHERE id = 'aaaa0002-aaaa-4aaa-8aaa-aaaaaaaaa002'; -- Armor Piercing
UPDATE items SET on_chain_id = 16 WHERE id = 'aaaa0003-aaaa-4aaa-8aaa-aaaaaaaaa003'; -- Tracer
UPDATE items SET on_chain_id = 17 WHERE id = 'aaaa0004-aaaa-4aaa-8aaa-aaaaaaaaa004'; -- Incendiary

-- Attachments (18-25)
UPDATE items SET on_chain_id = 18 WHERE id = 'bbbb0001-bbbb-4bbb-8bbb-bbbbbbbbb001'; -- Suppressor
UPDATE items SET on_chain_id = 19 WHERE id = 'bbbb0002-bbbb-4bbb-8bbb-bbbbbbbbb002'; -- Extended Barrel
UPDATE items SET on_chain_id = 20 WHERE id = 'bbbb0003-bbbb-4bbb-8bbb-bbbbbbbbb003'; -- Red Dot Sight
UPDATE items SET on_chain_id = 21 WHERE id = 'bbbb0004-bbbb-4bbb-8bbb-bbbbbbbbb004'; -- ACOG Scope
UPDATE items SET on_chain_id = 22 WHERE id = 'bbbb0005-bbbb-4bbb-8bbb-bbbbbbbbb005'; -- Foregrip
UPDATE items SET on_chain_id = 23 WHERE id = 'bbbb0006-bbbb-4bbb-8bbb-bbbbbbbbb006'; -- Quick Grip
UPDATE items SET on_chain_id = 24 WHERE id = 'bbbb0007-bbbb-4bbb-8bbb-bbbbbbbbb007'; -- Extended Magazine
UPDATE items SET on_chain_id = 25 WHERE id = 'bbbb0008-bbbb-4bbb-8bbb-bbbbbbbbb008'; -- Speed Loader
