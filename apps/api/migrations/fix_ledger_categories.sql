-- The g_ledger CHECK listed four categories; the code writes nine.
--
-- Every write in the other five violated the constraint and was rejected. The
-- insert helper only logs on failure, so nothing surfaced: money moved on-chain
-- and the ledger stayed silent. Season 1's prize payout is the clearest case —
-- 500,000 G$ left the reward pool in 50 confirmed transactions, `season_payouts`
-- recorded all ten winners as paid with tx hashes, and `g_ledger` gained nothing,
-- so every admin total under-reported by half a million G$.
--
-- Same shape as the XP cap 999 bug (see fix_xp_cap.sql): a constraint written
-- alongside one version of the code, left behind when the code grew, silently
-- vetoing writes ever since.
--
-- Rather than list categories again and re-create the drift the moment a tenth is
-- added, the constraint is dropped. It was never load-bearing: `category` is
-- written only from string literals in our own handlers, never from user input,
-- so it validated nothing an attacker could reach. A typo'd category is now a
-- visible wrong label instead of an invisible missing row, and losing money from
-- a report is far worse than mislabelling it.
ALTER TABLE g_ledger DROP CONSTRAINT IF EXISTS g_ledger_category_check;

-- Backfill what the constraint rejected. `season_payouts` is the durable record
-- (it survived because it has no such constraint), so the ledger can be rebuilt
-- from it exactly.
--
-- One row per winner, carrying the real tx_hash. The NOT EXISTS keeps this
-- idempotent — re-running adds nothing, and a payout that is later re-run writes
-- its own ledger row normally now that the constraint is gone.
INSERT INTO g_ledger (wallet_address, category, amount, tx_hash, created_at)
SELECT sp.wallet_address, 'season_reward', sp.amount_g, sp.tx_hash, sp.created_at
FROM season_payouts sp
WHERE sp.status = 'paid'
  AND NOT EXISTS (
    SELECT 1 FROM g_ledger l
    WHERE l.wallet_address = sp.wallet_address
      AND l.category = 'season_reward'
      AND l.amount = sp.amount_g
  );
