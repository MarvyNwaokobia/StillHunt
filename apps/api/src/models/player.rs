use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "text", rename_all = "PascalCase")]
pub enum Rank {
    Drifter,
    Tracker,
    Stalker,
    Marksman,
    Ranger,
    Ghost,
    Apex,
}

impl Rank {
    pub fn g_reward(&self) -> u64 {
        match self {
            Rank::Drifter => 5,
            Rank::Tracker => 10,
            Rank::Stalker => 20,
            Rank::Marksman => 40,
            Rank::Ranger => 80,
            Rank::Ghost => 120,
            Rank::Apex => 150,
        }
    }

    pub fn next(&self) -> Option<Rank> {
        match self {
            Rank::Drifter => Some(Rank::Tracker),
            Rank::Tracker => Some(Rank::Stalker),
            Rank::Stalker => Some(Rank::Marksman),
            Rank::Marksman => Some(Rank::Ranger),
            Rank::Ranger => Some(Rank::Ghost),
            Rank::Ghost => Some(Rank::Apex),
            Rank::Apex => None,
        }
    }

    pub fn prev(&self) -> Option<Rank> {
        match self {
            Rank::Drifter => None,
            Rank::Tracker => Some(Rank::Drifter),
            Rank::Stalker => Some(Rank::Tracker),
            Rank::Marksman => Some(Rank::Stalker),
            Rank::Ranger => Some(Rank::Marksman),
            Rank::Ghost => Some(Rank::Ranger),
            Rank::Apex => Some(Rank::Ghost),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "text", rename_all = "lowercase")]
pub enum DecayStatus {
    None,
    Warning,
    Active,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "text", rename_all = "PascalCase")]
pub enum PlayStyle {
    Wanderer,
    Fighter,
    Champion,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Player {
    pub wallet_address: String,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub character_class: Option<String>,
    #[sqlx(json)]
    pub character_customization: serde_json::Value,
    pub play_style: String,
    pub avatar: String,
    pub character_name: String,
    pub rank: String,
    pub xp: i32,
    pub attack_stat: i32,
    pub defense_stat: i32,
    pub speed_stat: i32,
    #[serde(with = "rust_decimal::serde::float")]
    pub g_earned_lifetime: Decimal,
    pub last_active: DateTime<Utc>,
    pub decay_status: String,
    pub decay_frozen_until: Option<DateTime<Utc>>,
    pub wins: i32,
    pub losses: i32,
    pub pve_level: i32, // highest PvE Campaign level cleared (0 = none)
    #[serde(default)]
    pub prestige_level: i32, // 0 until the player climbs past Apex; then Apex I, II, III…
    #[serde(default)]
    pub character_confirmed: bool, // false for chain-reconstructed players → prompt confirm-class
    pub created_at: DateTime<Utc>,
    pub character_claim_tx: Option<String>,
}
