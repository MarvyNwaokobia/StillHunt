/// Returns true if `addr` is a valid Ethereum address (0x + 40 hex chars).
pub fn is_valid_wallet(addr: &str) -> bool {
    addr.len() == 42
        && addr.starts_with("0x")
        && addr[2..].chars().all(|c| c.is_ascii_hexdigit())
}

/// Normalises a wallet address to lowercase for DB comparisons.
pub fn normalize_wallet(addr: &str) -> String {
    addr.to_lowercase()
}
