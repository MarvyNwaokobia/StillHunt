use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "text", rename_all = "PascalCase")]
pub enum Rank {
    Iron,
    Bronze,
    Silver,
    Gold,
    Platinum,
    Emerald,
    Diamond,
}

impl Rank {
    pub fn g_reward(&self) -> u64 {
        match self {
            Rank::Iron => 5,
            Rank::Bronze => 10,
            Rank::Silver => 20,
            Rank::Gold => 40,
            Rank::Platinum => 80,
            Rank::Emerald => 120,
            Rank::Diamond => 150,
        }
    }

    pub fn next(&self) -> Option<Rank> {
        match self {
            Rank::Iron => Some(Rank::Bronze),
            Rank::Bronze => Some(Rank::Silver),
            Rank::Silver => Some(Rank::Gold),
            Rank::Gold => Some(Rank::Platinum),
            Rank::Platinum => Some(Rank::Emerald),
            Rank::Emerald => Some(Rank::Diamond),
            Rank::Diamond => None,
        }
    }

    pub fn prev(&self) -> Option<Rank> {
        match self {
            Rank::Iron => None,
            Rank::Bronze => Some(Rank::Iron),
            Rank::Silver => Some(Rank::Bronze),
            Rank::Gold => Some(Rank::Silver),
            Rank::Platinum => Some(Rank::Gold),
            Rank::Emerald => Some(Rank::Platinum),
            Rank::Diamond => Some(Rank::Emerald),
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
    pub prestige_level: i32, // 0 until the player climbs past Diamond; then Diamond I, II, III…
    #[serde(default)]
    pub character_confirmed: bool, // false for chain-reconstructed players → prompt confirm-class
    pub created_at: DateTime<Utc>,
    pub character_claim_tx: Option<String>,
}
