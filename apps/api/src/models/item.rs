use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Item {
    pub id: Uuid,
    pub on_chain_id: Option<i16>,
    pub name: String,
    pub description: String,
    pub rarity: String,
    pub category: String,
    pub stat_boost: i32,
    #[serde(with = "rust_decimal::serde::float")]
    pub price_g: Decimal,
    pub image_url: String,
    pub layer_type: Option<String>,
    pub layer_asset_url: Option<String>,
    pub total_supply: Option<i32>,
    pub remaining_supply: Option<i32>,
    pub weapon_stats: Option<serde_json::Value>,
    /// When this item stops being purchasable. NULL = on sale indefinitely. Used for
    /// season-limited weapons; the marketplace shows a countdown only when it is set.
    pub sale_ends_at: Option<chrono::DateTime<chrono::Utc>>,

    /// Price on each chain StillHunt sells this item on, keyed by chain id as a string
    /// (`{"43114": 800.0}`). Celo is NOT in here — `price_g` above is the Celo price
    /// and stays the single source of truth for it, so every existing caller keeps
    /// working untouched.
    ///
    /// WHY THIS HAS TO EXIST. The price a buyer signs a permit for MUST equal the
    /// price the marketplace contract holds for that item, or `permit()` rejects the
    /// signature and the purchase reverts after the player has already approved it.
    /// The same rifle is 1,200 G$ on Celo and 6,000 SCRP on Avalanche — those are not
    /// conversions of each other, because G$ has an exchange rate and SCRP measures
    /// time played. Serving one number to both chains guarantees one of them reverts.
    ///
    /// Empty map = this item is not sold on any chain besides Celo. Clients must
    /// DISABLE buying rather than fall back to `price_g`, which is exactly the
    /// substitution that produces the silent revert.
    #[sqlx(skip)]
    #[serde(default)]
    pub chain_prices: std::collections::HashMap<String, f64>,
}
