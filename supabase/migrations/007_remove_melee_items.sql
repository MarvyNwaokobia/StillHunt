-- ============================================================
-- 007 · Remove legacy melee items (shooter pivot cleanup)
-- ============================================================
-- The initial schema seeded sword/shield/blade items from the melee era.
-- These no longer fit the shooter — guns are the only weapon category now.
-- Boosters (XP Booster, Elite Booster) stay. "The Last Blade" (legendary
-- melee weapon) is removed — the StillHunt Prototype is the legendary gun.
--
-- NOTE: if any player owns one of these items (player_inventory), the FK
-- constraint will block the delete. In that case, keep the row but rename
-- it so it doesn't confuse the marketplace. The ON DELETE CASCADE on
-- player_inventory.item_id (if set) would auto-clean; if not, this
-- migration handles both cases gracefully.

-- Remove old melee weapons + shields. Boosters (on_chain_id 7, 8) stay.
DELETE FROM items WHERE on_chain_id IN (1, 2, 3, 4, 5, 6, 9);

-- Also remove the 'shield' category constraint if it blocks future inserts.
-- The category CHECK allows 'weapon', 'shield', 'booster', 'cosmetic' —
-- we keep 'shield' in the constraint for backwards compat but no items use it.
