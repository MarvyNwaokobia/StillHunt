-- StillHunt — Railway Postgres Init
-- Combined from supabase/migrations/001 + 003
-- Supabase-specific lines (supabase_realtime, auth.jwt, anon role) removed.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Players
-- ============================================================
CREATE TABLE IF NOT EXISTS players (
  wallet_address          TEXT PRIMARY KEY,
  username                TEXT UNIQUE,
  display_name            TEXT,
  character_class         TEXT CHECK (character_class IN ('Berserker', 'Sentinel', 'Phantom', 'Warden', 'Specter', 'Vanguard')),
  character_customization JSONB NOT NULL DEFAULT '{}',
  avatar                  TEXT NOT NULL DEFAULT '',
  character_name          TEXT NOT NULL,
  play_style              TEXT NOT NULL CHECK (play_style IN ('Wanderer', 'Fighter', 'Champion')),
  rank             TEXT NOT NULL DEFAULT 'Bronze' CHECK (rank IN ('Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond')),
  -- No upper bound: the rank threshold (XP_PER_RANK) is a game constant that moves,
  -- and a stale ceiling here silently aborts every award. See fix_xp_cap.sql.
  xp               INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  attack_stat      INTEGER NOT NULL DEFAULT 10,
  defense_stat     INTEGER NOT NULL DEFAULT 10,
  speed_stat       INTEGER NOT NULL DEFAULT 10,
  g_earned_lifetime FLOAT8 NOT NULL DEFAULT 0,
  wins             INTEGER NOT NULL DEFAULT 0,
  losses           INTEGER NOT NULL DEFAULT 0,
  last_active        TIMESTAMPTZ NOT NULL DEFAULT now(),
  decay_status       TEXT NOT NULL DEFAULT 'none' CHECK (decay_status IN ('none', 'warning', 'active')),
  decay_frozen_until TIMESTAMPTZ,
  character_claim_tx TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_players_username_lower ON players (LOWER(username))
  WHERE username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_players_rank_xp    ON players (rank, xp DESC);
CREATE INDEX IF NOT EXISTS idx_players_last_active ON players (last_active);

CREATE TABLE IF NOT EXISTS username_history (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address TEXT NOT NULL REFERENCES players (wallet_address) ON DELETE CASCADE,
  username       TEXT NOT NULL,
  released_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_username_history_wallet ON username_history (wallet_address);

-- ============================================================
-- Items
-- ============================================================
CREATE TABLE IF NOT EXISTS items (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  on_chain_id      SMALLINT UNIQUE,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  rarity           TEXT NOT NULL CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  category         TEXT NOT NULL CHECK (category IN ('weapon', 'shield', 'booster', 'cosmetic')),
  stat_boost       INTEGER NOT NULL DEFAULT 0,
  price_g          FLOAT8 NOT NULL,
  image_url        TEXT NOT NULL DEFAULT '',
  layer_type       TEXT,
  layer_asset_url  TEXT,
  total_supply     INTEGER,
  remaining_supply INTEGER
);
CREATE INDEX IF NOT EXISTS idx_items_category ON items (category);
CREATE INDEX IF NOT EXISTS idx_items_rarity   ON items (rarity);

-- ============================================================
-- Inventory
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory (
  wallet_address TEXT NOT NULL REFERENCES players (wallet_address) ON DELETE CASCADE,
  item_id        UUID NOT NULL REFERENCES items (id),
  equipped       BOOLEAN NOT NULL DEFAULT false,
  acquired_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet_address, item_id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_wallet ON inventory (wallet_address);

-- ============================================================
-- Battles
-- ============================================================
CREATE TABLE IF NOT EXISTS battles (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  challenger_wallet     TEXT NOT NULL,
  opponent_wallet       TEXT NOT NULL,
  winner_wallet         TEXT,
  rounds_data           JSONB NOT NULL DEFAULT '[]',
  xp_awarded_challenger INTEGER NOT NULL DEFAULT 0,
  xp_awarded_opponent   INTEGER NOT NULL DEFAULT 0,
  is_bot                BOOLEAN NOT NULL DEFAULT true,
  game_record_tx        TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_battles_challenger ON battles (challenger_wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_battles_opponent   ON battles (opponent_wallet, created_at DESC);

-- ============================================================
-- Missions
-- ============================================================
CREATE TABLE IF NOT EXISTS missions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address TEXT NOT NULL REFERENCES players (wallet_address) ON DELETE CASCADE,
  deployed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  collect_by     TIMESTAMPTZ NOT NULL,
  collected      BOOLEAN NOT NULL DEFAULT false,
  item_dropped   UUID REFERENCES items (id),
  xp_awarded     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_missions_wallet ON missions (wallet_address, collected);

-- ============================================================
-- Achievements
-- ============================================================
CREATE TABLE IF NOT EXISTS achievements (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  condition   TEXT NOT NULL,
  image_url   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS player_achievements (
  wallet_address TEXT NOT NULL REFERENCES players (wallet_address) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements (id),
  unlocked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet_address, achievement_id)
);

-- ============================================================
-- Daily Claims
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_claims (
  wallet_address  TEXT PRIMARY KEY REFERENCES players (wallet_address) ON DELETE CASCADE,
  last_claimed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Helper functions
-- ============================================================
CREATE OR REPLACE FUNCTION check_username_available(p_username TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM players WHERE LOWER(username) = LOWER(p_username)
  );
$$;

CREATE OR REPLACE FUNCTION check_and_unlock_achievements(p_wallet TEXT)
RETURNS TABLE(achievement_id UUID, achievement_name TEXT, unlocked_at TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
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
    IF v_already_unlocked @> ARRAY[v_achievement.id] THEN CONTINUE; END IF;
    v_condition_met := CASE v_achievement.condition
      WHEN 'wins >= 1'       THEN v_player.wins >= 1
      WHEN 'wins >= 10'      THEN v_player.wins >= 10
      WHEN 'wins >= 50'      THEN v_player.wins >= 50
      WHEN 'rank = Gold'     THEN v_player.rank = 'Gold'
      WHEN 'rank = Diamond'  THEN v_player.rank = 'Diamond'
      WHEN 'missions >= 10'  THEN v_missions_count >= 10
      WHEN 'inventory >= 5'  THEN v_inventory_count >= 5
      ELSE FALSE
    END;
    IF v_condition_met THEN
      INSERT INTO player_achievements (wallet_address, achievement_id, unlocked_at)
      VALUES (p_wallet, v_achievement.id, NOW()) ON CONFLICT DO NOTHING;
      achievement_id   := v_achievement.id;
      achievement_name := v_achievement.name;
      unlocked_at      := NOW();
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- Seed: Items
-- ============================================================
INSERT INTO items (on_chain_id, name, description, rarity, category, stat_boost, price_g, image_url) VALUES
  (1, 'Iron Sword',    'A reliable weapon for new warriors.',        'common',    'weapon',  3,  5,   ''),
  (2, 'Steel Blade',   'Forged in the heat of battle.',              'rare',      'weapon',  7,  15,  ''),
  (3, 'Void Edge',     'A blade from another dimension.',            'epic',      'weapon',  12, 35,  ''),
  (4, 'Iron Shield',   'Basic protection against attacks.',          'common',    'shield',  3,  5,   ''),
  (5, 'StillHunt Guard',   'A shield that delays decay for 7 days.',     'rare',      'shield',  6,  20,  ''),
  (6, 'Fortress Wall', 'Maximum defense.',                           'epic',      'shield',  10, 40,  ''),
  (7, 'XP Booster',    'Double XP earned from battles while equipped.', 'common', 'booster', 0, 30, ''),
  (8, 'Elite Booster', '2x XP earned from battles while equipped.',    'rare',   'booster', 0, 75, '')
ON CONFLICT (on_chain_id) DO NOTHING;

INSERT INTO items (on_chain_id, name, description, rarity, category, stat_boost, price_g, image_url, total_supply, remaining_supply) VALUES
  (9, 'The Last Blade', 'Only 50 exist. Ever.', 'legendary', 'weapon', 20, 100, '', 50, 50)
ON CONFLICT (on_chain_id) DO NOTHING;

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
  ('Collector',       'Own 5 items.',                         'inventory >= 5',  '')
ON CONFLICT DO NOTHING;
