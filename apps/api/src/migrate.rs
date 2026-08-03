//! Startup migrations — apply pending schema changes automatically on boot.
//!
//! Before this, migrations in `migrations/*.sql` were applied BY HAND via psql. That is
//! exactly how a schema-dependent deploy breaks silently: the code ships (Railway
//! auto-deploys from main) while the migration sits unrun, so the feature that needs the
//! new column errors on every request. The `add_repeating_decay` column nearly hit this.
//!
//! Design, chosen to fit THIS repo rather than a generic tool:
//!   • The .sql files are hand-written and already IDEMPOTENT (every CREATE/ALTER/INDEX is
//!     guarded with IF NOT EXISTS, every constraint drops-then-adds, every seed has ON
//!     CONFLICT). They are NOT sqlx-convention-named and are deliberately re-runnable, so
//!     sqlx's checksum-locked migrator (which forbids editing an applied file) is the
//!     wrong fit. We track applied files in `_schema_migrations` and run each once, in a
//!     fixed order, inside a transaction.
//!   • Files are EMBEDDED in the binary with include_str!, so a deployed container needs
//!     no migrations/ directory on disk.
//!   • `init.sql` runs first (it creates the base tables); everything else is an additive
//!     ALTER on those tables and is ordered alphabetically after it. Adding a migration =
//!     drop the file in migrations/ and add one line to MIGRATIONS below.
//!
//! Baseline: a DB that already had every migration applied by hand (i.e. prod at the time
//! this shipped) gets `_schema_migrations` created empty on first boot, so the migrator
//! re-runs all files once. That is safe precisely because they are idempotent — each is a
//! no-op against the existing schema — and thereafter they are recorded and skipped.

use sqlx::PgPool;

/// (filename, embedded SQL). ORDER MATTERS: `init.sql` first (base tables), then the rest
/// alphabetically — each of those only adds to init's tables, so alphabetical is safe.
/// Add new migrations at the end (or anywhere after init if order-independent).
const MIGRATIONS: &[(&str, &str)] = &[
    ("init.sql",                  include_str!("../migrations/init.sql")),
    // Second, not alphabetical: these are objects prod has that no migration created
    // (hand-applied, never captured). add_survival_runs.sql reads `endless_scores` and
    // fix_xp_cap.sql reads `players.pve_level`, so this has to precede both.
    ("add_missing_baseline_objects.sql", include_str!("../migrations/add_missing_baseline_objects.sql")),
    ("add_battle_mode.sql",       include_str!("../migrations/add_battle_mode.sql")),
    ("add_chain_tx_columns.sql",  include_str!("../migrations/add_chain_tx_columns.sql")),
    ("add_character_confirmed.sql", include_str!("../migrations/add_character_confirmed.sql")),
    ("add_client_errors.sql",     include_str!("../migrations/add_client_errors.sql")),
    ("add_duels.sql",             include_str!("../migrations/add_duels.sql")),
    ("add_earnings_and_claims.sql", include_str!("../migrations/add_earnings_and_claims.sql")),
    ("add_endless_progress.sql",  include_str!("../migrations/add_endless_progress.sql")),
    ("add_endless_rewards.sql",   include_str!("../migrations/add_endless_rewards.sql")),
    ("add_endless_sessions.sql",  include_str!("../migrations/add_endless_sessions.sql")),
    ("add_first_clear_bounties.sql", include_str!("../migrations/add_first_clear_bounties.sql")),
    ("add_gas_topups.sql",        include_str!("../migrations/add_gas_topups.sql")),
    ("add_gdollar_ledger.sql",    include_str!("../migrations/add_gdollar_ledger.sql")),
    ("add_magic_identity.sql",    include_str!("../migrations/add_magic_identity.sql")),
    ("add_marketplace_debts.sql", include_str!("../migrations/add_marketplace_debts.sql")),
    // Named for where it must RUN, not just what it does: it adds to `g_ledger`,
    // which add_gdollar_ledger.sql creates. Alphabetical order is the run order,
    // so anything sorting before "add_g…" would hit a table that does not exist
    // yet on a fresh database and abort boot.
    ("add_multichain_attribution.sql", include_str!("../migrations/add_multichain_attribution.sql")),
    ("add_op_play_bounties.sql",  include_str!("../migrations/add_op_play_bounties.sql")),
    ("add_player_edition.sql",    include_str!("../migrations/add_player_edition.sql")),
    ("add_prestige_and_tiers.sql", include_str!("../migrations/add_prestige_and_tiers.sql")),
    ("add_rank_up_rewards.sql",   include_str!("../migrations/add_rank_up_rewards.sql")),
    ("add_ranked_xp_lifetime.sql", include_str!("../migrations/add_ranked_xp_lifetime.sql")),
    ("add_referrals.sql",         include_str!("../migrations/add_referrals.sql")),
    ("add_repeating_decay.sql",   include_str!("../migrations/add_repeating_decay.sql")),
    ("add_season_payouts.sql",    include_str!("../migrations/add_season_payouts.sql")),
    // OUT OF ALPHABETICAL ORDER ON PURPOSE: add_seasonal_campaign.sql ALTERs
    // `survival_runs`, and "add_seasonal…" sorts before "add_survival…". Listed
    // alphabetically it aborts a fresh boot with `relation "survival_runs" does
    // not exist`. Dependency order wins over tidiness; the test below checks the
    // list against the directory as a SET so a missing file is still caught.
    ("add_survival_runs.sql",     include_str!("../migrations/add_survival_runs.sql")),
    ("add_seasonal_campaign.sql", include_str!("../migrations/add_seasonal_campaign.sql")),
    ("add_seasonal_weapons.sql",  include_str!("../migrations/add_seasonal_weapons.sql")),
    // The shooter-era shop (on_chain_id 10-28), live in prod but never captured in
    // a migration. Must precede the price seed below, which joins on on_chain_id.
    ("add_shooter_catalogue.sql", include_str!("../migrations/add_shooter_catalogue.sql")),
    // MUST follow add_seasonal_weapons.sql: it prices items by joining on
    // `on_chain_id`, and 29-33 (the seasonal guns) are INSERTED by that file.
    // Placed earlier it would seed 20 of 25 prices and report success — a silent
    // partial that only shows up as an unbuyable gun on Avalanche.
    ("add_avalanche_item_prices.sql", include_str!("../migrations/add_avalanche_item_prices.sql")),
    ("add_survival_rearms.sql",   include_str!("../migrations/add_survival_rearms.sql")),
    ("fix_decimal_columns.sql",   include_str!("../migrations/fix_decimal_columns.sql")),
    ("fix_ledger_categories.sql", include_str!("../migrations/fix_ledger_categories.sql")),
    ("fix_xp_cap.sql",            include_str!("../migrations/fix_xp_cap.sql")),
];

/// Apply every migration not yet recorded, in order, each in its own transaction. Called
/// once at startup before the server binds. A failure here aborts boot on purpose — a box
/// serving requests against a half-migrated schema is worse than a box that won't start.
pub async fn run(db: &PgPool) -> anyhow::Result<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS _schema_migrations (
             name       TEXT PRIMARY KEY,
             applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
         )",
    )
    .execute(db)
    .await?;

    let applied: Vec<String> =
        sqlx::query_scalar("SELECT name FROM _schema_migrations").fetch_all(db).await?;

    let mut ran = 0;
    for (name, sql) in MIGRATIONS {
        if applied.iter().any(|a| a == name) {
            continue;
        }
        tracing::info!("migration: applying {}", name);
        let mut tx = db.begin().await?;
        // raw_sql uses the simple query protocol, so it runs the whole multi-statement
        // file (and handles $$-quoted function bodies) in one round trip.
        sqlx::raw_sql(sql)
            .execute(&mut *tx)
            .await
            .map_err(|e| anyhow::anyhow!("migration {} failed: {}", name, e))?;
        sqlx::query("INSERT INTO _schema_migrations (name) VALUES ($1)")
            .bind(name)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        ran += 1;
    }

    if ran == 0 {
        tracing::info!("migrations: schema up to date ({} known)", MIGRATIONS.len());
    } else {
        tracing::info!("migrations: applied {} new, {} total", ran, MIGRATIONS.len());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::MIGRATIONS;

    #[test]
    fn init_runs_first_and_names_are_unique() {
        // init.sql creates the base tables; every other file ALTERs them, so it must lead.
        assert_eq!(MIGRATIONS[0].0, "init.sql");
        let mut seen = std::collections::HashSet::new();
        for (name, sql) in MIGRATIONS {
            assert!(seen.insert(*name), "duplicate migration name: {}", name);
            assert!(!sql.trim().is_empty(), "{} is embedded empty", name);
        }
    }

    #[test]
    fn the_list_matches_the_migrations_directory() {
        // This replaces an alphabetical-order assertion. The point of that one was to make
        // a MISSING entry obvious by eyeballing the list against `ls migrations/`; checking
        // the directory directly does that job properly, and also catches a file on disk
        // that nobody registered, which the alphabetical check could not.
        //
        // It also drops a constraint that was actively wrong. Alphabetical order is NOT
        // dependency order: add_seasonal_campaign.sql ALTERs `survival_runs`, and
        // "add_seasonal…" sorts before "add_survival…". Enforcing alphabetical meant the
        // list could not run on a fresh database at all — which went unnoticed only because
        // production was baselined by hand, with every table already present.
        //
        // Order is therefore chosen by DEPENDENCY and reviewed by hand. This test guards the
        // set; the ordering is guarded by actually running them against an empty database.
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("migrations");
        let mut on_disk: Vec<String> = std::fs::read_dir(&dir)
            .expect("migrations/ must be readable")
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.ends_with(".sql"))
            .collect();
        on_disk.sort();

        let mut registered: Vec<String> = MIGRATIONS.iter().map(|(n, _)| n.to_string()).collect();
        registered.sort();

        assert_eq!(
            registered, on_disk,
            "MIGRATIONS must list exactly the .sql files in migrations/ (a file was added or removed \
             without updating the list)"
        );
    }
}
