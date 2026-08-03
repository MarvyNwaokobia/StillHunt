-- StillHunt — RLS Authentication Hardening
-- Run this AFTER the backend /auth/token endpoint is deployed and
-- the frontend is calling useHuntAuth() to set the Supabase session.
--
-- The backend issues Supabase-compatible JWTs where:
--   sub = wallet_address (lowercase)
--   role = "authenticated"
-- auth.jwt()->>'sub' returns the wallet address for RLS enforcement.
-- ─────────────────────────────────────────────────────────────────────

-- ── Players ──────────────────────────────────────────────────────────
-- Drop the open policies
DROP POLICY IF EXISTS "Players insert own"  ON players;
DROP POLICY IF EXISTS "Players update own"  ON players;

-- Insert: authenticated user can only insert a row for their own wallet
CREATE POLICY "Players insert own" ON players
  FOR INSERT WITH CHECK (
    auth.jwt()->>'sub' = wallet_address
    OR auth.role() = 'service_role'
  );

-- Update: authenticated user can only update their own row
CREATE POLICY "Players update own" ON players
  FOR UPDATE USING (
    auth.jwt()->>'sub' = wallet_address
    OR auth.role() = 'service_role'
  );

-- ── Battles ───────────────────────────────────────────────────────────
-- Drop the open policy
DROP POLICY IF EXISTS "Battles insert" ON battles;

-- Insert: challenger must be the authenticated wallet
CREATE POLICY "Battles insert" ON battles
  FOR INSERT WITH CHECK (
    auth.jwt()->>'sub' = challenger_wallet
    OR auth.role() = 'service_role'
  );

-- ── Inventory ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Inventory insert" ON inventory;
DROP POLICY IF EXISTS "Inventory update" ON inventory;

CREATE POLICY "Inventory insert" ON inventory
  FOR INSERT WITH CHECK (
    auth.jwt()->>'sub' = wallet_address
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Inventory update" ON inventory
  FOR UPDATE USING (
    auth.jwt()->>'sub' = wallet_address
    OR auth.role() = 'service_role'
  );

-- ── Missions ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Missions insert" ON missions;
DROP POLICY IF EXISTS "Missions update" ON missions;

CREATE POLICY "Missions insert" ON missions
  FOR INSERT WITH CHECK (
    auth.jwt()->>'sub' = wallet_address
    OR auth.role() = 'service_role'
  );

-- Collect endpoint is backend-only (service_role); clients can only deploy
CREATE POLICY "Missions update" ON missions
  FOR UPDATE USING (
    auth.role() = 'service_role'
  );

-- ── Daily Claims ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Daily claims upsert"  ON daily_claims;
DROP POLICY IF EXISTS "Daily claims update"  ON daily_claims;

CREATE POLICY "Daily claims upsert" ON daily_claims
  FOR INSERT WITH CHECK (
    auth.jwt()->>'sub' = wallet_address
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Daily claims update" ON daily_claims
  FOR UPDATE USING (
    auth.jwt()->>'sub' = wallet_address
    OR auth.role() = 'service_role'
  );

-- ── Username History ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Username history insert" ON username_history;

CREATE POLICY "Username history insert" ON username_history
  FOR INSERT WITH CHECK (
    auth.jwt()->>'sub' = wallet_address
    OR auth.role() = 'service_role'
  );

-- ── Player Achievements ───────────────────────────────────────────────
-- check_and_unlock_achievements() runs as SECURITY DEFINER — already safe.
-- Direct inserts from clients are disallowed.
DROP POLICY IF EXISTS "Player achievements insert" ON player_achievements;

CREATE POLICY "Player achievements insert" ON player_achievements
  FOR INSERT WITH CHECK (
    auth.role() = 'service_role'
  );
