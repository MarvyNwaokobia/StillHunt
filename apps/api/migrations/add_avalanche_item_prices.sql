-- Per-chain item pricing.
--
-- `items.price_g` is a single price per item, which was correct while StillHunt sold
-- goods on one chain. It is not any more: the same rifle costs 1,200 G$ on Celo and
-- 6,000 SCRP on Avalanche, and those are not conversions of each other. G$ has a real
-- exchange rate, so Celo prices track money. SCRP has none by design, so Avalanche
-- prices track TIME PLAYED — one campaign win is 100 SCRP, and every price is a
-- multiple of that.
--
-- THE INVARIANT THIS TABLE EXISTS TO KEEP
-- ---------------------------------------
-- A purchase signs an EIP-2612 permit for the price the SERVER quotes, then the
-- marketplace pulls the price the CONTRACT holds. If those disagree by even one wei
-- the transfer reverts, the player has spent a signature for nothing, and the error
-- surfaces as "the marketplace is broken". So the price here MUST equal the on-chain
-- listing for the same (item, chain).
--
-- Mirrored in contracts/script/RegisterAvalancheItems.s.sol. Change them together,
-- and verify with the on-chain read documented in that script.
--
-- WHY A TABLE AND NOT A `price_scrp` COLUMN
-- -----------------------------------------
-- A column per chain means a schema change per chain, and every query that prices an
-- item grows another CASE. A row per (item, chain) means adding a chain is inserting
-- rows. `items.price_g` is deliberately left alone: it stays the Celo price, so every
-- existing Celo query keeps working untouched.

CREATE TABLE IF NOT EXISTS item_chain_prices (
    item_id  UUID          NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    chain_id INTEGER       NOT NULL,
    -- Whole currency units, same scale as items.price_g. The 18-decimal scaling to
    -- wei happens at the point of sale, exactly as it does for G$ today.
    price    NUMERIC(20,8) NOT NULL,
    PRIMARY KEY (item_id, chain_id),
    -- A free item would let anyone mint unlimited inventory for zero spend.
    CONSTRAINT item_chain_prices_positive CHECK (price > 0)
);

CREATE INDEX IF NOT EXISTS idx_item_chain_prices_chain ON item_chain_prices (chain_id);

-- Avalanche C-Chain (43114) prices, keyed by on_chain_id so this stays correct even
-- if the UUIDs differ between environments. ON CONFLICT keeps it re-runnable, which
-- the migrator requires.
INSERT INTO item_chain_prices (item_id, chain_id, price)
SELECT i.id, 43114, v.price
  FROM items i
  JOIN (VALUES
      -- boosters: a quarter of a mission, so buying several a session is normal
      (7,    25::numeric), (8,    50),
      -- ammo: consumable, the most repeatable sink here
      (14,   50), (16,   50), (15,  125), (17,  250),
      -- attachments: two to four missions
      (22,  200), (24,  200), (20,  200), (18,  250),
      (23,  350), (19,  400), (25,  400), (21,  450),
      -- gear
      (26,  200), (28,  250), (27,  500),
      -- weapons: the progression spine, 8 missions to 80
      (10,  800), (11, 1500), (12, 2500), (29, 2500), (30, 3000),
      (13, 6000), (31, 6500), (32, 7000), (33, 8000)
  ) AS v(on_chain_id, price) ON v.on_chain_id = i.on_chain_id
ON CONFLICT (item_id, chain_id) DO UPDATE SET price = EXCLUDED.price;
