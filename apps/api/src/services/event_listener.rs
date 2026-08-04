use anyhow::{anyhow, Result};
use ethers::{
    providers::{Http, Middleware, Provider},
    types::{Address, BlockNumber, Filter, Log, H256, U256},
};
use sqlx::PgPool;

/// Listens for `ItemPurchased(address buyer, uint256 itemId, uint256 price)` events
/// from StillHuntMarketplace and writes authoritative inventory rows to Supabase.
///
/// Runs as a background Tokio task with 30-second polling. Idempotent — the
/// inventory upsert uses ON CONFLICT DO NOTHING so re-processing a block is safe.
pub struct EventListener {
    provider:             Provider<Http>,
    marketplace_address:  Address,
    db:                   PgPool,
}

impl EventListener {
    pub fn from_env(db: PgPool) -> Option<Self> {
        let marketplace_str = std::env::var("MARKETPLACE_CONTRACT").ok()?;
        let marketplace_address = marketplace_str.parse::<Address>().ok()?;
        let rpc_url = std::env::var("CELO_RPC_URL")
            .unwrap_or_else(|_| "https://forno.celo.org".into());
        let provider = Provider::<Http>::try_from(rpc_url.as_str()).ok()?;

        Some(Self { provider, marketplace_address, db })
    }

    /// Spawns the event listener as a background task.
    pub fn spawn(self) {
        tokio::spawn(async move {
            tracing::info!("Event listener started for marketplace {:?}", self.marketplace_address);
            let mut last_block: u64 = 0;

            loop {
                match self.poll_once(&mut last_block).await {
                    Ok(n) if n > 0 => tracing::info!("Event listener: processed {} ItemPurchased events", n),
                    Err(e) => tracing::error!("Event listener error: {}", e),
                    _ => {}
                }
                tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
            }
        });
    }

    async fn poll_once(&self, last_block: &mut u64) -> Result<usize> {
        let latest = self.provider.get_block_number().await?.as_u64();

        // On first run start from 50 blocks back; otherwise continue from last seen
        let from_block = if *last_block == 0 {
            latest.saturating_sub(50)
        } else {
            *last_block + 1
        };

        if from_block > latest {
            return Ok(0);
        }

        // ItemPurchased(address indexed buyer, uint256 indexed itemId, uint256 price)
        // Keccak256 of the event signature
        let event_sig: H256 =
            "0xb36e9bde73c83cdc2a8be05c3ea4d4a4a5c0a2d22d826dbab3c56d7db42f1b8d"
                .parse()
                .map_err(|_| anyhow!("bad event sig"))?;

        let filter = Filter::new()
            .address(self.marketplace_address)
            .topic0(event_sig)
            .from_block(BlockNumber::Number(from_block.into()))
            .to_block(BlockNumber::Number(latest.into()));

        let logs: Vec<Log> = self.provider.get_logs(&filter).await?;
        let count = logs.len();

        for log in &logs {
            if let Err(e) = self.process_log(log).await {
                tracing::error!("Failed to process ItemPurchased log: {}", e);
            }
        }

        *last_block = latest;
        Ok(count)
    }

    async fn process_log(&self, log: &Log) -> Result<()> {
        // topics[1] = buyer (indexed address, left-padded to 32 bytes)
        // topics[2] = itemId (indexed uint256)
        if log.topics.len() < 3 {
            return Err(anyhow!("Unexpected topic count: {}", log.topics.len()));
        }

        // Derive buyer address from last 20 bytes of topics[1]
        let buyer_bytes = &log.topics[1].as_bytes()[12..];
        let buyer = format!("0x{}", hex::encode(buyer_bytes));

        // Item ID = topics[2] interpreted as U256
        let item_on_chain_id = U256::from_big_endian(log.topics[2].as_bytes()).as_u64();

        // Resolve on_chain_id → Supabase item UUID
        let item_row: Option<(uuid::Uuid,)> = sqlx::query_as(
            "SELECT id FROM items WHERE on_chain_id = $1",
        )
        .bind(item_on_chain_id as i32)
        .fetch_optional(&self.db)
        .await?;

        let Some((item_uuid,)) = item_row else {
            tracing::warn!("ItemPurchased event for unknown on_chain_id: {}", item_on_chain_id);
            return Ok(());
        };

        // Upsert inventory — ON CONFLICT DO NOTHING makes this idempotent
        let now = chrono::Utc::now();
        sqlx::query(
            "INSERT INTO inventory (wallet_address, item_id, equipped, acquired_at)
             VALUES ($1, $2, false, $3)
             ON CONFLICT (wallet_address, item_id) DO NOTHING",
        )
        .bind(&buyer)
        .bind(item_uuid)
        .bind(now)
        .execute(&self.db)
        .await?;

        // Decrement remaining_supply if limited
        sqlx::query(
            "UPDATE items
             SET remaining_supply = remaining_supply - 1
             WHERE on_chain_id = $1 AND remaining_supply IS NOT NULL AND remaining_supply > 0",
        )
        .bind(item_on_chain_id as i32)
        .execute(&self.db)
        .await?;

        tracing::info!(
            "Inventory: {} acquired item on_chain_id={} ({})",
            buyer, item_on_chain_id, item_uuid
        );

        Ok(())
    }
}
