use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Battle {
    pub id: Uuid,
    pub challenger_wallet: String,
    pub opponent_wallet: String,
    pub winner_wallet: Option<String>,
    pub rounds_data: Value,
    pub xp_awarded_challenger: i32,
    pub xp_awarded_opponent: i32,
    pub is_bot: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateBattleRequest {
    pub opponent_wallet: String,
}
