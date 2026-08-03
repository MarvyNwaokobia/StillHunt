use anyhow::{anyhow, Result};
use ethers::{
    abi::{encode, Token},
    core::utils::keccak256,
    signers::{LocalWallet, Signer},
    types::{Address, U256},
};

// Production Celo engagement rewards proxy contract
const ENGAGEMENT_REWARDS_CONTRACT: &str = "0x25db74CF4E7BA120526fd87e159CF656d94bAE43";
const CELO_CHAIN_ID: u64 = 42220;
// App description registered with GoodDollar — must match exactly what was registered
pub const APP_DESCRIPTION: &str = "StillHunt - Play to Earn";

#[derive(Clone)]
pub struct RewardService {
    pub app_address: Address,
    pub contract_address: Address,
    pub rpc_url: String,
    signer: LocalWallet,
}

impl RewardService {
    pub fn from_env() -> Result<Self> {
        let private_key = std::env::var("BACKEND_PRIVATE_KEY")
            .map_err(|_| anyhow!("BACKEND_PRIVATE_KEY not set"))?;

        let signer: LocalWallet = private_key
            .parse::<LocalWallet>()
            .map_err(|e| anyhow!("Invalid BACKEND_PRIVATE_KEY: {}", e))?
            .with_chain_id(CELO_CHAIN_ID);

        // RELAY_ADDRESS can differ from the signing key — the contract's setAppSigner
        // allows delegating signing to a separate key from the registered app address.
        let app_address: Address = std::env::var("RELAY_ADDRESS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(signer.address());

        let contract_address: Address = std::env::var("ENGAGEMENT_REWARDS_CONTRACT")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or_else(|| ENGAGEMENT_REWARDS_CONTRACT.parse().unwrap());

        Ok(Self {
            app_address,
            contract_address,
            rpc_url: std::env::var("CELO_RPC_URL")
                .unwrap_or_else(|_| "https://forno.celo.org".into()),
            signer,
        })
    }

    pub fn app_address_hex(&self) -> String {
        format!("{:#x}", self.app_address)
    }

    /// Generate an EIP-712 AppClaim signature authorising `user` to claim.
    ///
    /// AppClaim typed hash:
    ///   "AppClaim(address app,address user,uint256 validUntilBlock)"
    ///
    /// The resulting signature is verified by the EngagementRewards contract via
    /// nonContractAppClaim together with the user's own Claim signature.
    pub async fn sign_app_claim(
        &self,
        user: Address,
        valid_until_block: U256,
    ) -> Result<String> {
        // ── Domain separator ──────────────────────────────────────────────────
        let domain_type_hash = keccak256(
            b"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
        );
        let name_hash = keccak256(b"EngagementRewards");
        let version_hash = keccak256(b"1.0");

        let domain_encoded = encode(&[
            Token::FixedBytes(domain_type_hash.to_vec()),
            Token::FixedBytes(name_hash.to_vec()),
            Token::FixedBytes(version_hash.to_vec()),
            Token::Uint(U256::from(CELO_CHAIN_ID)),
            Token::Address(self.contract_address),
        ]);
        let domain_separator = keccak256(&domain_encoded);

        // ── Struct hash ───────────────────────────────────────────────────────
        let type_hash =
            keccak256(b"AppClaim(address app,address user,uint256 validUntilBlock)");

        let struct_encoded = encode(&[
            Token::FixedBytes(type_hash.to_vec()),
            Token::Address(self.app_address),
            Token::Address(user),
            Token::Uint(valid_until_block),
        ]);
        let struct_hash = keccak256(&struct_encoded);

        // ── Final EIP-191 digest: "\x19\x01" || domainSeparator || structHash ─
        let mut digest_input = [0u8; 66];
        digest_input[0] = 0x19;
        digest_input[1] = 0x01;
        digest_input[2..34].copy_from_slice(&domain_separator);
        digest_input[34..66].copy_from_slice(&struct_hash);
        let digest = keccak256(&digest_input);

        let sig = self
            .signer
            .sign_hash(digest.into())
            .map_err(|e| anyhow!("Signing failed: {}", e))?;

        let sig_bytes = sig.to_vec();
        let hex: String = sig_bytes.iter().map(|b| format!("{:02x}", b)).collect();
        Ok(format!("0x{}", hex))
    }

    /// Get current Celo block number via JSON-RPC.
    pub async fn get_current_block(&self) -> Result<u64> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()?;

        let res: serde_json::Value = client
            .post(&self.rpc_url)
            .json(&serde_json::json!({
                "jsonrpc": "2.0",
                "method": "eth_blockNumber",
                "params": [],
                "id": 1
            }))
            .send()
            .await?
            .json()
            .await?;

        let hex = res["result"]
            .as_str()
            .ok_or_else(|| anyhow!("No block number in RPC response"))?;

        u64::from_str_radix(hex.trim_start_matches("0x"), 16)
            .map_err(|e| anyhow!("Block number parse error: {}", e))
    }
}
