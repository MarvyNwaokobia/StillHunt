#!/usr/bin/env node
/**
 * Bootstrap a fresh Railway Postgres with StillHunt's full current schema, in order.
 *
 * Mostly redundant now: the API applies pending migrations automatically on startup
 * (apps/api/src/migrate.rs). Keep this for spinning up a brand-new empty DB out-of-band,
 * or for inspecting the ordering. Run from the repo root:
 *   DATABASE_URL=postgres://..  node scripts/bootstrap-db.mjs
 *
 * Then reconstruct players from chain:
 *   GAME_RECORD_CONTRACT=.. CELOSCAN_API_KEY=.. DATABASE_URL=..  node scripts/reconstruct-players.mjs
 *
 * The order matters: init creates the tables, later files ALTER them. Every file
 * is idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS), so re-running is safe.
 */
import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
  'apps/api/migrations/init.sql',              // core tables (players, battles, items, …) — 001+003
  'supabase/migrations/004_guns.sql',          // items.layer/stat columns + gun catalogue
  'supabase/migrations/005_pve_level.sql',     // players.pve_level
  'supabase/migrations/006_endless.sql',       // endless_scores (survival leaderboard)
  'supabase/migrations/007_remove_melee_items.sql', // prune legacy melee items
  'supabase/migrations/008_ammo_attachments.sql',   // ammo/attachment items
  'apps/api/migrations/add_chain_tx_columns.sql',   // character_claim_tx, game_record_tx
  'apps/api/migrations/fix_decimal_columns.sql',    // g_earned_lifetime / price_g → NUMERIC
  'apps/api/migrations/add_gdollar_ledger.sql',     // g_ledger, seasons
  'apps/api/migrations/add_first_clear_bounties.sql', // B0 bounties
  'apps/api/migrations/add_character_confirmed.sql',  // confirm-your-class flag
  'apps/api/migrations/add_survival_rearms.sql',      // B1 survival re-arm sink
  'apps/api/migrations/add_survival_runs.sql',        // B2 prestige gauntlet runs
  'apps/api/migrations/add_season_payouts.sql',       // B3 season prize pool + payouts
  'apps/api/migrations/add_rank_up_rewards.sql',      // rank-up G$ rewards (idempotent)
];

if (!process.env.DATABASE_URL) { console.error('Set DATABASE_URL'); process.exit(1); }

const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
for (const f of FILES) {
  const sql = readFileSync(resolve(root, f), 'utf8');
  process.stdout.write(`applying ${f} … `);
  await c.query(sql);
  console.log('ok');
}
const tables = await c.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
);
console.log('\nschema ready. tables:', tables.rows.map((r) => r.table_name).join(', '));
await c.end();
