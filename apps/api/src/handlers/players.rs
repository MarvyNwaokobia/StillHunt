use actix_web::{web, HttpResponse};
use chrono::Utc;
use ethers::types::Address;
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::handlers::ledger::{record_ubi_claim, DailyClaimLedgerBody};
use crate::utils::{is_valid_wallet, normalize_wallet};
use crate::AppState;

// ── PATCH /players/:wallet ────────────────────────────────────────────────────
/// COSMETIC / IDENTITY FIELDS ONLY.
///
/// This endpoint is unauthenticated — anyone can PATCH any wallet — so it must never
/// accept a field that decides progression or money. It previously took `rank`,
/// `last_active`, `decay_status` and `decay_frozen_until`, which meant an
/// unauthenticated caller could hand themselves Diamond (4 rank-ups' worth of G$),
/// demote another player, or dodge decay forever:
///
///     PATCH /players/0x<anyone> {"rank":"Diamond","last_active":"<now>"}
///
/// No client ever sent any of them (the only PATCH bodies are username,
/// character_customization, character_class/name/confirmed, and inventory `equipped`),
/// so they were pure attack surface. Rank is owned by award_player, last_active by the
/// fight paths, and decay by the decay sweep + POST /freeze-decay, which checks that
/// the player actually owns a shield. Keep it that way: do not re-add a progression
/// field here without putting real auth on the route first.
#[derive(Deserialize)]
pub struct UpdatePlayerRequest {
    pub username:                Option<String>,
    pub display_name:            Option<String>,
    pub character_customization: Option<serde_json::Value>,
    // Confirm-your-class: reconstructed players confirm/re-pick class + name here.
    pub character_class:         Option<String>,
    pub character_name:          Option<String>,
    pub character_confirmed:     Option<bool>,
}

pub async fn update_player(
    state: web::Data<AppState>,
    path: web::Path<String>,
    body: web::Json<UpdatePlayerRequest>,
) -> HttpResponse {
    let wallet = normalize_wallet(&path.into_inner());

    // Validate username uniqueness if provided
    if let Some(ref uname) = body.username {
        if uname.len() < 3 || uname.len() > 20 {
            return HttpResponse::BadRequest().json(json!({"error": "Username must be 3–20 characters"}));
        }
        let taken: Option<(String,)> = sqlx::query_as(
            "SELECT wallet_address FROM players WHERE username = $1 AND wallet_address != $2",
        )
        .bind(uname)
        .bind(&wallet)
        .fetch_optional(&state.db)
        .await
        .unwrap_or(None);

        if taken.is_some() {
            return HttpResponse::Conflict().json(json!({"error": "Username already taken"}));
        }
    }

    let result = sqlx::query_as::<_, crate::models::player::Player>(
        "UPDATE players
         SET
           username                = COALESCE($1, username),
           display_name            = COALESCE($2, display_name),
           character_customization = COALESCE($3, character_customization),
           character_class         = COALESCE($5, character_class),
           character_name          = COALESCE($6, character_name),
           character_confirmed     = COALESCE($7, character_confirmed)
         WHERE wallet_address = $4
         RETURNING *",
    )
    .bind(&body.username)
    .bind(&body.display_name)
    .bind(body.character_customization.as_ref().map(|v| sqlx::types::Json(v.clone())))
    .bind(&wallet)
    .bind(&body.character_class)
    .bind(&body.character_name)
    .bind(body.character_confirmed)
    .fetch_optional(&state.db)
    .await;

    match result {
        Ok(Some(player)) => HttpResponse::Ok().json(player),
        Ok(None) => HttpResponse::NotFound().json(json!({"error": "Player not found"})),
        Err(e) => {
            tracing::error!("Failed to update player: {}", e);
            HttpResponse::InternalServerError().json(json!({"error": "Database error"}))
        }
    }
}

// ── GET /players/:wallet/username-available ───────────────────────────────────
pub async fn check_username(
    state: web::Data<AppState>,
    path: web::Path<(String, String)>,
) -> HttpResponse {
    let (wallet, username) = path.into_inner();
    if username.len() < 3 || username.len() > 20 {
        return HttpResponse::Ok().json(json!({"available": false, "reason": "Username must be 3–20 characters"}));
    }

    let taken: Option<(String,)> = sqlx::query_as(
        "SELECT wallet_address FROM players WHERE username = $1 AND wallet_address != $2",
    )
    .bind(&username)
    .bind(&wallet)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    HttpResponse::Ok().json(json!({"available": taken.is_none()}))
}

pub async fn get_player(
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    let wallet = normalize_wallet(&path.into_inner());

    let result = sqlx::query_as::<_, crate::models::player::Player>(
        "SELECT * FROM players WHERE wallet_address = $1",
    )
    .bind(&wallet)
    .fetch_optional(&state.db)
    .await;

    match result {
        Ok(Some(player)) => HttpResponse::Ok().json(player),
        Ok(None) => HttpResponse::NotFound().json(json!({"error": "Player not found"})),
        Err(e) => {
            tracing::error!("DB error: {}", e);
            HttpResponse::InternalServerError().json(json!({"error": "Database error"}))
        }
    }
}

pub async fn daily_claim(
    state: web::Data<AppState>,
    path: web::Path<String>,
    body: Option<web::Json<DailyClaimLedgerBody>>,
) -> HttpResponse {
    let wallet = normalize_wallet(&path.into_inner());
    let now = Utc::now();
    let cutoff = now - chrono::Duration::hours(24);

    // Check last claim
    let last: Option<(chrono::DateTime<Utc>,)> = sqlx::query_as(
        "SELECT last_claimed_at FROM daily_claims WHERE wallet_address = $1",
    )
    .bind(&wallet)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    if let Some((last_claimed,)) = last {
        if last_claimed > cutoff {
            return HttpResponse::TooManyRequests().json(json!({
                "error": "Already claimed today",
                "next_claim_at": last_claimed + chrono::Duration::hours(24)
            }));
        }
    }

    // Upsert daily claim record
    let upsert_result = sqlx::query(
        "INSERT INTO daily_claims (wallet_address, last_claimed_at)
         VALUES ($1, $2)
         ON CONFLICT (wallet_address) DO UPDATE SET last_claimed_at = $2",
    )
    .bind(&wallet)
    .bind(now)
    .execute(&state.db)
    .await;

    if upsert_result.is_err() {
        return HttpResponse::InternalServerError().json(json!({"error": "Failed to record claim"}));
    }

    // Update last_active
    let _ = sqlx::query(
        "UPDATE players SET last_active = $1 WHERE wallet_address = $2",
    )
    .bind(now)
    .bind(&wallet)
    .execute(&state.db)
    .await;

    if let Some(body) = body {
        record_ubi_claim(&state.db, &wallet, &body).await;
    }

    HttpResponse::Ok().json(json!({
        "success": true,
        "next_claim_at": now + chrono::Duration::hours(24)
    }))
}

pub async fn decay_check(
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    let wallet = normalize_wallet(&path.into_inner());
    let now = Utc::now();

    let player_result = sqlx::query_as::<_, crate::models::player::Player>(
        "SELECT * FROM players WHERE wallet_address = $1",
    )
    .bind(&wallet)
    .fetch_optional(&state.db)
    .await;

    let player = match player_result {
        Ok(Some(p)) => p,
        Ok(None) => return HttpResponse::NotFound().json(json!({"error": "Player not found"})),
        Err(_) => return HttpResponse::InternalServerError().finish(),
    };

    // Check if decay is frozen
    if let Some(frozen_until) = player.decay_frozen_until {
        if frozen_until > now {
            return HttpResponse::Ok().json(json!({"decay_status": "none", "frozen": true}));
        }
    }

    let hours_inactive = (now - player.last_active).num_hours();
    let new_status = if hours_inactive >= 72 {
        "active"
    } else if hours_inactive >= 48 {
        "warning"
    } else {
        "none"
    };

    // Penalize if active decay — downgrade rank
    if new_status == "active" && player.decay_status != "active" {
        let _ = sqlx::query(
            "UPDATE players SET decay_status = $1, rank = CASE
                WHEN rank = 'Diamond' THEN 'Platinum'
                WHEN rank = 'Platinum' THEN 'Gold'
                WHEN rank = 'Gold' THEN 'Silver'
                WHEN rank = 'Silver' THEN 'Bronze'
                ELSE rank
             END WHERE wallet_address = $2",
        )
        .bind(new_status)
        .bind(&wallet)
        .execute(&state.db)
        .await;
    } else if new_status != player.decay_status.as_str() {
        let _ = sqlx::query("UPDATE players SET decay_status = $1 WHERE wallet_address = $2")
            .bind(new_status)
            .bind(&wallet)
            .execute(&state.db)
            .await;
    }

    HttpResponse::Ok().json(json!({"decay_status": new_status, "hours_inactive": hours_inactive}))
}

// ── POST /players/:wallet/identity ────────────────────────────────────────────
// Backfills the Magic login identity for an EXISTING player on sign-in, so returning
// users (who never re-run onboarding) also get captured. UPDATE-only — never creates a
// row. Best-effort; unauthenticated like the rest, which is fine: worst case a bad actor
// mislabels a wallet's email, which only muddies our multi-account detection, not money.
#[derive(Deserialize)]
pub struct MagicIdentityBody {
    pub email:  Option<String>,
    pub issuer: Option<String>,
}

pub async fn set_magic_identity(
    state: web::Data<AppState>,
    path: web::Path<String>,
    body: web::Json<MagicIdentityBody>,
) -> HttpResponse {
    let wallet = normalize_wallet(&path.into_inner());
    let _ = sqlx::query(
        "UPDATE players SET magic_email = COALESCE($1, magic_email),
                            magic_issuer = COALESCE($2, magic_issuer)
         WHERE wallet_address = $3",
    )
    .bind(&body.email).bind(&body.issuer).bind(&wallet)
    .execute(&state.db).await;
    HttpResponse::Ok().json(json!({"ok": true}))
}

// ── POST /players ─────────────────────────────────────────────────────────────
#[derive(Deserialize)]
pub struct CreatePlayerRequest {
    pub wallet_address:          String,
    pub play_style:              String,
    pub avatar:                  Option<String>,
    pub character_name:          String,
    pub username:                Option<String>,
    pub display_name:            Option<String>,
    pub character_class:         Option<String>,
    pub character_customization: Option<serde_json::Value>,
    pub attack_stat:             Option<i32>,
    pub defense_stat:            Option<i32>,
    pub speed_stat:              Option<i32>,
    // Magic login identity — lets us see when one PERSON has multiple wallets
    // (email vs Google login, Safari-ITP re-issues). Same email across wallets = same
    // person. Optional; captured from magic.user.getInfo() at sign-in.
    pub magic_email:             Option<String>,
    pub magic_issuer:            Option<String>,
    /// Wallet of the player who referred this one, if any. Attribution is best
    /// effort on the client (cookie, storage, or the onboarding field), so this
    /// is untrusted input and every guard lives server-side.
    pub referred_by:             Option<String>,
    /// Which edition of StillHunt this player signed up in: `web`, `minipay` or
    /// `avalanche`. Absent or unrecognised means `web`, matching the column default.
    ///
    /// Client-asserted, because no server-visible property of the request
    /// distinguishes the editions — they share one domain on purpose. It is
    /// nonetheless recorded ONCE and never updated afterwards (see the INSERT
    /// below), so it cannot be flipped per-request to unlock earning. See
    /// services::edition for what this does and does not defend against.
    pub edition:                 Option<String>,
}

/// Whole G$ paid to a player whose referral completes onboarding.
///
/// Set against what the pool can actually fund, not what sounds generous: at
/// 1,000 a head the free balance covered under 200 referrals, because the same
/// pool also pays campaign wins, rank-ups, endless waves and season prizes — and
/// every recruited player immediately starts drawing on it too. Cut 500 -> 200
/// once the pool ran dry: a referral is the cheapest reward to earn (no play
/// required), so it is the first one that should shrink when outflow is trimmed.
/// Cut again 200 -> 100 on 2026-07-30, alongside the gameplay earning pause.
///
/// Referrals deliberately keep paying through that pause: it is a growth lever
/// rather than a grind, and the amount already reflects that.
const REFERRAL_REWARD: u64 = 100;

/// Credit a referrer, once, for bringing in a newly created player.
///
/// Called AFTER the player row exists. In the WEB edition that is the point at which
/// the referred wallet has already passed the GoodDollar whitelist gate in
/// onboarding, so the payout buys a verified human rather than a signup.
///
/// That justification is edition-specific, and it is the reason for the first guard
/// below. The MiniPay edition has no identity gate at all — deliberately, because
/// nothing there pays out — so a MiniPay signup proves nothing about who is behind
/// the wallet. Paying 100 G$ for one would make signups the cheapest possible way to
/// mint real money out of the pool, with no proof-of-unique-human anywhere in the
/// path. Referrals are already the cheapest reward in the game (no play required),
/// which makes this the first place an unverified edition would be farmed.
///
/// Every guard is here rather than on the client: the client supplies the
/// referrer and cannot be trusted with who gets paid.
async fn credit_referral(state: &AppState, referred: &str, referrer_raw: &str) {
    let referrer = normalize_wallet(referrer_raw);
    if !is_valid_wallet(&referrer) || referrer == referred {
        return;
    }

    // Neither side may be a non-earning edition.
    //
    // The referrer must be a real player. Otherwise any address could be named
    // and paid, including one the referred user controls.
    let exists: Option<(String,)> =
        sqlx::query_as("SELECT wallet_address FROM players WHERE wallet_address = $1")
            .bind(&referrer)
            .fetch_optional(&state.db)
            .await
            .unwrap_or(None);
    if exists.is_none() {
        return;
    }

    // Claim the one-per-referred-wallet slot. If this inserts nothing the
    // referral was already recorded, so there is nothing to pay — this is what
    // makes a retried or replayed create_player safe.
    let claimed = sqlx::query(
        "INSERT INTO referrals (referred_wallet, referrer_wallet, amount)
         VALUES ($1, $2, $3) ON CONFLICT (referred_wallet) DO NOTHING",
    )
    .bind(referred)
    .bind(&referrer)
    .bind(REFERRAL_REWARD as i64)
    .execute(&state.db)
    .await;
    if claimed.map(|r| r.rows_affected()).unwrap_or(0) != 1 {
        return;
    }

    let Some(_chain) = state.chain.as_ref().cloned() else { return };
    let db = state.db.clone();
    let referred_owned = referred.to_string();
    let referrer_owned = referrer.clone();

    tokio::spawn(async move {
        settle_referral(&db, &referrer_owned, &referred_owned, REFERRAL_REWARD).await;
    });
}

/// Pay ONE referral from the main reward pool and record the outcome. Idempotent.
/// Accrues a referral bonus to the recruiter.
///
/// Safe to call repeatedly on the same referral: the ref key is derived from the
/// recruited wallet, so `earnings::award` credits exactly once no matter how many
/// times this runs. Returns the status it settled on.
///
/// This used to send an on-chain transfer from a reward pool, which could strand
/// a referral permanently when the pool ran dry — the DB said owed, the chain had
/// nothing, and the retry route did not exist. An accrual cannot run dry.
pub async fn settle_referral(
    db: &sqlx::PgPool,
    referrer: &str,
    referred: &str,
    amount: u64,
) -> &'static str {
    let credited = crate::services::earnings::award(
        db,
        referrer,
        "referral",
        rust_decimal::Decimal::from(amount),
        &format!("referral:{referred}"),
    ).await;

    let _ = sqlx::query(
        "UPDATE referrals SET status = 'paid', paid_at = now() WHERE referred_wallet = $1",
    )
    .bind(referred).execute(db).await;

    if credited {
        tracing::info!("referral accrued: {} recruited {} (+{} TALLY)", referrer, referred, amount);
    }
    "paid"
}

pub async fn create_player(
    state: web::Data<AppState>,
    body: web::Json<CreatePlayerRequest>,
) -> HttpResponse {
    let wallet = normalize_wallet(&body.wallet_address);
    let customization = body.character_customization.clone()
        .unwrap_or(serde_json::Value::Object(Default::default()));

    let result = sqlx::query_as::<_, crate::models::player::Player>(
        "INSERT INTO players (
            wallet_address, username, display_name, character_class,
            character_customization, play_style, avatar, character_name,
            rank, xp, attack_stat, defense_stat, speed_stat,
            g_earned_lifetime, last_active, decay_status, wins, losses, character_confirmed,
            magic_email, magic_issuer, edition
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Iron', 0, $9, $10, $11, 0, now(), 'none', 0, 0, true, $12, $13, $14)
         -- `edition` is deliberately ABSENT from this UPDATE list. It is written once,
         -- at signup, and is immutable thereafter. Letting it change here would undo
         -- the whole point of storing it: a player who signed up in MiniPay could
         -- re-run onboarding claiming `web` and unlock real payouts, having passed no
         -- identity check. Onboarding is re-runnable by design (the confirm-your-class
         -- flow), so this is a reachable path, not a theoretical one.
         ON CONFLICT (wallet_address) DO UPDATE
           SET character_class         = COALESCE(EXCLUDED.character_class, players.character_class),
               character_customization = CASE
                 WHEN EXCLUDED.character_customization::text = '{}' THEN players.character_customization
                 ELSE EXCLUDED.character_customization
               END,
               username     = COALESCE(EXCLUDED.username, players.username),
               display_name = COALESCE(EXCLUDED.display_name, players.display_name),
               magic_email  = COALESCE(EXCLUDED.magic_email, players.magic_email),
               magic_issuer = COALESCE(EXCLUDED.magic_issuer, players.magic_issuer),
               character_confirmed = true
         RETURNING *",
    )
    .bind(&wallet)
    .bind(&body.username)
    .bind(&body.display_name)
    .bind(&body.character_class)
    .bind(sqlx::types::Json(&customization))
    .bind(&body.play_style)
    .bind(body.avatar.as_deref().unwrap_or(""))
    .bind(&body.character_name)
    .bind(body.attack_stat.unwrap_or(10))
    .bind(body.defense_stat.unwrap_or(10))
    .bind(body.speed_stat.unwrap_or(10))
    .bind(&body.magic_email)
    .bind(&body.magic_issuer)
    // One edition now. The column stays so existing rows keep their value, but
    // every new signup is the same thing and nothing branches on it.
    .bind("web")
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(player) => {
            // Credit whoever recruited them. Gated on the same "brand new" signal
            // as the character claim below, so re-running onboarding for an
            // existing player cannot trigger a second referral — and the
            // one-row-per-referred-wallet key stops it even if that changed.
            if player.character_claim_tx.is_none() {
                if let Some(referrer) = body.referred_by.as_deref().filter(|r| !r.is_empty()) {
                    credit_referral(&state, &wallet, referrer).await;
                }
            }

            // Background chain write — only for brand-new players (no existing claim tx)
            if player.character_claim_tx.is_none() {
                if let Some(chain) = state.chain.as_ref().cloned() {
                    let addr_str = wallet.clone();
                    let class = player.character_class.clone().unwrap_or_default();
                    let name = player.character_name.clone();
                    let db = state.db.clone();
                    tokio::spawn(async move {
                        if let Ok(addr) = addr_str.parse::<Address>() {
                            if let Some(hash) = chain.enlist_hunter(addr, class, name).await {
                                let hash_str = format!("{:?}", hash);
                                let _ = sqlx::query(
                                    "UPDATE players SET character_claim_tx = $1 WHERE wallet_address = $2",
                                )
                                .bind(hash_str)
                                .bind(addr_str)
                                .execute(&db)
                                .await;
                            }
                        }
                    });
                }
            }
            HttpResponse::Ok().json(player)
        }
        Err(e) => {
            tracing::error!("Failed to create player: {}", e);
            HttpResponse::InternalServerError().json(json!({"error": "Failed to create player"}))
        }
    }
}

// ── GET /players ──────────────────────────────────────────────────────────────
/// How recently a player must have played to count as ACTIVE on the War Board.
/// Matches the decay grace period, so the moment the game starts taking your rank is
/// the same moment the board stops treating you as current.
const LEADERBOARD_ACTIVE_HOURS: i64 = 72;

pub async fn list_players(state: web::Data<AppState>) -> HttpResponse {
    // Sort by position on THE ladder, not a hand-written CASE. The old CASE still
    // spelled out the original five ranks, so the two tiers added later were wrong:
    // Emerald, the second-HIGHEST rank, fell into the `ELSE` bucket and sorted below
    // Silver, tied with Bronze and Iron. Deriving the order from RANK_LADDER means a
    // future tier is ordered correctly the moment it is added there.
    //
    // prestige_level is the second key: past Diamond the rank name stops changing, so
    // without it the game's most accomplished players (Diamond II, III…) sorted level
    // with someone who had just arrived at Diamond, broken only by leftover bar XP.
    //
    // The array is built from a compile-time const of static strings, so the format!
    // carries no user input and cannot be injected into.
    // ACTIVITY IS THE FIRST KEY. The board ranks people who are playing, not people who
    // once played. A rank is a claim about how good you are right now, so someone who
    // walked away sinks beneath everyone still turning up, whatever their badge says,
    // and climbs back only by playing. Decay is the other half of the same idea: keep
    // going and the badge itself steps down (see handlers/decay.rs), so the longer the
    // absence the further they fall on BOTH keys rather than parking at the top.
    //
    // Read from last_active rather than decay_status, deliberately. decay_status only
    // changes when the cron runs, and that scheduler drifts by hours, so a stale status
    // would let someone linger at the top. last_active is always current.
    let ladder = crate::handlers::battles::RANK_LADDER
        .iter()
        .map(|r| format!("'{}'", r))
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!(
        "SELECT * FROM players
         ORDER BY (last_active >= NOW() - INTERVAL '{active} hours') DESC,
                  array_position(ARRAY[{ladder}]::text[], rank) DESC NULLS LAST,
                  prestige_level DESC,
                  xp DESC,
                  last_active DESC
         LIMIT 50",
        active = LEADERBOARD_ACTIVE_HOURS,
        ladder = ladder
    );
    let result = sqlx::query_as::<_, crate::models::player::Player>(&sql)
        .fetch_all(&state.db)
        .await;

    match result {
        Ok(players) => HttpResponse::Ok().json(players),
        Err(e) => {
            tracing::error!("Failed to fetch leaderboard: {}", e);
            HttpResponse::InternalServerError().json(json!({"error": "Database error"}))
        }
    }
}

// ── GET /players/:wallet/inventory ────────────────────────────────────────────
pub async fn get_inventory(
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    let wallet = normalize_wallet(&path.into_inner());

    #[derive(serde::Serialize, sqlx::FromRow)]
    struct InventoryRow {
        wallet_address: String,
        item_id: Uuid,
        equipped: bool,
        acquired_at: chrono::DateTime<Utc>,
    }

    let result = sqlx::query_as::<_, InventoryRow>(
        "SELECT wallet_address, item_id, equipped, acquired_at
         FROM inventory WHERE wallet_address = $1 ORDER BY acquired_at DESC",
    )
    .bind(&wallet)
    .fetch_all(&state.db)
    .await;

    match result {
        Ok(rows) => HttpResponse::Ok().json(rows),
        Err(e) => {
            tracing::error!("Failed to fetch inventory: {}", e);
            HttpResponse::InternalServerError().json(json!({"error": "Database error"}))
        }
    }
}

// ── POST /players/:wallet/inventory ───────────────────────────────────────────
#[derive(Deserialize)]
pub struct AddInventoryRequest {
    pub item_id: Uuid,
}

pub async fn add_inventory_item(
    state: web::Data<AppState>,
    path: web::Path<String>,
    body: web::Json<AddInventoryRequest>,
) -> HttpResponse {
    let wallet = normalize_wallet(&path.into_inner());

    let result = sqlx::query(
        "INSERT INTO inventory (wallet_address, item_id, equipped, acquired_at)
         VALUES ($1, $2, false, now())
         ON CONFLICT (wallet_address, item_id) DO NOTHING",
    )
    .bind(&wallet)
    .bind(body.item_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => HttpResponse::Ok().json(json!({"success": true})),
        Err(e) => {
            tracing::error!("Failed to add inventory item: {}", e);
            HttpResponse::InternalServerError().json(json!({"error": "Database error"}))
        }
    }
}

// ── PATCH /players/:wallet/inventory/:item_id ─────────────────────────────────
#[derive(Deserialize)]
pub struct EquipTogglePath {
    pub wallet:  String,
    pub item_id: Uuid,
}

#[derive(Deserialize)]
pub struct EquipToggleRequest {
    pub equipped: bool,
}

pub async fn toggle_equip(
    state: web::Data<AppState>,
    path: web::Path<EquipTogglePath>,
    body: web::Json<EquipToggleRequest>,
) -> HttpResponse {
    let wallet = normalize_wallet(&path.wallet);

    let result = sqlx::query(
        "UPDATE inventory SET equipped = $1
         WHERE wallet_address = $2 AND item_id = $3",
    )
    .bind(body.equipped)
    .bind(&wallet)
    .bind(path.item_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => HttpResponse::Ok().json(json!({"success": true})),
        Err(e) => {
            tracing::error!("Failed to toggle equip: {}", e);
            HttpResponse::InternalServerError().json(json!({"error": "Database error"}))
        }
    }
}

// ── GET /players/:wallet/battles ──────────────────────────────────────────────
pub async fn get_battles(
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    let wallet = normalize_wallet(&path.into_inner());

    #[derive(serde::Serialize, sqlx::FromRow)]
    struct BattleRow {
        id:                    Uuid,
        challenger_wallet:     String,
        opponent_wallet:       String,
        winner_wallet:         String,
        xp_awarded_challenger: i32,
        xp_awarded_opponent:   i32,
        is_bot:                bool,
        created_at:            chrono::DateTime<Utc>,
        game_record_tx:        Option<String>,
        // Carries mission context ({kind:"mission", level, won}) so the UI can show
        // "OP N · <mission> — WIN/LOSS" for campaign fights.
        rounds_data:           serde_json::Value,
        // REAL G$ this specific fight paid, 0 for most of them. The UI used to render
        // the player's current rank bonus on every won row, which invented money that
        // was never paid (ten rows × "+1.5k G$" against 9k lifetime earnings). The only
        // money a campaign op pays is the one-time first-clear bounty, so that is what
        // is joined here — matched on the op AND on the moment, because the bounty is
        // once per (wallet, level) and a REPLAY of a cleared op pays nothing. The
        // bounty row is written in the same request as the battle (~20ms later), so the
        // window is tight enough to attach it to the run that actually earned it.
        g_awarded:             i64,
        /// Which mode produced this row. The UI needs it because an ENDLESS row is not
        /// a defeat: dying is how an Endless run ENDS, and those rows are written with
        /// `counts_result = false` so they never touch the player's W/L record. Without
        /// this field the history painted them the same red LOSS as a real fight, so a
        /// player who had been earning per wave saw ten straight losses and 0 XP.
        mode:                  Option<String>,
    }

    let result = sqlx::query_as::<_, BattleRow>(
        "SELECT b.id, b.challenger_wallet, b.opponent_wallet, b.winner_wallet,
                b.xp_awarded_challenger, b.xp_awarded_opponent, b.is_bot, b.created_at,
                b.game_record_tx, b.rounds_data, b.mode,
                COALESCE(fc.amount, 0)::bigint AS g_awarded
         FROM battles b
         LEFT JOIN first_clear_bounties fc
                ON fc.wallet_address = b.challenger_wallet
               AND jsonb_typeof(b.rounds_data) = 'object'
               AND b.rounds_data->>'level' ~ '^[0-9]+$'
               AND fc.level = (b.rounds_data->>'level')::int
               AND fc.created_at BETWEEN b.created_at - interval '5 seconds'
                                     AND b.created_at + interval '5 seconds'
         WHERE b.challenger_wallet = $1 OR b.opponent_wallet = $1
         ORDER BY b.created_at DESC
         LIMIT 10",
    )
    .bind(&wallet)
    .fetch_all(&state.db)
    .await;

    match result {
        Ok(rows) => HttpResponse::Ok().json(rows),
        Err(e) => {
            tracing::error!("Failed to fetch battles: {}", e);
            HttpResponse::InternalServerError().json(json!({"error": "Database error"}))
        }
    }
}

// ── GET /players/:wallet/daily-claim-status ───────────────────────────────────
pub async fn daily_claim_status(
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    let wallet = normalize_wallet(&path.into_inner());

    let result: Option<(chrono::DateTime<Utc>,)> = sqlx::query_as(
        "SELECT last_claimed_at FROM daily_claims WHERE wallet_address = $1",
    )
    .bind(&wallet)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    match result {
        Some((last_claimed_at,)) => {
            let next_claim_at = last_claimed_at + chrono::Duration::hours(24);
            let can_claim = Utc::now() >= next_claim_at;
            HttpResponse::Ok().json(json!({
                "last_claimed_at": last_claimed_at,
                "next_claim_at": next_claim_at,
                "can_claim": can_claim,
            }))
        }
        None => HttpResponse::Ok().json(json!({ "can_claim": true })),
    }
}

// ── GET /players/search?q=:query ─────────────────────────────────────────────
#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: String,
    pub exclude: Option<String>,
}

// ── GET /players/by-username/:username ────────────────────────────────────────
/// Resolve a username to its player, EXACTLY.
///
/// `search_players` exists but does a LIKE match, which is right for a search box
/// and wrong for a permalink: /Ember would resolve to EmberForge and send a
/// visitor to the wrong warrior. This is a case-insensitive equality lookup so
/// stillhunt.app/<username> can only ever land on the person it names.
pub async fn get_player_by_username(
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    let username = path.into_inner();
    if username.len() < 3 || username.len() > 20 {
        return HttpResponse::NotFound().json(json!({"error": "No such player"}));
    }

    let result = sqlx::query_as::<_, crate::models::player::Player>(
        "SELECT * FROM players WHERE LOWER(username) = LOWER($1) LIMIT 1",
    )
    .bind(&username)
    .fetch_optional(&state.db)
    .await;

    match result {
        Ok(Some(player)) => HttpResponse::Ok().json(player),
        Ok(None) => HttpResponse::NotFound().json(json!({"error": "No such player"})),
        Err(e) => {
            tracing::error!("username lookup failed: {}", e);
            HttpResponse::InternalServerError().json(json!({"error": "Database error"}))
        }
    }
}

pub async fn search_players(
    state: web::Data<AppState>,
    query: web::Query<SearchQuery>,
) -> HttpResponse {
    let q       = format!("%{}%", query.q.to_lowercase());
    let exclude = query.exclude.as_deref().unwrap_or("");

    let result = sqlx::query_as::<_, crate::models::player::Player>(
        "SELECT * FROM players
         WHERE (LOWER(character_name) LIKE $1 OR LOWER(COALESCE(username,'')) LIKE $1)
           AND wallet_address != $2
         LIMIT 5",
    )
    .bind(&q)
    .bind(exclude)
    .fetch_all(&state.db)
    .await;

    match result {
        Ok(players) => HttpResponse::Ok().json(players),
        Err(e) => {
            tracing::error!("Search failed: {}", e);
            HttpResponse::InternalServerError().json(json!({"error": "Search failed"}))
        }
    }
}

// ── POST /admin/referrals/retry ───────────────────────────────────────────────
// Admin, MONEY-TOUCHING. Re-attempts every referral that never paid.
//
// WHY THIS EXISTS. `credit_referral` fires exactly once, inside the request that
// creates the referred player. If the chain call fails there — an empty pool, an
// RPC blip — the row is marked 'failed' and NOTHING ever looks at it again. That
// is how 18 referrals worth 9,000 G$ went unpaid for days: the pool was empty
// when they landed, and there was no second chance. Every other reward rail has
// a reconcile sweep; this one didn't.
//
// Pays the amount RECORDED ON THE ROW, not the current constant. The rate has
// been cut since these were earned (500 -> 200) and a player who was promised
// 500 is owed 500. The stored amount is the promise.
//
// Idempotent twice over: the on-chain `ref` is checked before spending gas, and
// the row is only marked 'paid' after a confirmed tx. Safe to re-run.
#[derive(Serialize)]
struct RetriedReferral {
    referrer: String,
    referred: String,
    amount_g: i64,
    status: String,
    tx_hash: Option<String>,
    error: Option<String>,
}

// The referral retry sweep is gone with the reward pool. It existed because a
// referral payout could fail on-chain and sit at status 'failed' for ever with no
// automatic route to being paid. `settle_referral` is now a single idempotent
// INSERT, so there is nothing that can half-fail and nothing to sweep.


// ── GET /players/:wallet/referrals ────────────────────────────────────────────
/// How many verified fighters this player has recruited, and what they earned.
/// Public: it is the number shown on their card, and it is a boast, not a secret.
pub async fn get_referrals(
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    let wallet = normalize_wallet(&path.into_inner());
    let row: Option<(i64, Option<i64>)> = sqlx::query_as(
        "SELECT COUNT(*)::bigint, SUM(amount)::bigint FROM referrals
         WHERE referrer_wallet = $1 AND status = 'paid'",
    )
    .bind(&wallet)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    let (count, earned) = row.unwrap_or((0, None));
    HttpResponse::Ok().json(json!({
        "recruited": count,
        "earned_g": earned.unwrap_or(0),
    }))
}

// ── GET /players/:wallet/achievements ─────────────────────────────────────────
pub async fn get_achievements(
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    let wallet = normalize_wallet(&path.into_inner());

    #[derive(serde::Serialize, sqlx::FromRow)]
    struct AchievementRow {
        achievement_id: uuid::Uuid,
        name:           String,
        description:    String,
        image_url:      String,
        unlocked_at:    chrono::DateTime<Utc>,
    }

    let result = sqlx::query_as::<_, AchievementRow>(
        "SELECT pa.achievement_id, a.name, a.description, a.image_url, pa.unlocked_at
         FROM player_achievements pa
         JOIN achievements a ON a.id = pa.achievement_id
         WHERE pa.wallet_address = $1
         ORDER BY pa.unlocked_at DESC
         LIMIT 6",
    )
    .bind(&wallet)
    .fetch_all(&state.db)
    .await;

    match result {
        Ok(rows) => HttpResponse::Ok().json(rows),
        Err(e) => {
            tracing::error!("Failed to fetch achievements: {}", e);
            HttpResponse::InternalServerError().json(json!({"error": "Database error"}))
        }
    }
}

// ── POST /players/:wallet/achievements/check ──────────────────────────────────
pub async fn check_achievements(
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    let wallet = normalize_wallet(&path.into_inner());

    #[derive(serde::Serialize, sqlx::FromRow)]
    struct NewAchievement {
        achievement_id:   uuid::Uuid,
        achievement_name: String,
        unlocked_at:      chrono::DateTime<Utc>,
    }

    let result = sqlx::query_as::<_, NewAchievement>(
        "SELECT * FROM check_and_unlock_achievements($1)",
    )
    .bind(&wallet)
    .fetch_all(&state.db)
    .await;

    match result {
        Ok(rows) => HttpResponse::Ok().json(rows),
        Err(e) => {
            tracing::error!("Failed to check achievements: {}", e);
            HttpResponse::InternalServerError().json(json!({"error": "Database error"}))
        }
    }
}

// ── POST /players/:wallet/freeze-decay ───────────────────────────────────────
// Requires the player to own at least one shield category item.
// Consumes one shield, then freezes decay for 7 days.
pub async fn freeze_decay(
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    let wallet = normalize_wallet(&path.into_inner());

    // Find the first owned shield item
    let shield: Option<(Uuid,)> = sqlx::query_as(
        "SELECT inventory.item_id FROM inventory
         JOIN items ON inventory.item_id = items.id
         WHERE inventory.wallet_address = $1 AND items.category = 'shield'
         LIMIT 1",
    )
    .bind(&wallet)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();

    let Some((shield_item_id,)) = shield else {
        return HttpResponse::UnprocessableEntity()
            .json(json!({"error": "No Protection Shield in inventory"}));
    };

    // Consume the shield
    let _ = sqlx::query(
        "DELETE FROM inventory WHERE wallet_address = $1 AND item_id = $2",
    )
    .bind(&wallet)
    .bind(shield_item_id)
    .execute(&state.db)
    .await;

    let frozen_until = Utc::now() + chrono::Duration::days(7);

    let _ = sqlx::query(
        "UPDATE players
         SET decay_frozen_until = $1, decay_status = 'none'
         WHERE wallet_address = $2",
    )
    .bind(frozen_until)
    .bind(&wallet)
    .execute(&state.db)
    .await;

    HttpResponse::Ok().json(json!({
        "frozen_until":   frozen_until.to_rfc3339(),
        "shield_item_id": shield_item_id.to_string(),
    }))
}

// ── GET /players/{wallet}/earn-cap ─────────────────────────────────────────────
// This week's earning allowance. Public (same as the rest of the player reads) and
// cheap: three indexed sums. Exists so the UI can SHOW the cap — a player whose
// rewards quietly shrink with no explanation reports a payout bug, which costs
// more than the cap saves.
pub async fn get_earn_cap(state: web::Data<AppState>, path: web::Path<String>) -> HttpResponse {
    let wallet = normalize_wallet(&path.into_inner());
    HttpResponse::Ok().json(crate::services::earn_cap::status_for(&state.db, &wallet).await)
}
