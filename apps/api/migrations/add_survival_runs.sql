-- Prestige Gauntlet runs (B2 · ranked endless feeding the seasonal G$ ladder).
-- Unlike the casual endless_scores board (client-reports, server-bounds), a Gauntlet
-- run is SERVER-VALIDATED: the server issues a run token at start and records the
-- real started_at, then on submit checks the elapsed time is plausible for the
-- claimed wave count (anti-cheat "level 2"). One row per run; one submit per token.
-- Run after init.sql + 006_endless.sql on existing databases.

CREATE TABLE IF NOT EXISTS survival_runs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address TEXT   NOT NULL REFERENCES players (wallet_address) ON DELETE CASCADE,
  run_token      TEXT   NOT NULL UNIQUE,          -- issued at /start, single-use
  waves          INT    NOT NULL DEFAULT 0,       -- waves survived (set on submit)
  kills          INT    NOT NULL DEFAULT 0,
  duration_secs  INT    NOT NULL DEFAULT 0,       -- server-computed (now − started_at)
  started_at     TIMESTAMPTZ NOT NULL,            -- server-recorded run start (anti-cheat anchor)
  status         TEXT   NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'submitted', 'void')),
  week_key       TEXT,                            -- ISO season partition, set on submit
  submitted_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Leaderboard reads: best submitted waves per wallet, all-time and per season.
CREATE INDEX IF NOT EXISTS idx_survival_runs_board
  ON survival_runs (waves DESC) WHERE status = 'submitted';
CREATE INDEX IF NOT EXISTS idx_survival_runs_season
  ON survival_runs (week_key, waves DESC) WHERE status = 'submitted';
CREATE INDEX IF NOT EXISTS idx_survival_runs_wallet
  ON survival_runs (wallet_address);
