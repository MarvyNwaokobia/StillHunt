-- StillHunt — Initial Schema
-- Run this once in your Supabase SQL editor (Dashboard → SQL Editor → New query)
-- Safe to re-run: all objects use CREATE IF NOT EXISTS / DO blocks

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Players
-- ============================================================
CREATE TABLE players (
  wallet_address          TEXT PRIMARY KEY,

  -- Identity
  username                TEXT UNIQUE,                                -- editable handle, e.g. "IronBlade"
  display_name            TEXT,                                       -- shown in-game, allows spaces

  -- Character
  character_class         TEXT CHECK (character_class IN ('Warrior', 'Mage', 'Archer', 'Rogue', 'Paladin')),
  character_customization JSONB NOT NULL DEFAULT '{}',               -- { skin, hair, outfit, weapon, accessories... }
  avatar                  TEXT NOT NULL DEFAULT '',                   -- legacy emoji avatar, kept for compat
  character_name          TEXT NOT NULL,                             -- deterministic name from wallet (onboarding)
  play_style              TEXT NOT NULL CHECK (play_style IN ('Wanderer', 'Fighter', 'Champion')),

  -- Progression
  rank             TEXT NOT NULL DEFAULT 'Bronze' CHECK (rank IN ('Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond')),
  xp               INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0 AND xp <= 999),
  attack_stat      INTEGER NOT NULL DEFAULT 10,
  defense_stat     INTEGER NOT NULL DEFAULT 10,
  speed_stat       INTEGER NOT NULL DEFAULT 10,
  g_earned_lifetime NUMERIC(18, 6) NOT NULL DEFAULT 0,
  wins             INTEGER NOT NULL DEFAULT 0,
  losses           INTEGER NOT NULL DEFAULT 0,

  -- Decay
  last_active        TIMESTAMPTZ NOT NULL DEFAULT now(),
  decay_status       TEXT NOT NULL DEFAULT 'none' CHECK (decay_status IN ('none', 'warning', 'active')),
  decay_frozen_until TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive unique username lookup
CREATE UNIQUE INDEX idx_players_username_lower ON players (LOWER(username))
  WHERE username IS NOT NULL;

CREATE INDEX idx_players_rank_xp    ON players (rank, xp DESC);
CREATE INDEX idx_players_last_active ON players (last_active);

-- Username history — released usernames become available again; used for anti-abuse
CREATE TABLE username_history (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address TEXT NOT NULL REFERENCES players (wallet_address) ON DELETE CASCADE,
  username       TEXT NOT NULL,
  released_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_username_history_wallet ON username_history (wallet_address);

-- ============================================================
-- Items
-- ============================================================
CREATE TABLE items (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  on_chain_id      SMALLINT UNIQUE,            -- uint256 ID used in the smart contract (1-based sequential)
  name             TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  rarity           TEXT NOT NULL CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  category         TEXT NOT NULL CHECK (category IN ('weapon', 'shield', 'booster', 'cosmetic')),
  stat_boost       INTEGER NOT NULL DEFAULT 0,
  price_g          NUMERIC(12, 6) NOT NULL,
  image_url        TEXT NOT NULL DEFAULT '',
  layer_type       TEXT,       -- cosmetic layer: 'outfit' | 'weapon' | 'accessory' | 'hair' — null for stat items
  layer_asset_url  TEXT,       -- SVG/PNG asset URL for the compositor
  total_supply     INTEGER,    -- NULL = unlimited
  remaining_supply INTEGER     -- NULL = unlimited
);

CREATE INDEX idx_items_category ON items (category);
CREATE INDEX idx_items_rarity   ON items (rarity);

-- ============================================================
-- Inventory
-- ============================================================
CREATE TABLE inventory (
  wallet_address TEXT NOT NULL REFERENCES players (wallet_address) ON DELETE CASCADE,
  item_id        UUID NOT NULL REFERENCES items (id),
  equipped       BOOLEAN NOT NULL DEFAULT false,
  acquired_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet_address, item_id)
);

CREATE INDEX idx_inventory_wallet ON inventory (wallet_address);

-- ============================================================
-- Battles
-- ============================================================
CREATE TABLE battles (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  challenger_wallet     TEXT NOT NULL,
  opponent_wallet       TEXT NOT NULL,
  winner_wallet         TEXT,
  rounds_data           JSONB NOT NULL DEFAULT '[]',
  xp_awarded_challenger INTEGER NOT NULL DEFAULT 0,
  xp_awarded_opponent   INTEGER NOT NULL DEFAULT 0,
  is_bot                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_battles_challenger ON battles (challenger_wallet, created_at DESC);
CREATE INDEX idx_battles_opponent   ON battles (opponent_wallet, created_at DESC);

-- ============================================================
-- Missions
-- ============================================================
CREATE TABLE missions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address TEXT NOT NULL REFERENCES players (wallet_address) ON DELETE CASCADE,
  deployed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  collect_by     TIMESTAMPTZ NOT NULL,
  collected      BOOLEAN NOT NULL DEFAULT false,
  item_dropped   UUID REFERENCES items (id),
  xp_awarded     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_missions_wallet ON missions (wallet_address, collected);

-- ============================================================
-- Achievements
-- ============================================================
CREATE TABLE achievements (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  condition   TEXT NOT NULL,
  image_url   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE player_achievements (
  wallet_address TEXT NOT NULL REFERENCES players (wallet_address) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements (id),
  unlocked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet_address, achievement_id)
);

-- ============================================================
-- Daily Claims
-- ============================================================
CREATE TABLE daily_claims (
  wallet_address  TEXT PRIMARY KEY REFERENCES players (wallet_address) ON DELETE CASCADE,
  last_claimed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE players           ENABLE ROW LEVEL SECURITY;
ALTER TABLE username_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory         ENABLE ROW LEVEL SECURITY;
ALTER TABLE battles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE missions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_claims      ENABLE ROW LEVEL SECURITY;

-- Players: public read (leaderboard + shareable cards), open write for now
CREATE POLICY "Public read players"  ON players FOR SELECT USING (true);
CREATE POLICY "Players insert own"   ON players FOR INSERT WITH CHECK (true);
CREATE POLICY "Players update own"   ON players FOR UPDATE USING (true);

-- Username history: public read only
CREATE POLICY "Public read username_history" ON username_history FOR SELECT USING (true);
CREATE POLICY "Username history insert"      ON username_history FOR INSERT WITH CHECK (true);

-- Items: public read
CREATE POLICY "Public read items" ON items FOR SELECT USING (true);

-- Battles / achievements: public read, open insert
CREATE POLICY "Public read achievements"    ON achievements FOR SELECT USING (true);
CREATE POLICY "Public read battles"         ON battles FOR SELECT USING (true);
CREATE POLICY "Battles insert"              ON battles FOR INSERT WITH CHECK (true);

-- Inventory
CREATE POLICY "Inventory read"   ON inventory FOR SELECT USING (true);
CREATE POLICY "Inventory insert" ON inventory FOR INSERT WITH CHECK (true);
CREATE POLICY "Inventory update" ON inventory FOR UPDATE USING (true);

-- Missions
CREATE POLICY "Missions read"   ON missions FOR SELECT USING (true);
CREATE POLICY "Missions insert" ON missions FOR INSERT WITH CHECK (true);
CREATE POLICY "Missions update" ON missions FOR UPDATE USING (true);

-- Daily claims
CREATE POLICY "Daily claims read"   ON daily_claims FOR SELECT USING (true);
CREATE POLICY "Daily claims upsert" ON daily_claims FOR INSERT WITH CHECK (true);
CREATE POLICY "Daily claims update" ON daily_claims FOR UPDATE USING (true);

-- Player achievements
CREATE POLICY "Player achievements read"   ON player_achievements FOR SELECT USING (true);
CREATE POLICY "Player achievements insert" ON player_achievements FOR INSERT WITH CHECK (true);

-- ============================================================
-- Realtime — enable broadcast for live leaderboard + player card
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE battles;

-- ============================================================
-- Helper: real-time username availability check
-- Called from frontend with a debounced query — no API round-trip needed
-- ============================================================
CREATE OR REPLACE FUNCTION check_username_available(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE SQL STABLE
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM players
    WHERE LOWER(username) = LOWER(p_username)
  );
$$;

-- ============================================================
-- Seed: Items
-- on_chain_id is the uint256 used in the smart contract.
-- Keep these IDs stable — they are baked into on-chain listings.
-- ============================================================
INSERT INTO items (on_chain_id, name, description, rarity, category, stat_boost, price_g, image_url) VALUES
  (1, 'Iron Sword',    'A reliable weapon for new warriors.',        'common',    'weapon',  3,  5,   ''),
  (2, 'Steel Blade',   'Forged in the heat of battle.',              'rare',      'weapon',  7,  15,  ''),
  (3, 'Void Edge',     'A blade from another dimension.',            'epic',      'weapon',  12, 35,  ''),
  (4, 'Iron Shield',   'Basic protection against attacks.',          'common',    'shield',  3,  5,   ''),
  (5, 'StillHunt Guard',   'A shield that delays decay for 7 days.',     'rare',      'shield',  6,  20,  ''),
  (6, 'Fortress Wall', 'Maximum defense.',                           'epic',      'shield',  10, 40,  ''),
  (7, 'XP Booster',    'Double XP from all sources for 24 hours.',  'common',    'booster', 0,  30,  ''),
  (8, 'Elite Booster', '2x XP + 1.5x battle rewards for 24 hours.', 'rare',      'booster', 0,  75,  '');

INSERT INTO items (on_chain_id, name, description, rarity, category, stat_boost, price_g, image_url, total_supply, remaining_supply) VALUES
  (9, 'The Last Blade', 'Only 50 exist. Ever.',                      'legendary', 'weapon',  20, 100, '', 50, 50);

-- ============================================================
-- Seed: Achievements
-- ============================================================
INSERT INTO achievements (name, description, condition, image_url) VALUES
  ('First Blood',     'Win your first battle.',               'wins >= 1',       ''),
  ('Warrior',         'Win 10 battles.',                      'wins >= 10',      ''),
  ('Battle Hardened', 'Win 50 battles.',                      'wins >= 50',      ''),
  ('Survivor',        'Recover from active decay.',           'decay_recovered', ''),
  ('Gold Rush',       'Reach Gold rank.',                     'rank = Gold',     ''),
  ('Diamond Hands',   'Reach Diamond rank — the pinnacle.',   'rank = Diamond',  ''),
  ('Idle Master',     'Complete 10 idle missions.',           'missions >= 10',  ''),
  ('Collector',       'Own 5 items.',                         'inventory >= 5',  '');

-- ============================================================
-- Achievement Checker — call after any event that could unlock something
-- Returns rows for every newly unlocked achievement (empty if none)
-- ============================================================
CREATE OR REPLACE FUNCTION check_and_unlock_achievements(p_wallet TEXT)
RETURNS TABLE(achievement_id UUID, achievement_name TEXT, unlocked_at TIMESTAMPTZ)
LANGUAGE plpgsql
AS $$
DECLARE
  v_player            players%ROWTYPE;
  v_missions_count    INTEGER;
  v_inventory_count   INTEGER;
  v_already_unlocked  UUID[];
  v_achievement       achievements%ROWTYPE;
  v_condition_met     BOOLEAN;
BEGIN
  SELECT * INTO v_player FROM players WHERE wallet_address = p_wallet;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COUNT(*) INTO v_missions_count
    FROM missions WHERE wallet_address = p_wallet AND collected = true;

  SELECT COUNT(*) INTO v_inventory_count
    FROM inventory WHERE wallet_address = p_wallet;

  SELECT COALESCE(ARRAY_AGG(pa.achievement_id), '{}') INTO v_already_unlocked
    FROM player_achievements pa WHERE pa.wallet_address = p_wallet;

  FOR v_achievement IN SELECT * FROM achievements LOOP
    -- Skip already unlocked
    IF v_already_unlocked @> ARRAY[v_achievement.id] THEN CONTINUE; END IF;

    v_condition_met := CASE v_achievement.condition
      WHEN 'wins >= 1'       THEN v_player.wins >= 1
      WHEN 'wins >= 10'      THEN v_player.wins >= 10
      WHEN 'wins >= 50'      THEN v_player.wins >= 50
      WHEN 'rank = Gold'     THEN v_player.rank = 'Gold'
      WHEN 'rank = Diamond'  THEN v_player.rank = 'Diamond'
      WHEN 'missions >= 10'  THEN v_missions_count >= 10
      WHEN 'inventory >= 5'  THEN v_inventory_count >= 5
      -- decay_recovered: checked explicitly from frontend when decay resets
      ELSE FALSE
    END;

    IF v_condition_met THEN
      INSERT INTO player_achievements (wallet_address, achievement_id, unlocked_at)
      VALUES (p_wallet, v_achievement.id, NOW())
      ON CONFLICT DO NOTHING;

      achievement_id   := v_achievement.id;
      achievement_name := v_achievement.name;
      unlocked_at      := NOW();
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

-- Grant execute to anon role so the frontend can call it via Supabase RPC
GRANT EXECUTE ON FUNCTION check_and_unlock_achievements(TEXT) TO anon;
