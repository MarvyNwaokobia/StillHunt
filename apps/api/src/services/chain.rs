use ethers::{
    middleware::SignerMiddleware,
    prelude::abigen,
    providers::{Http, Middleware, Provider},
    signers::{LocalWallet, Signer},
    types::{Address, H256, U256},
};
use std::{collections::HashMap, str::FromStr, sync::Arc, time::Duration};

abigen!(
    StillHuntRecord,
    r#"[
        function claimCharacter(address player, string characterClass, string characterName) external
        function recordBattle(bytes32 battleId, address winner, address loser, uint8 xpWinner, uint8 xpLoser, bool isBot) external
        function recordRankUp(address player, string newRank) external
    ]"#
);

abigen!(
    GoodCollectiveUBIPool,
    r#"[
        function addMember(address member) external
    ]"#
);

abigen!(
    StillHuntMarketplace,
    r#"[
        function purchaseWithPermit(address buyer, uint256 itemId, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external
        function withdrawRevenue(address to) external
        function accumulatedRevenue() external view returns (uint256)
    ]"#
);

abigen!(
    StillHuntRewardPool,
    r#"[
        function distributeRankUpReward(address player, string newRank) external
        function distributeDailyClaim(address player) external
        function distributeReward(address player, uint256 amount, bytes32 ref) external
        function rewardRefUsed(bytes32 ref) external view returns (bool)
    ]"#
);

// Standard ERC20 + EIP-2612 permit — G$ itself implements this (same contract
// the frontend already signs permits against for marketplace checkout).
abigen!(
    GDollarToken,
    r#"[
        function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external
        function transferFrom(address from, address to, uint256 value) external returns (bool)
        function allowance(address owner, address spender) external view returns (uint256)
        function balanceOf(address account) external view returns (uint256)
    ]"#
);

// Mainnet G$ SuperToken on Celo — matches apps/web/src/lib/constants.ts's G_TOKEN_ADDRESS.
const DEFAULT_G_TOKEN: &str = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A";

/// Gas limit for any transferFrom that runs against an allowance granted by a
/// permit in the SAME batch — the withdrawal legs in `transfer_g_with_fee`, the
/// single leg in `transfer_g_for`, and any future dependent pair.
///
/// Set explicitly so ethers does NOT gas-estimate them, because estimating is
/// the bug: the estimate is a dry run against a chain where the permit has not
/// been mined yet, so the allowance reads zero and the transfer is never
/// broadcast. Observed SuperToken transferFrom cost is well under 100k; this
/// leaves generous headroom for the token's hooks, and unused gas is refunded.
const TRANSFER_FROM_GAS: u64 = 300_000;

type ChainClient = SignerMiddleware<Provider<Http>, LocalWallet>;

#[derive(Clone)]
pub struct ChainWriter {
    contract:     Arc<StillHuntRecord<ChainClient>>,
    client:       Arc<ChainClient>,
    rank_pools:   HashMap<String, Address>,
    marketplace:  Option<Arc<StillHuntMarketplace<ChainClient>>>,
    reward_pool:  Option<Arc<StillHuntRewardPool<ChainClient>>>,
    endless_pool: Option<Arc<StillHuntRewardPool<ChainClient>>>,
    g_token:      Arc<GDollarToken<ChainClient>>,
    // Serializes every state-changing tx from the signer. A fight-complete fires
    // several writes concurrently (recordBattle + a bounty/reward payout), and a
    // plain SignerMiddleware reads the *pending* nonce independently per tx — so
    // two racing writes grab the SAME nonce and the loser is rejected as
    // "replacement transaction underpriced". Holding this lock across each
    // broadcast means the next tx reads the nonce only after the previous is in
    // the mempool. Self-healing: the nonce is always re-read from chain, so a
    // failed send never leaves a local counter out of sync (unlike a nonce manager).
    tx_lock:      Arc<tokio::sync::Mutex<()>>,
}

/// Marker prefix on any error caused by the RELAY being out of CELO, rather than by
/// anything the player did.
///
/// WHY THIS EXISTS. When the relay wallet cannot pay gas, ethers reports
/// "permit submission failed: insufficient funds for gas * price + value". Three
/// frontend hooks matched the word "permit" in that string and told the player
/// "Signature expired or invalid — please try again". So a fuel problem on OUR
/// wallet was reported to the player as a fault with THEIR signature, and the
/// advice was to retry — which could never work, and which sent us chasing
/// signing bugs for hours while the real cause was an empty tank.
///
/// Callers check this to answer honestly and, crucially, to stop telling people
/// to retry something that cannot succeed until we top the wallet up.
pub const RELAY_OUT_OF_GAS: &str = "RELAY_OUT_OF_GAS";

/// True when a chain error means the relay could not pay for the transaction.
/// Matched on substrings because the text comes from the node, not from us.
pub fn is_out_of_gas(err: &str) -> bool {
    let e = err.to_ascii_lowercase();
    e.contains("insufficient funds") || e.contains("gas required exceeds")
}

/// Tag an error so the handler can tell a relay fuel failure from a real one.
fn tag_gas(err: String) -> String {
    if is_out_of_gas(&err) {
        format!("{}: {}", RELAY_OUT_OF_GAS, err)
    } else {
        err
    }
}

impl ChainWriter {
    /// The relay's CELO balance. Used to refuse a money operation BEFORE taking a
    /// player's signature, rather than after.
    pub async fn relay_gas_balance(&self) -> Option<U256> {
        self.client.get_balance(self.client.address(), None).await.ok()
    }

    /// Whether the relay can afford one transaction right now.
    ///
    /// Sized off what a payout actually costs: ~345k gas measured on real
    /// distributeReward receipts, at whatever the current base fee is, with 3x
    /// headroom because the fee moves. Returns true when the balance cannot be
    /// read — an RPC blip must not block every purchase in the app.
    pub async fn relay_can_pay(&self) -> bool {
        let Some(balance) = self.relay_gas_balance().await else { return true };
        let price = self
            .client
            .get_gas_price()
            .await
            .unwrap_or_else(|_| U256::from(200_000_000_000u64));
        let needed = price * U256::from(345_000u64) * U256::from(3u64);
        balance >= needed
    }

    pub fn from_env() -> Option<Self> {
        let private_key   = std::env::var("BACKEND_PRIVATE_KEY").ok()?;
        let contract_addr = std::env::var("GAME_RECORD_CONTRACT").ok()?;
        let rpc_url = std::env::var("CELO_RPC_URL")
            .unwrap_or_else(|_| "https://forno.celo.org".to_string());

        let wallet: LocalWallet = private_key
            .trim_start_matches("0x")
            .parse::<LocalWallet>()
            .map_err(|e| tracing::warn!("ChainWriter: invalid key: {}", e))
            .ok()?
            .with_chain_id(42220u64);

        let provider = Provider::<Http>::try_from(rpc_url.as_str())
            .map_err(|e| tracing::warn!("ChainWriter: bad RPC URL: {}", e))
            .ok()?;

        let address: Address = contract_addr
            .parse()
            .map_err(|e| tracing::warn!("ChainWriter: bad contract addr: {}", e))
            .ok()?;

        let client = Arc::new(SignerMiddleware::new(provider, wallet));
        let contract = Arc::new(StillHuntRecord::new(address, client.clone()));

        // GoodCollective UBI pool addresses — one per rank that earns a daily drip
        // (Iron + Bronze intentionally have none). Emerald is a first-class pool rank
        // like the rest: set RANK_POOL_EMERALD to its deployed GoodCollective pool
        // address and enrollment works with no further code change. Until that env var
        // points at a real on-chain pool, get("Emerald") is None and enrollment is a
        // safe no-op — you cannot add a member to a pool that does not exist yet.
        let mut rank_pools = HashMap::new();
        for rank in ["Silver", "Gold", "Platinum", "Emerald", "Diamond"] {
            let key = format!("RANK_POOL_{}", rank.to_uppercase());
            if let Ok(addr) = std::env::var(&key)
                .and_then(|v| v.parse::<Address>().map_err(|_| std::env::VarError::NotPresent))
            {
                rank_pools.insert(rank.to_string(), addr);
                tracing::info!("Rank pool {} → {:?}", rank, rank_pools[rank]);
            }
        }

        // Marketplace contract — optional (relay purchases disabled if unset)
        let marketplace = std::env::var("MARKETPLACE_CONTRACT")
            .ok()
            .and_then(|v| v.parse::<Address>().ok())
            .map(|addr| {
                tracing::info!("Marketplace relay enabled → {:?}", addr);
                Arc::new(StillHuntMarketplace::new(addr, client.clone()))
            });

        // Reward pool — optional (distributions skipped if unset). This funds rank-ups,
        // prestige, first-clear bounties, and daily claims.
        let reward_pool = std::env::var("REWARD_POOL_CONTRACT")
            .ok()
            .and_then(|v| v.parse::<Address>().ok())
            .map(|addr| {
                tracing::info!("Reward pool enabled → {:?}", addr);
                Arc::new(StillHuntRewardPool::new(addr, client.clone()))
            });

        // Endless gets its OWN pool so a survival grinder can't starve rank-up/bounty
        // payouts. Optional: if ENDLESS_REWARD_POOL_CONTRACT is unset, Endless falls
        // back to the shared reward_pool (current behaviour), so this is safe to ship
        // before the separate pool is deployed and funded.
        let endless_pool = std::env::var("ENDLESS_REWARD_POOL_CONTRACT")
            .ok()
            .and_then(|v| v.parse::<Address>().ok())
            .map(|addr| {
                tracing::info!("Endless reward pool enabled → {:?}", addr);
                Arc::new(StillHuntRewardPool::new(addr, client.clone()))
            });

        let g_token_addr: Address = std::env::var("G_TOKEN_CONTRACT")
            .unwrap_or_else(|_| DEFAULT_G_TOKEN.to_string())
            .parse()
            .map_err(|e| tracing::warn!("ChainWriter: bad G_TOKEN_CONTRACT: {}", e))
            .ok()?;
        let g_token = Arc::new(GDollarToken::new(g_token_addr, client.clone()));

        tracing::info!("ChainWriter ready — game_record={}", contract_addr);
        Some(Self { contract, client, rank_pools, marketplace, reward_pool, endless_pool, g_token, tx_lock: Arc::new(tokio::sync::Mutex::new(())) })
    }

    pub async fn claim_character(
        &self,
        player: Address,
        class: String,
        name: String,
    ) -> Option<H256> {
        let _tx = self.tx_lock.lock().await;
        match self.contract.claim_character(player, class, name).send().await {
            Ok(pending) => {
                let hash = pending.tx_hash();
                tracing::info!("claimCharacter on-chain: {:?}", hash);
                Some(hash)
            }
            Err(e) => {
                tracing::warn!("claimCharacter chain write failed: {}", e);
                None
            }
        }
    }

    pub async fn record_battle(
        &self,
        battle_id: [u8; 32],
        winner: Address,
        loser: Address,
        xp_winner: u8,
        xp_loser: u8,
        is_bot: bool,
    ) -> Option<H256> {
        let _tx = self.tx_lock.lock().await;
        match self
            .contract
            .record_battle(battle_id, winner, loser, xp_winner, xp_loser, is_bot)
            .send()
            .await
        {
            Ok(pending) => {
                let hash = pending.tx_hash();
                tracing::info!("recordBattle on-chain: {:?}", hash);
                Some(hash)
            }
            Err(e) => {
                tracing::warn!("recordBattle chain write failed: {}", e);
                None
            }
        }
    }

    pub async fn record_rank_up(&self, player: Address, rank: String) -> Option<H256> {
        let _tx = self.tx_lock.lock().await;
        match self.contract.record_rank_up(player, rank).send().await {
            Ok(pending) => {
                let hash = pending.tx_hash();
                tracing::info!("recordRankUp on-chain: {:?}", hash);
                Some(hash)
            }
            Err(e) => {
                tracing::warn!("recordRankUp chain write failed: {}", e);
                None
            }
        }
    }

    pub async fn enroll_in_rank_pool(&self, player: Address, rank: &str) -> Option<H256> {
        let pool_addr = self.rank_pools.get(rank)?;
        let pool = GoodCollectiveUBIPool::new(*pool_addr, self.client.clone());
        let _tx = self.tx_lock.lock().await;
        match pool.add_member(player).send().await {
            Ok(pending) => {
                let hash = pending.tx_hash();
                tracing::info!("enrollRankPool {} → {:?}", rank, hash);
                Some(hash)
            }
            Err(e) => {
                tracing::warn!("enrollRankPool {} failed: {}", rank, e);
                None
            }
        }
    }

    /// Distributes a rank-up G$ reward from the StillHuntRewardPool to the player's wallet.
    /// Returns Ok(true) on success, Ok(false) if pool not configured, Err on failure.
    pub async fn distribute_rank_up_reward(&self, player: Address, rank: String) -> Result<bool, String> {
        let pool = match &self.reward_pool {
            Some(p) => p,
            None => return Ok(false),
        };
        // Submit under the lock, confirm outside it under a timeout — see distribute_reward.
        let call = pool.distribute_rank_up_reward(player, rank.clone());
        let pending = {
            let _tx = self.tx_lock.lock().await;
            call.send()
                .await
                .map_err(|e| format!("distributeRankUpReward failed: {}", e))?
        };
        tokio::time::timeout(Duration::from_secs(90), pending.confirmations(1))
            .await
            .map_err(|_| "distributeRankUpReward tx timed out".to_string())?
            .map_err(|e| format!("distributeRankUpReward tx failed: {}", e))?
            .ok_or_else(|| "distributeRankUpReward tx was dropped from mempool".to_string())?;
        tracing::info!("distributeRankUpReward: {} → {}", player, rank);
        Ok(true)
    }

    /// Pays a one-time G$ bounty (first-clear reward, competition payout) from the
    /// StillHuntRewardPool. `amount_g` is whole G$; `ref` is an idempotency key so the
    /// same bounty can never pay twice on-chain (a duplicate call reverts).
    /// Returns Ok(Some(tx_hash)) on success, Ok(None) if the pool isn't configured.
    pub async fn distribute_reward(&self, player: Address, amount_g: u64, reference: [u8; 32]) -> Result<Option<String>, String> {
        let pool = match &self.reward_pool {
            Some(p) => p,
            None => return Ok(None),
        };
        // G$ has 18 decimals; amount_g is whole tokens.
        let amount = U256::from(amount_g) * U256::exp10(18);
        // Hold tx_lock only to submit (it serialises nonce assignment); wait for the
        // receipt OUTSIDE it, under a timeout. Holding a global lock across an unbounded
        // confirmation wait meant one hung RPC call stalled every payout in the process.
        let call = pool.distribute_reward(player, amount, reference);
        let pending = {
            let _tx = self.tx_lock.lock().await;
            call.send()
                .await
                .map_err(|e| format!("distributeReward failed: {}", e))?
        };
        let receipt = tokio::time::timeout(Duration::from_secs(90), pending.confirmations(1))
            .await
            .map_err(|_| "distributeReward tx timed out".to_string())?
            .map_err(|e| format!("distributeReward tx failed: {}", e))?
            .ok_or_else(|| "distributeReward tx was dropped from mempool".to_string())?;
        tracing::info!("distributeReward: {} +{} G$ (ref {})", player, amount_g, hex::encode(reference));
        Ok(Some(format!("{:?}", receipt.transaction_hash)))
    }

    /// The pool Endless pays from: its dedicated pool if configured, else the shared one.
    /// The fallback keeps Endless working before the separate pool is deployed.
    fn endless_or_main(&self) -> Option<&Arc<StillHuntRewardPool<ChainClient>>> {
        self.endless_pool.as_ref().or(self.reward_pool.as_ref())
    }

    /// Like `distribute_reward`, but from the Endless pool (see `endless_or_main`). A
    /// separate pool means a survival grinder drains its own budget, not the rank-up /
    /// bounty budget.
    pub async fn distribute_endless_reward(&self, player: Address, amount_g: u64, reference: [u8; 32]) -> Result<Option<String>, String> {
        let pool = match self.endless_or_main() {
            Some(p) => p.clone(),
            None => return Ok(None),
        };
        let amount = U256::from(amount_g) * U256::exp10(18);
        let call = pool.distribute_reward(player, amount, reference);
        let pending = {
            let _tx = self.tx_lock.lock().await;
            call.send()
                .await
                .map_err(|e| format!("distributeEndlessReward failed: {}", e))?
        };
        let receipt = tokio::time::timeout(Duration::from_secs(90), pending.confirmations(1))
            .await
            .map_err(|_| "distributeEndlessReward tx timed out".to_string())?
            .map_err(|e| format!("distributeEndlessReward tx failed: {}", e))?
            .ok_or_else(|| "distributeEndlessReward tx was dropped from mempool".to_string())?;
        tracing::info!("distributeEndlessReward: {} +{} G$ (ref {})", player, amount_g, hex::encode(reference));
        Ok(Some(format!("{:?}", receipt.transaction_hash)))
    }

    /// `rewardRefUsed` against the Endless pool — the idempotency check for endless refs.
    pub async fn endless_ref_used(&self, reference: [u8; 32]) -> Result<bool, String> {
        let pool = match self.endless_or_main() {
            Some(p) => p,
            None => return Ok(false),
        };
        pool.reward_ref_used(reference)
            .call()
            .await
            .map_err(|e| format!("endless rewardRefUsed read failed: {}", e))
    }

    /// The Endless pool address (dedicated if set, else the shared pool) — for the
    /// low-balance monitor.
    pub fn endless_pool_address(&self) -> Option<Address> {
        self.endless_pool.as_ref().or(self.reward_pool.as_ref()).map(|p| p.address())
    }

    /// The endless pool ONLY if one was configured in its own right — None means
    /// ENDLESS_REWARD_POOL_CONTRACT is unset and Endless is silently falling back to
    /// the shared pool, spending the same G$ that funds season prizes and bounties.
    /// That fallback is deliberate (it keeps Endless working before its pool exists)
    /// but it is invisible from the outside, which is exactly how a prize pool gets
    /// quietly drained. This makes it checkable.
    pub fn dedicated_endless_pool_address(&self) -> Option<Address> {
        self.endless_pool.as_ref().map(|p| p.address())
    }

    /// Reads the on-chain idempotency flag for a bounty `ref`. `true` means that ref
    /// has already paid out on-chain, so a re-attempt would revert (`RefAlreadyUsed`).
    /// The reconcile job uses this to tell "genuinely never paid" apart from "paid, but
    /// our DB missed the confirmation" without sending a doomed transaction.
    /// Returns Ok(false) if the pool isn't configured (nothing could have paid).
    pub async fn reward_ref_used(&self, reference: [u8; 32]) -> Result<bool, String> {
        let pool = match &self.reward_pool {
            Some(p) => p,
            None => return Ok(false),
        };
        pool.reward_ref_used(reference)
            .call()
            .await
            .map_err(|e| format!("rewardRefUsed read failed: {}", e))
    }

    /// Distributes the daily claim G$ reward from the StillHuntRewardPool to the player's wallet.
    /// Returns Ok(true) on success, Ok(false) if pool not configured, Err on failure.
    pub async fn distribute_daily_claim(&self, player: Address) -> Result<bool, String> {
        let pool = match &self.reward_pool {
            Some(p) => p,
            None => return Ok(false),
        };
        // Submit under the lock, confirm outside it under a timeout — see distribute_reward.
        let call = pool.distribute_daily_claim(player);
        let pending = {
            let _tx = self.tx_lock.lock().await;
            call.send()
                .await
                .map_err(|e| format!("distributeDailyClaim failed: {}", e))?
        };
        tokio::time::timeout(Duration::from_secs(90), pending.confirmations(1))
            .await
            .map_err(|_| "distributeDailyClaim tx timed out".to_string())?
            .map_err(|e| format!("distributeDailyClaim tx failed: {}", e))?
            .ok_or_else(|| "distributeDailyClaim tx was dropped from mempool".to_string())?;
        tracing::info!("distributeDailyClaim: {}", player);
        Ok(true)
    }

    /// Relays a marketplace purchase on behalf of the player.
    /// The player signed an EIP-2612 permit off-chain — no CELO required from them.
    /// This wallet pays gas. Waits for on-chain confirmation before returning.
    pub async fn purchase_item_for(
        &self,
        buyer: Address,
        item_id: u64,
        deadline: u64,
        v: u8,
        r_hex: &str,
        s_hex: &str,
    ) -> Result<H256, String> {
        let marketplace = self
            .marketplace
            .as_ref()
            .ok_or_else(|| "Marketplace relay not configured (MARKETPLACE_CONTRACT unset)".to_string())?;

        let r: [u8; 32] = H256::from_str(r_hex)
            .map_err(|_| format!("Invalid r: {}", r_hex))?
            .0;
        let s: [u8; 32] = H256::from_str(s_hex)
            .map_err(|_| format!("Invalid s: {}", s_hex))?
            .0;

        let call = marketplace.purchase_with_permit(
            buyer,
            U256::from(item_id),
            U256::from(deadline),
            v,
            r,
            s,
        );
        // Hold the tx lock only across broadcast (nonce assignment), then release
        // so the ~90s confirmation wait doesn't serialize other writes behind it.
        let pending = {
            let _tx = self.tx_lock.lock().await;
            call.send().await
                .map_err(|e| format!("TX submission failed: {}", e))?
        };

        let hash = pending.tx_hash();
        tracing::info!("purchaseWithPermit submitted: {:?}", hash);

        // Wait for 1 confirmation (Celo ~5s blocks) — 90s timeout
        tokio::time::timeout(
            Duration::from_secs(90),
            pending.confirmations(1),
        )
        .await
        .map_err(|_| "Transaction timed out waiting for confirmation".to_string())?
        .map_err(|e| format!("Transaction failed on-chain: {}", e))?
        .ok_or_else(|| "Transaction was dropped from mempool".to_string())?;

        tracing::info!("purchaseWithPermit confirmed: {:?}", hash);
        Ok(hash)
    }

    /// Sweep the marketplace's accumulated revenue into the StillHuntRewardPool so shop
    /// spend recirculates into the prize pool that pays battles / rank-ups / bounties
    /// (instead of sitting idle until a manual withdraw). `withdrawRevenue` is owner-only
    /// on the contract; the relay wallet IS the marketplace owner, so this just works.
    /// No-op (returns `Ok(None)`) when nothing has accrued, so we never spend gas on a
    /// zero-value transfer. Fire-and-forget from the purchase handler.
    pub async fn sweep_revenue_to_pool(&self) -> Result<Option<H256>, String> {
        let marketplace = self
            .marketplace
            .as_ref()
            .ok_or_else(|| "Marketplace relay not configured (MARKETPLACE_CONTRACT unset)".to_string())?;
        let pool = self
            .reward_pool_address()
            .ok_or_else(|| "Reward pool not configured (REWARD_POOL_CONTRACT unset)".to_string())?;

        // Skip the tx entirely if there's nothing to sweep (a concurrent sweep may have
        // just drained it, or the item was off-chain and moved no G$).
        let accrued: U256 = marketplace
            .accumulated_revenue()
            .call()
            .await
            .map_err(|e| format!("accumulatedRevenue read failed: {}", e))?;
        if accrued.is_zero() {
            return Ok(None);
        }

        let call = marketplace.withdraw_revenue(pool);
        let pending = {
            let _tx = self.tx_lock.lock().await;
            call.send().await
                .map_err(|e| format!("withdrawRevenue submission failed: {}", e))?
        };
        let hash = pending.tx_hash();
        tokio::time::timeout(Duration::from_secs(90), pending.confirmations(1))
            .await
            .map_err(|_| "withdrawRevenue tx timed out".to_string())?
            .map_err(|e| format!("withdrawRevenue tx failed: {}", e))?
            .ok_or_else(|| "withdrawRevenue tx was dropped from mempool".to_string())?;

        tracing::info!("swept {} G$ (wei) marketplace revenue → reward pool {:?} (tx {:?})", accrued, pool, hash);
        Ok(Some(hash))
    }

    /// Relays a player-initiated G$ transfer to any destination address.
    /// The player signed an EIP-2612 permit granting this wallet an allowance
    /// for the exact amount — no CELO required from them, and StillHunt never
    /// custodies the funds (this wallet only ever holds the allowance long
    /// enough to move it straight through to `to`). This wallet pays gas for
    /// both steps. Returns the transferFrom tx hash (the one that actually
    /// moves the funds).
    pub async fn transfer_g_for(
        &self,
        from: Address,
        to: Address,
        amount: U256,
        deadline: u64,
        v: u8,
        r_hex: &str,
        s_hex: &str,
    ) -> Result<H256, String> {
        let r: [u8; 32] = H256::from_str(r_hex).map_err(|_| format!("Invalid r: {}", r_hex))?.0;
        let s: [u8; 32] = H256::from_str(s_hex).map_err(|_| format!("Invalid s: {}", s_hex))?.0;
        let spender = self.client.address();

        // This is the ONLY chain call that broadcasts two DEPENDENT transactions
        // (permit, then transferFrom against the allowance it just granted), and
        // that is what made it the only one that hit
        //   "nonce too low: next nonce 1409, tx nonce 1408".
        //
        // tx_lock's contract is that a broadcast completes before the next tx
        // reads the nonce. Taking the lock twice with a confirmation wait in
        // between broke it: the pending-nonce read for transferFrom could be
        // served by a load-balanced node that had not yet seen the permit, so
        // both txs claimed the same nonce and the second was rejected.
        //
        // Fixed by submitting the pair as ONE unit: a single lock hold, one
        // nonce read, explicit sequential nonces. No confirmation wait sits
        // inside the lock, so a hung RPC still cannot stall other payouts —
        // which is the property the two-lock version was reaching for.
        //
        // Waiting for the permit receipt before sending transferFrom is not
        // needed for correctness: nonce order guarantees the permit executes
        // first, so the allowance exists by the time transferFrom runs.
        //
        // THAT REASONING IS ONLY TRUE IF WE SET THE GAS LIMIT OURSELVES, which is
        // what TRANSFER_FROM_GAS below is for. It holds for EXECUTION and says
        // nothing about SUBMISSION: ethers fills an unset gas limit by calling
        // eth_estimateGas first (ethers-providers rpc/provider.rs, "Set gas to
        // estimated value only if it was not set by the caller"), and that
        // estimate is a dry run against the chain AS IT IS NOW — a chain where
        // the permit broadcast microseconds earlier has not been mined. So the
        // allowance is still zero in the dry run, the dry run reverts with
        // "SuperToken: transfer amount exceeds allowance", and send() refuses to
        // broadcast at all.
        //
        // The player's permit still lands, so they are left with their signature
        // spent, a standing allowance for the full amount, and no transfer. That
        // is what a player saw as "transferFrom submission failed: Contract call
        // reverted" while holding 47k G$ and a relay with 41 CELO of gas. It is a
        // race against block time, which is why 51 withdrawals had gone through
        // and only some fail: sometimes the permit is already mined when the
        // estimate runs.
        //
        // Marketplace purchases never had this bug because they are a SINGLE
        // transaction (purchaseWithPermit), so the permit runs inside the same
        // dry run as the transfer. This path is the only two-transaction one, and
        // was the only one affected.
        let mut permit_call =
            self.g_token.permit(from, spender, amount, U256::from(deadline), v, r, s);
        let mut transfer_call = self.g_token.transfer_from(from, to, amount);
        // Skips eth_estimateGas for the dependent tx. A SuperToken transferFrom
        // is well under this; unused gas is refunded, so a generous ceiling is
        // free, and paying it is strictly better than not broadcasting.
        transfer_call.tx.set_gas(TRANSFER_FROM_GAS);

        let (permit_pending, transfer_pending) = {
            let _tx = self.tx_lock.lock().await;

            let nonce = self
                .client
                .get_transaction_count(spender, Some(ethers::types::BlockNumber::Pending.into()))
                .await
                .map_err(|e| format!("nonce read failed: {}", e))?;
            permit_call.tx.set_nonce(nonce);
            transfer_call.tx.set_nonce(nonce + 1);

            let permit_pending = permit_call
                .send()
                .await
                .map_err(|e| tag_gas(format!("permit submission failed: {}", e)))?;
            let transfer_pending = transfer_call
                .send()
                .await
                .map_err(|e| tag_gas(format!("transferFrom submission failed: {}", e)))?;

            (permit_pending, transfer_pending)
        };

        let hash = transfer_pending.tx_hash();

        // The permit is only interesting when it FAILS: a reverted permit leaves
        // no allowance, so the transfer reverts too and the useful error is that
        // one. Surface it rather than reporting a generic transfer failure.
        let permit_receipt = tokio::time::timeout(Duration::from_secs(90), permit_pending.confirmations(1))
            .await
            .map_err(|_| "permit tx timed out".to_string())?
            .map_err(|e| format!("permit tx failed: {}", e))?
            .ok_or_else(|| "permit tx was dropped from mempool".to_string())?;
        if permit_receipt.status == Some(0.into()) {
            return Err("permit reverted — signature invalid, expired, or already used".to_string());
        }

        let receipt = tokio::time::timeout(Duration::from_secs(90), transfer_pending.confirmations(1))
            .await
            .map_err(|_| "transfer tx timed out".to_string())?
            .map_err(|e| format!("transfer tx failed: {}", e))?
            .ok_or_else(|| "transfer tx was dropped from mempool".to_string())?;
        // A reverted tx still produces a receipt. Without this check a revert was
        // reported as a successful transfer — and for a duel stake that would have
        // opened a duel nobody had actually paid into.
        if receipt.status == Some(0.into()) {
            return Err("transfer reverted on-chain — nothing was moved".to_string());
        }

        tracing::info!("transferG: {} -> {} amount={} tx={:?}", from, to, amount, hash);
        Ok(hash)
    }

    /// Like `transfer_g_for`, but splits the player's signed allowance between the
    /// destination and a fee address — the withdrawal fee on transfer-out.
    ///
    /// The player signs ONE permit for the gross amount, exactly as before; this
    /// spends that single allowance with two `transferFrom`s. Doing it that way
    /// means the fee cannot be dodged by a client that lies about the split: the
    /// server decides both legs, and the player's signature only ever authorised
    /// the gross.
    ///
    /// Returns the hash of the leg that pays the DESTINATION — that is the
    /// transfer the player cares about and the one shown to them.
    ///
    /// A zero fee (rounded away on a dust withdrawal) skips the second leg rather
    /// than burning gas on a zero-value transfer.
    #[allow(clippy::too_many_arguments)]
    pub async fn transfer_g_with_fee(
        &self,
        from: Address,
        to: Address,
        net: U256,
        fee_to: Address,
        fee: U256,
        deadline: u64,
        v: u8,
        r_hex: &str,
        s_hex: &str,
    ) -> Result<H256, String> {
        let r: [u8; 32] = H256::from_str(r_hex).map_err(|_| format!("Invalid r: {}", r_hex))?.0;
        let s: [u8; 32] = H256::from_str(s_hex).map_err(|_| format!("Invalid s: {}", s_hex))?.0;
        let spender = self.client.address();
        let gross = net.checked_add(fee).ok_or_else(|| "transfer amount overflow".to_string())?;

        // Same single-lock, explicit-sequential-nonce discipline as transfer_g_for —
        // see the long note there. These are now THREE dependent txs (permit, then
        // both transferFrom legs against the allowance it granted), so the nonce
        // ordering matters even more: a gap would strand the fee leg.
        //
        // THIS is the path a player's withdrawal actually takes, and both legs need
        // their gas limit set for the same reason transfer_g_for's does: an unset
        // limit makes ethers dry-run the transfer against a chain where the permit
        // has not been mined, the allowance reads zero, and it refuses to broadcast
        // with "SuperToken: transfer amount exceeds allowance". With three
        // dependent txs there were two legs exposed to it, not one.
        let mut permit_call =
            self.g_token.permit(from, spender, gross, U256::from(deadline), v, r, s);
        let mut transfer_call = self.g_token.transfer_from(from, to, net);
        let mut fee_call = self.g_token.transfer_from(from, fee_to, fee);
        transfer_call.tx.set_gas(TRANSFER_FROM_GAS);
        fee_call.tx.set_gas(TRANSFER_FROM_GAS);

        let (permit_pending, transfer_pending, fee_pending) = {
            let _tx = self.tx_lock.lock().await;

            let nonce = self
                .client
                .get_transaction_count(spender, Some(ethers::types::BlockNumber::Pending.into()))
                .await
                .map_err(|e| format!("nonce read failed: {}", e))?;
            permit_call.tx.set_nonce(nonce);
            transfer_call.tx.set_nonce(nonce + 1);
            fee_call.tx.set_nonce(nonce + 2);

            let permit_pending = permit_call
                .send()
                .await
                .map_err(|e| tag_gas(format!("permit submission failed: {}", e)))?;
            let transfer_pending = transfer_call
                .send()
                .await
                .map_err(|e| tag_gas(format!("transferFrom submission failed: {}", e)))?;
            let fee_pending = if fee.is_zero() {
                None
            } else {
                Some(
                    fee_call
                        .send()
                        .await
                        .map_err(|e| tag_gas(format!("fee transferFrom submission failed: {}", e)))?,
                )
            };

            (permit_pending, transfer_pending, fee_pending)
        };

        let hash = transfer_pending.tx_hash();

        let permit_receipt = tokio::time::timeout(Duration::from_secs(90), permit_pending.confirmations(1))
            .await
            .map_err(|_| "permit tx timed out".to_string())?
            .map_err(|e| format!("permit tx failed: {}", e))?
            .ok_or_else(|| "permit tx was dropped from mempool".to_string())?;
        if permit_receipt.status == Some(0.into()) {
            return Err("permit reverted — signature invalid, expired, or already used".to_string());
        }

        let receipt = tokio::time::timeout(Duration::from_secs(90), transfer_pending.confirmations(1))
            .await
            .map_err(|_| "transfer tx timed out".to_string())?
            .map_err(|e| format!("transfer tx failed: {}", e))?
            .ok_or_else(|| "transfer tx was dropped from mempool".to_string())?;
        if receipt.status == Some(0.into()) {
            return Err("transfer reverted on-chain — nothing was moved".to_string());
        }

        // The fee leg is deliberately NOT fatal. The player has already been paid
        // by this point; failing their withdrawal because our own fee collection
        // hiccuped would take money they successfully received and report it as an
        // error. A missed fee is our loss to reconcile, not their problem.
        if let Some(pending) = fee_pending {
            match tokio::time::timeout(Duration::from_secs(90), pending.confirmations(1)).await {
                Ok(Ok(Some(r))) if r.status != Some(0.into()) => {
                    tracing::info!("withdraw fee collected: {} -> {} amount={}", from, fee_to, fee);
                }
                other => {
                    tracing::error!(
                        "WITHDRAW FEE LEG FAILED for {} (fee {} to {}) — player was paid, fee was not collected: {:?}",
                        from, fee, fee_to, other.map(|r| r.map(|o| o.map(|x| x.transaction_hash))),
                    );
                }
            }
        }

        tracing::info!("transferG (net): {} -> {} amount={} fee={} tx={:?}", from, to, net, fee, hash);
        Ok(hash)
    }

    /// The StillHuntRewardPool address — the sink destination for Survival re-arm G$
    /// (spent G$ flows into the prize pool). `None` if the pool isn't configured.
    pub fn reward_pool_address(&self) -> Option<Address> {
        self.reward_pool.as_ref().map(|p| p.address())
    }

    /// Survival re-arm — step 1 of the session-allowance model. Relays the player's
    /// EIP-2612 permit so this backend wallet gets an allowance of `cap` G$ to spend
    /// on their behalf for the run. ONE signature (this permit) authorizes many
    /// instant re-arms after. Waits for confirmation so the allowance is live before
    /// the run starts (this happens at the pre-run screen, not mid-combat).
    pub async fn set_rearm_allowance(
        &self,
        owner: Address,
        cap: U256,
        deadline: u64,
        v: u8,
        r_hex: &str,
        s_hex: &str,
    ) -> Result<H256, String> {
        let r: [u8; 32] = H256::from_str(r_hex).map_err(|_| format!("Invalid r: {}", r_hex))?.0;
        let s: [u8; 32] = H256::from_str(s_hex).map_err(|_| format!("Invalid s: {}", s_hex))?.0;
        let spender = self.client.address();

        let call = self.g_token.permit(owner, spender, cap, U256::from(deadline), v, r, s);
        let pending = {
            let _tx = self.tx_lock.lock().await;
            call.send().await.map_err(|e| tag_gas(format!("permit submission failed: {}", e)))?
        };
        let hash = pending.tx_hash();
        tokio::time::timeout(Duration::from_secs(90), pending.confirmations(1))
            .await
            .map_err(|_| "arm permit timed out".to_string())?
            .map_err(|e| format!("arm permit failed on-chain: {}", e))?
            .ok_or_else(|| "arm permit dropped from mempool".to_string())?;
        tracing::info!("rearm allowance set: {} cap={} tx={:?}", owner, cap, hash);
        Ok(hash)
    }

    /// Survival re-arm — step 2. Spends `cost` G$ from the player's pre-authorized
    /// allowance into `to` (the RewardPool sink). Broadcast-only (no confirmation
    /// wait) so re-arms feel instant; the allowance + a balance pre-check make the
    /// transfer a near-certainty to land. Returns the tx hash once broadcast.
    pub async fn spend_rearm(&self, owner: Address, to: Address, cost: U256) -> Result<H256, String> {
        let call = self.g_token.transfer_from(owner, to, cost);
        let pending = {
            let _tx = self.tx_lock.lock().await;
            call.send().await.map_err(|e| format!("re-arm transfer failed: {}", e))?
        };
        let hash = pending.tx_hash();
        tracing::info!("rearm spend: {} -{} G$(wei) → {:?} tx={:?}", owner, cost, to, hash);
        Ok(hash)
    }

    /// Reads how much of the player's G$ this backend wallet is currently allowed to
    /// spend (the live session-allowance remaining). Used to gate a re-arm.
    pub async fn g_allowance(&self, owner: Address) -> Result<U256, String> {
        let spender = self.client.address();
        self.g_token.allowance(owner, spender).call().await
            .map_err(|e| format!("allowance read failed: {}", e))
    }

    /// Reads the player's on-chain G$ balance. Used to gate a re-arm.
    pub async fn g_balance(&self, owner: Address) -> Result<U256, String> {
        self.g_token.balance_of(owner).call().await
            .map_err(|e| format!("balance read failed: {}", e))
    }

    /// Reads an address's native CELO balance — used to decide whether a wallet
    /// needs a gas top-up to afford its own GoodDollar UBI claim.
    pub async fn celo_balance(&self, addr: Address) -> Result<U256, String> {
        use ethers::providers::Middleware;
        self.client.get_balance(addr, None).await
            .map_err(|e| format!("CELO balance read failed: {}", e))
    }

    /// Drip a small amount of native CELO to `to` so a 0-CELO Magic wallet can pay
    /// gas for its own UBI claim (fallback for when GoodDollar's free faucet doesn't
    /// come through). The relay wallet pays. Returns the transfer tx hash.
    pub async fn send_celo(&self, to: Address, amount_wei: U256) -> Result<H256, String> {
        use ethers::providers::Middleware;
        use ethers::types::TransactionRequest;
        let tx = TransactionRequest::new().to(to).value(amount_wei);
        let pending = {
            let _lock = self.tx_lock.lock().await;
            self.client.send_transaction(tx, None).await
                .map_err(|e| format!("CELO transfer submission failed: {}", e))?
        };
        let hash = pending.tx_hash();
        tokio::time::timeout(Duration::from_secs(90), pending.confirmations(1))
            .await
            .map_err(|_| "CELO transfer timed out".to_string())?
            .map_err(|e| format!("CELO transfer failed: {}", e))?
            .ok_or_else(|| "CELO transfer was dropped from mempool".to_string())?;
        Ok(hash)
    }

    /// This wallet's own address — the frontend needs it as the `spender` in
    /// the EIP-2612 permit it signs for `transfer_g_for` above.
    pub fn relay_address(&self) -> Address {
        self.client.address()
    }
}
