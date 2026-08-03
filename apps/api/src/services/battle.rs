use rand::Rng;
use serde::{Deserialize, Serialize};
use std::time::Instant;

use crate::models::player::Player;

const BATTLE_ROUNDS: u32 = 5;
const MAX_HP: i32 = 100;
const XP_WIN: i32 = 100;
const XP_LOSS: i32 = 30;

/// Base XP for a single fight, win or loss — the one source the turn-based bot
/// fight and the real-time fighter both award from.
pub fn fight_xp(won: bool) -> i32 {
    if won { XP_WIN } else { XP_LOSS }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoundData {
    pub round: u32,
    pub challenger_move: String,
    pub opponent_move: String,
    pub challenger_damage: i32,
    pub opponent_damage: i32,
    pub challenger_hp: i32,
    pub opponent_hp: i32,
}

/// Round shape returned to the client — field names match the frontend BattleRoundResult interface.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BattleRoundResponse {
    pub round:      u32,
    pub player_move: String,
    pub bot_move:   String,
    pub player_dmg: i32,
    pub bot_dmg:    i32,
    pub player_hp:  i32,
    pub bot_hp:     i32,
}

pub struct AsyncFightResult {
    pub challenger_won: bool,
    pub xp_challenger: i32,
    pub xp_opponent: i32,
    pub rounds: Vec<RoundData>,
}

/// A character's combat class. Drives each side's "special" move mechanics.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CharacterClass {
    Berserker,
    Sentinel,
    Phantom,
}

impl CharacterClass {
    /// Maps a player's stored `character_class` to a combat class. Unknown or
    /// legacy values (Warden, Specter, Vanguard, NULL, etc.) default to Sentinel,
    /// matching the DB default in migration 003_fix_classes.sql.
    pub fn from_db(value: Option<&str>) -> Self {
        match value {
            Some("Berserker") => CharacterClass::Berserker,
            Some("Phantom") => CharacterClass::Phantom,
            _ => CharacterClass::Sentinel,
        }
    }

    /// Picks a random class different from `exclude` — used to assign the bot's class.
    pub fn random_excluding(exclude: CharacterClass, rng: &mut impl Rng) -> CharacterClass {
        let options: [CharacterClass; 2] = match exclude {
            CharacterClass::Berserker => [CharacterClass::Sentinel, CharacterClass::Phantom],
            CharacterClass::Sentinel  => [CharacterClass::Berserker, CharacterClass::Phantom],
            CharacterClass::Phantom   => [CharacterClass::Berserker, CharacterClass::Sentinel],
        };
        options[rng.random_range(0..options.len())]
    }
}

fn bot_stats_for_rank(rank: &str) -> (i32, i32) {
    match rank {
        "Iron" => (8, 8),
        "Bronze" => (10, 10),
        "Silver" => (15, 15),
        "Gold" => (20, 20),
        "Platinum" => (25, 25),
        "Emerald" => (28, 28),
        "Diamond" => (30, 30),
        _ => (10, 10),
    }
}

/// Damage formula with RNG variance.
/// `incoming_mult`: the defender's damage multiplier this round (1.0 normal,
/// 0.5 defending, 0.0 absorbing — absorb short-circuits to 0 damage).
/// `ignore_defense`: when true, the defender's `defense_stat` is excluded from
/// the stat modifier (Phantom's "bypass enemy defense").
fn calc_damage_v2(attack: i32, defense: i32, base: f64, ignore_defense: bool, incoming_mult: f64, rng: &mut impl Rng) -> i32 {
    if incoming_mult <= 0.0 {
        return 0;
    }
    let variance = base * 0.2 * (rng.random::<f64>() * 2.0 - 1.0);
    let effective_defense = if ignore_defense { 0 } else { defense };
    let stat_mod = 1.0 + (attack - effective_defense) as f64 * 0.01;
    ((base + variance) * stat_mod * incoming_mult).max(1.0) as i32
}

/// Deterministic damage calculation for testing — no RNG variance.
/// See `calc_damage_v2` for parameter semantics.
pub fn calc_damage_det(attack: i32, defense: i32, base: f64, ignore_defense: bool, incoming_mult: f64) -> i32 {
    if incoming_mult <= 0.0 {
        return 0;
    }
    let effective_defense = if ignore_defense { 0 } else { defense };
    let stat_mod = 1.0 + (attack - effective_defense) as f64 * 0.01;
    (base * stat_mod * incoming_mult).max(1.0) as i32
}

fn pick_move(rng: &mut impl Rng, special_used: bool) -> (String, bool, bool) {
    let roll: f64 = rng.random();
    if !special_used && roll > 0.85 {
        ("special".into(), true, false)
    } else if roll > 0.5 {
        ("defend".into(), false, true)
    } else {
        ("attack".into(), false, false)
    }
}

/// The mechanical effect of a chosen move for a given class — drives both this
/// side's outgoing damage and how it mitigates the opponent's incoming damage.
struct MoveEffect {
    /// Base damage for the standard formula. `None` for Sentinel's special,
    /// whose outgoing damage is computed via the reflect formula instead.
    base: Option<f64>,
    /// This side's incoming-damage multiplier this round (1.0 normal, 0.5
    /// defend, 0.0 Sentinel absorb).
    incoming_mult: f64,
    /// Phantom special: ignore the opponent's `defense_stat` entirely.
    ignore_opponent_defense: bool,
    /// Phantom special: ignore the opponent's defend/absorb mitigation —
    /// their `incoming_mult` is treated as 1.0 against this attack.
    bypass_opponent_mitigation: bool,
    /// Sentinel special: outgoing damage is "reflect" — half of what the
    /// opponent's normal attack would have dealt.
    is_sentinel_reflect: bool,
}

fn move_effect(mv: &str, class: CharacterClass) -> MoveEffect {
    if mv == "special" {
        return match class {
            CharacterClass::Berserker => MoveEffect {
                base: Some(60.0), incoming_mult: 1.0,
                ignore_opponent_defense: false, bypass_opponent_mitigation: false, is_sentinel_reflect: false,
            },
            CharacterClass::Sentinel => MoveEffect {
                base: None, incoming_mult: 0.0,
                ignore_opponent_defense: false, bypass_opponent_mitigation: false, is_sentinel_reflect: true,
            },
            CharacterClass::Phantom => MoveEffect {
                base: Some(40.0), incoming_mult: 1.0,
                ignore_opponent_defense: true, bypass_opponent_mitigation: true, is_sentinel_reflect: false,
            },
        };
    }
    if mv == "defend" {
        return MoveEffect {
            base: Some(20.0), incoming_mult: 0.5,
            ignore_opponent_defense: false, bypass_opponent_mitigation: false, is_sentinel_reflect: false,
        };
    }
    // "attack" and any other value
    MoveEffect {
        base: Some(20.0), incoming_mult: 1.0,
        ignore_opponent_defense: false, bypass_opponent_mitigation: false, is_sentinel_reflect: false,
    }
}

pub struct RoundOutcome {
    pub player_dmg: i32,
    pub bot_dmg: i32,
    pub new_player_hp: i32,
    pub new_bot_hp: i32,
}

/// Resolves a single round given both sides' moves, classes and stats.
/// `calc` computes damage for one side — pass `calc_damage_v2` (with RNG) in
/// production or `calc_damage_det` for deterministic tests.
#[allow(clippy::too_many_arguments)]
pub fn resolve_round(
    player_move: &str, player_class: CharacterClass, player_atk: i32, player_def: i32, player_hp: i32,
    bot_move: &str, bot_class: CharacterClass, bot_atk: i32, bot_def: i32, bot_hp: i32,
    mut calc: impl FnMut(i32, i32, f64, bool, f64) -> i32,
) -> RoundOutcome {
    let player_effect = move_effect(player_move, player_class);
    let bot_effect    = move_effect(bot_move, bot_class);

    // Outgoing damage: player -> bot
    let player_dmg = if player_effect.is_sentinel_reflect {
        let basis = calc(bot_atk, player_def, 20.0, bot_effect.ignore_opponent_defense, 1.0);
        ((basis as f64) * 0.5).floor() as i32
    } else {
        let bot_incoming = if player_effect.bypass_opponent_mitigation { 1.0 } else { bot_effect.incoming_mult };
        calc(player_atk, bot_def, player_effect.base.unwrap(), player_effect.ignore_opponent_defense, bot_incoming)
    };

    // Outgoing damage: bot -> player
    let bot_dmg = if bot_effect.is_sentinel_reflect {
        let basis = calc(player_atk, bot_def, 20.0, player_effect.ignore_opponent_defense, 1.0);
        ((basis as f64) * 0.5).floor() as i32
    } else {
        let player_incoming = if bot_effect.bypass_opponent_mitigation { 1.0 } else { player_effect.incoming_mult };
        calc(bot_atk, player_def, bot_effect.base.unwrap(), bot_effect.ignore_opponent_defense, player_incoming)
    };

    // Phantom first strike: a lethal Phantom special KOs the opponent before they can act.
    let player_is_phantom_special = player_move == "special" && player_class == CharacterClass::Phantom;
    let bot_is_phantom_special    = bot_move    == "special" && bot_class    == CharacterClass::Phantom;

    let player_dmg = if bot_is_phantom_special && player_hp - bot_dmg <= 0 { 0 } else { player_dmg };
    let bot_dmg    = if player_is_phantom_special && bot_hp - player_dmg <= 0 { 0 } else { bot_dmg };

    RoundOutcome {
        player_dmg,
        bot_dmg,
        new_player_hp: (player_hp - bot_dmg).max(0),
        new_bot_hp:    (bot_hp - player_dmg).max(0),
    }
}

/// Server-side state for an in-progress real-time (live) fight. Issued by
/// `/battles/fight/start` and consumed once by `/battles/fight/complete`.
///
/// This is the anti-forgery anchor for the live earn loop: the wallet and the
/// Campaign level are fixed HERE by the server (the client can no longer assert
/// them at completion), the start time is server-measured (so a fight's real
/// duration can be validated instead of trusting a client-reported number), and
/// the `/start` handler enforces sequential Campaign unlock so an op can't be
/// skipped. Lives in `AppState::live_fight_sessions`.
pub struct LiveFightSession {
    pub wallet:     String,
    /// The Campaign op being played (1-based), or None for a non-Campaign fight.
    pub level:      Option<i32>,
    pub created_at: Instant,
}

/// Server-authoritative state for an in-progress Endless run. The server OWNS the wave
/// count — the client only asks "I cleared the next wave"; it can never assert a number
/// or skip ahead. Combined with a minimum time-per-wave, this is what makes it safe to
/// pay real G$ per wave. Lives in `AppState::endless_sessions`.
pub struct EndlessSession {
    pub wallet:       String,
    pub wave:         i32,      // highest wave the SERVER has credited (0 at start)
    /// The wave this session RESUMED at. The min-time-per-wave floor is measured from
    /// here, not from wave 1 — a player resuming at wave 50 has not been playing for
    /// 50 waves this session, and anchoring the floor absolutely would lock them out
    /// for minutes before their first credit.
    pub base_wave:    i32,
    /// Run start, as a WALL-CLOCK time rather than a monotonic Instant, so the
    /// session can be persisted and rehydrated after a restart. The
    /// min-seconds-per-wave floor is measured from here; keeping it absolute
    /// means a deploy cannot reset the floor and let a burst of impossible
    /// clears through.
    pub started_at:   chrono::DateTime<chrono::Utc>,
}

impl EndlessSession {
    /// Seconds since the run opened.
    pub fn elapsed_secs(&self) -> f64 {
        (chrono::Utc::now() - self.started_at).num_milliseconds().max(0) as f64 / 1000.0
    }
}

/// Server-side state for an in-progress bot fight, resolved one round at a time.
/// Lives in `AppState::bot_fight_sessions` for the lifetime of the fight.
pub struct BotFightSession {
    pub wallet:              String,
    pub player_class:        CharacterClass,
    pub bot_class:           CharacterClass,
    pub player_atk:          i32,
    pub player_def:          i32,
    pub bot_atk:             i32,
    pub bot_def:             i32,
    pub player_hp:           i32,
    pub bot_hp:              i32,
    pub player_special_used: bool,
    pub bot_special_used:    bool,
    pub round:               u32,
    pub rounds:              Vec<RoundData>,
    pub rounds_response:     Vec<BattleRoundResponse>,
    pub xp_multiplier:       i32,
    pub created_at:          Instant,
}

impl BotFightSession {
    /// `player` should already have item boosts applied (see `apply_item_boosts`).
    pub fn new(wallet: String, player: &Player, xp_multiplier: i32) -> Self {
        let mut rng = rand::rng();
        let player_class = CharacterClass::from_db(player.character_class.as_deref());
        let bot_class    = CharacterClass::random_excluding(player_class, &mut rng);
        let (bot_atk, bot_def) = bot_stats_for_rank(&player.rank);

        Self {
            wallet,
            player_class,
            bot_class,
            player_atk: player.attack_stat,
            player_def: player.defense_stat,
            bot_atk,
            bot_def,
            player_hp: MAX_HP,
            bot_hp: MAX_HP,
            player_special_used: false,
            bot_special_used: false,
            round: 0,
            rounds: Vec::new(),
            rounds_response: Vec::new(),
            xp_multiplier,
            created_at: Instant::now(),
        }
    }

    /// Resolves the next round given the player's move, mutates HP/round/special
    /// state, records the round for persistence, and returns the round result.
    pub fn play_round(&mut self, player_move: &str) -> BattleRoundResponse {
        let mut rng = rand::rng();
        let (bot_move, bot_is_special, _) = pick_move(&mut rng, self.bot_special_used);

        let outcome = resolve_round(
            player_move, self.player_class, self.player_atk, self.player_def, self.player_hp,
            &bot_move,   self.bot_class,    self.bot_atk,    self.bot_def,    self.bot_hp,
            |atk, def, base, ignore_def, mult| calc_damage_v2(atk, def, base, ignore_def, mult, &mut rng),
        );

        self.player_hp = outcome.new_player_hp;
        self.bot_hp    = outcome.new_bot_hp;
        if player_move == "special" { self.player_special_used = true; }
        if bot_is_special { self.bot_special_used = true; }
        self.round += 1;

        self.rounds.push(RoundData {
            round:             self.round,
            challenger_move:   player_move.to_string(),
            opponent_move:     bot_move.clone(),
            challenger_damage: outcome.player_dmg,
            opponent_damage:   outcome.bot_dmg,
            challenger_hp:     outcome.new_player_hp,
            opponent_hp:       outcome.new_bot_hp,
        });

        let response = BattleRoundResponse {
            round:      self.round,
            player_move: player_move.to_string(),
            bot_move,
            player_dmg: outcome.player_dmg,
            bot_dmg:    outcome.bot_dmg,
            player_hp:  outcome.new_player_hp,
            bot_hp:     outcome.new_bot_hp,
        };
        self.rounds_response.push(response.clone());
        response
    }

    pub fn is_final(&self) -> bool {
        self.round >= BATTLE_ROUNDS || self.player_hp <= 0 || self.bot_hp <= 0
    }

    pub fn challenger_won(&self) -> bool {
        self.player_hp >= self.bot_hp
    }

    pub fn xp_awarded(&self) -> i32 {
        if self.challenger_won() { XP_WIN } else { XP_LOSS }
    }
}

pub fn simulate_async_fight(challenger: &Player, opponent: &Player) -> AsyncFightResult {
    // Seed unused for now — rand::rng() provides sufficient variance for async fights
    let _seed: u64 = challenger.wallet_address.bytes().map(|b| b as u64).sum::<u64>()
        ^ opponent.wallet_address.bytes().map(|b| b as u64).sum::<u64>()
        ^ chrono::Utc::now().timestamp() as u64;

    let mut rng = rand::rng();
    let mut c_hp = MAX_HP;
    let mut o_hp = MAX_HP;
    let mut c_special = false;
    let mut o_special = false;
    let mut rounds = Vec::new();

    for round in 1..=BATTLE_ROUNDS {
        let (c_move, cs, cd) = pick_move(&mut rng, c_special);
        let (o_move, os, od) = pick_move(&mut rng, o_special);
        c_special = c_special || cs;
        o_special = o_special || os;

        let c_dmg = calc_damage_v2(challenger.attack_stat, opponent.defense_stat, if cs { 40.0 } else { 20.0 }, false, if od { 0.5 } else { 1.0 }, &mut rng);
        let o_dmg = calc_damage_v2(opponent.attack_stat, challenger.defense_stat, if os { 40.0 } else { 20.0 }, false, if cd { 0.5 } else { 1.0 }, &mut rng);

        o_hp = (o_hp - c_dmg).max(0);
        c_hp = (c_hp - o_dmg).max(0);

        rounds.push(RoundData {
            round,
            challenger_move: c_move,
            opponent_move: o_move,
            challenger_damage: c_dmg,
            opponent_damage: o_dmg,
            challenger_hp: c_hp,
            opponent_hp: o_hp,
        });

        if c_hp <= 0 || o_hp <= 0 {
            break;
        }
    }

    let challenger_won = c_hp >= o_hp;
    AsyncFightResult {
        challenger_won,
        xp_challenger: if challenger_won { XP_WIN } else { XP_LOSS },
        xp_opponent: if !challenger_won { XP_WIN } else { XP_LOSS },
        rounds,
    }
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use rust_decimal::Decimal;

    fn make_player(rank: &str, atk: i32, def: i32) -> Player {
        Player {
            wallet_address:          "0xtest".into(),
            username:                None,
            display_name:            None,
            character_class:         Some("Berserker".into()),
            character_customization: serde_json::json!({}),
            play_style:              "Fighter".into(),
            avatar:                  "⚔️".into(),
            character_name:          "TestWarrior".into(),
            rank:                    rank.into(),
            xp:                      0,
            attack_stat:             atk,
            defense_stat:            def,
            speed_stat:              9,
            g_earned_lifetime:       Decimal::ZERO,
            last_active:             Utc::now(),
            decay_status:            "none".into(),
            decay_frozen_until:      None,
            wins:                    0,
            losses:                  0,
            pve_level:               0,
            prestige_level:          0,
            character_confirmed:     true,
            created_at:              Utc::now(),
            character_claim_tx:      None,
        }
    }

    fn det(atk: i32, def: i32, base: f64, ignore_def: bool, mult: f64) -> i32 {
        calc_damage_det(atk, def, base, ignore_def, mult)
    }

    // ── calc_damage_det tests ─────────────────────────────────────────────────

    #[test]
    fn damage_is_at_least_one() {
        assert!(calc_damage_det(1, 100, 20.0, false, 1.0) >= 1);
    }

    #[test]
    fn special_hits_harder_than_normal() {
        let normal  = calc_damage_det(10, 10, 20.0, false, 1.0);
        let special = calc_damage_det(10, 10, 40.0, false, 1.0);
        assert!(special > normal, "special ({}) should exceed normal ({})", special, normal);
    }

    #[test]
    fn defending_halves_damage() {
        let undefended = calc_damage_det(10, 10, 20.0, false, 1.0);
        let defended   = calc_damage_det(10, 10, 20.0, false, 0.5);
        assert!(defended <= undefended / 2 + 1, "defended ({}) should be ~half of undefended ({})", defended, undefended);
    }

    #[test]
    fn higher_attack_deals_more_damage() {
        let strong = calc_damage_det(25, 5, 20.0, false, 1.0);
        let weak   = calc_damage_det(5, 25, 20.0, false, 1.0);
        assert!(strong > weak);
    }

    #[test]
    fn absorb_results_in_zero_damage() {
        assert_eq!(calc_damage_det(25, 5, 20.0, false, 0.0), 0);
    }

    #[test]
    fn ignore_defense_removes_defense_stat_from_modifier() {
        let with_defense    = calc_damage_det(20, 15, 40.0, false, 1.0);
        let without_defense = calc_damage_det(20, 15, 40.0, true,  1.0);
        assert!(without_defense > with_defense);
    }

    // ── bot_stats_for_rank ────────────────────────────────────────────────────

    #[test]
    fn bot_stats_scale_with_rank() {
        let (b_atk, _) = bot_stats_for_rank("Bronze");
        let (s_atk, _) = bot_stats_for_rank("Silver");
        let (g_atk, _) = bot_stats_for_rank("Gold");
        assert!(b_atk < s_atk && s_atk < g_atk);
    }

    #[test]
    fn unknown_rank_falls_back_to_bronze() {
        let (atk, def) = bot_stats_for_rank("Unknown");
        assert_eq!(atk, 10);
        assert_eq!(def, 10);
    }

    // ── CharacterClass ────────────────────────────────────────────────────────

    #[test]
    fn unknown_class_defaults_to_sentinel() {
        assert_eq!(CharacterClass::from_db(None), CharacterClass::Sentinel);
        assert_eq!(CharacterClass::from_db(Some("Warden")), CharacterClass::Sentinel);
        assert_eq!(CharacterClass::from_db(Some("Sentinel")), CharacterClass::Sentinel);
    }

    #[test]
    fn known_classes_map_directly() {
        assert_eq!(CharacterClass::from_db(Some("Berserker")), CharacterClass::Berserker);
        assert_eq!(CharacterClass::from_db(Some("Phantom")), CharacterClass::Phantom);
    }

    #[test]
    fn random_excluding_never_returns_excluded_class() {
        let mut rng = rand::rng();
        for _ in 0..50 {
            for class in [CharacterClass::Berserker, CharacterClass::Sentinel, CharacterClass::Phantom] {
                assert_ne!(CharacterClass::random_excluding(class, &mut rng), class);
            }
        }
    }

    // ── resolve_round — class specials ────────────────────────────────────────

    #[test]
    fn berserker_special_deals_three_times_normal_damage() {
        let normal = resolve_round(
            "attack", CharacterClass::Berserker, 10, 10, 100,
            "attack", CharacterClass::Sentinel,  10, 10, 100,
            det,
        );
        let special = resolve_round(
            "special", CharacterClass::Berserker, 10, 10, 100,
            "attack",  CharacterClass::Sentinel,  10, 10, 100,
            det,
        );
        assert_eq!(special.player_dmg, normal.player_dmg * 3);
    }

    #[test]
    fn sentinel_special_absorbs_all_incoming_damage() {
        // Sentinel (player) uses special; Berserker (bot) attacks normally.
        let outcome = resolve_round(
            "special", CharacterClass::Sentinel,  10, 10, 100,
            "attack",  CharacterClass::Berserker, 10, 10, 100,
            det,
        );
        assert_eq!(outcome.bot_dmg, 0, "Sentinel should take 0 damage while absorbing");
        assert_eq!(outcome.new_player_hp, 100);
    }

    #[test]
    fn sentinel_special_reflects_half_of_incoming_attack() {
        let outcome = resolve_round(
            "special", CharacterClass::Sentinel,  10, 10, 100,
            "attack",  CharacterClass::Berserker, 10, 10, 100,
            det,
        );
        // Reflect basis: bot's normal attack (base 20) vs Sentinel's defense (10), equal stats -> 20.
        let expected_basis = calc_damage_det(10, 10, 20.0, false, 1.0);
        assert_eq!(outcome.player_dmg, (expected_basis as f64 * 0.5).floor() as i32);
        assert!(outcome.player_dmg > 0);
    }

    #[test]
    fn phantom_special_bypasses_defense_and_defending() {
        // Phantom (player) special vs Sentinel (bot) defending.
        let outcome = resolve_round(
            "special", CharacterClass::Phantom,  10, 10, 100,
            "defend",  CharacterClass::Sentinel, 10, 10, 100,
            det,
        );
        // Bypass means bot's defend (incoming x0.5) and defense_stat are ignored —
        // damage equals a plain base-40 hit at equal attack/defense (stat_mod = 1).
        let expected = calc_damage_det(10, 0, 40.0, true, 1.0);
        assert_eq!(outcome.player_dmg, expected);
    }

    #[test]
    fn phantom_lethal_special_prevents_retaliation() {
        // Phantom (player) special will reduce bot's 30 HP to 0 (40 base dmg, equal stats).
        let outcome = resolve_round(
            "special", CharacterClass::Phantom,  10, 10, 100,
            "attack",  CharacterClass::Berserker, 10, 10, 30,
            det,
        );
        assert_eq!(outcome.new_bot_hp, 0);
        assert_eq!(outcome.bot_dmg, 0, "bot should be KO'd before it can retaliate");
        assert_eq!(outcome.new_player_hp, 100);
    }

    // ── Fight loop (BotFightSession) ──────────────────────────────────────────

    fn make_session(player_class: CharacterClass, bot_class: CharacterClass) -> BotFightSession {
        let player = make_player("Bronze", 12, 10);
        let mut session = BotFightSession::new("0xtest".into(), &player, 1);
        session.player_class = player_class;
        session.bot_class = bot_class;
        session
    }

    #[test]
    fn fight_runs_at_most_five_rounds() {
        let mut session = make_session(CharacterClass::Berserker, CharacterClass::Sentinel);
        let mut rounds = 0;
        while !session.is_final() && rounds < 100 {
            session.play_round("attack");
            rounds += 1;
        }
        assert!(session.rounds.len() <= 5 && !session.rounds.is_empty());
    }

    #[test]
    fn hp_never_goes_below_zero() {
        let mut session = make_session(CharacterClass::Phantom, CharacterClass::Berserker);
        while !session.is_final() {
            session.play_round("attack");
        }
        for r in &session.rounds {
            assert!(r.challenger_hp >= 0 && r.opponent_hp >= 0);
        }
    }

    #[test]
    fn xp_awarded_is_win_or_loss() {
        let mut session = make_session(CharacterClass::Sentinel, CharacterClass::Phantom);
        while !session.is_final() {
            session.play_round("attack");
        }
        assert!(session.xp_awarded() == XP_WIN || session.xp_awarded() == XP_LOSS);
    }

    #[test]
    fn winner_has_higher_or_equal_hp() {
        let mut session = make_session(CharacterClass::Berserker, CharacterClass::Phantom);
        while !session.is_final() {
            session.play_round("attack");
        }
        if session.challenger_won() {
            assert!(session.player_hp >= session.bot_hp);
        } else {
            assert!(session.bot_hp >= session.player_hp);
        }
    }

    // ── Rank model ────────────────────────────────────────────────────────────

    #[test]
    fn rank_next_progression() {
        use crate::models::player::Rank;
        assert_eq!(Rank::Iron.next(),     Some(Rank::Bronze));
        assert_eq!(Rank::Bronze.next(),   Some(Rank::Silver));
        assert_eq!(Rank::Silver.next(),   Some(Rank::Gold));
        assert_eq!(Rank::Platinum.next(), Some(Rank::Emerald));
        assert_eq!(Rank::Emerald.next(),  Some(Rank::Diamond));
        assert_eq!(Rank::Diamond.next(),  None); // top rank → prestige instead
    }

    #[test]
    fn rank_prev_regression() {
        use crate::models::player::Rank;
        assert_eq!(Rank::Diamond.prev(), Some(Rank::Emerald));
        assert_eq!(Rank::Bronze.prev(),  Some(Rank::Iron));
        assert_eq!(Rank::Iron.prev(),    None); // Iron is the floor
    }

    #[test]
    fn rank_g_reward_scales() {
        let bronze  = crate::models::player::Rank::Bronze.g_reward();
        let diamond = crate::models::player::Rank::Diamond.g_reward();
        assert!(diamond > bronze);
    }
}
