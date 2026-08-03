use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Mission {
    pub id: Uuid,
    pub wallet_address: String,
    pub deployed_at: DateTime<Utc>,
    pub collect_by: DateTime<Utc>,
    pub collected: bool,
    pub item_dropped: Option<Uuid>,
    pub xp_awarded: i32,
}

#[derive(Debug, Serialize)]
pub struct CollectResult {
    pub item_dropped: Option<String>,
    pub xp: i32,
}
