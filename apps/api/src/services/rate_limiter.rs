use dashmap::DashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

/// Per-key sliding-window rate limiter.
///
/// Hold this in an `Arc` and clone the Arc into every worker. Constructing one
/// per worker gives each its own counters, so the effective limit becomes
/// `limit * worker_count` — which is what this used to do, silently.
pub struct RateLimiter {
    buckets:     DashMap<String, (Instant, u32)>,
    limit:       u32,
    window_secs: u64,
    /// Calls since the last sweep. Only used to pace `retain`, so relaxed
    /// ordering is fine — an occasional missed increment just delays a sweep.
    calls:       AtomicU64,
}

/// How many `check` calls between sweeps of expired buckets.
///
/// Without this the map only ever forgets a key that is seen again, so every
/// one-off key stays for the process's lifetime. That is a slow leak normally
/// and a fast one whenever the key is attacker-controlled.
const SWEEP_EVERY: u64 = 1_000;

impl RateLimiter {
    pub fn new(limit: u32, window_secs: u64) -> Self {
        Self {
            buckets: DashMap::new(),
            limit,
            window_secs,
            calls: AtomicU64::new(0),
        }
    }

    /// `true` if the request is within the limit, `false` if it should be rejected.
    pub fn check(&self, key: &str) -> bool {
        let now = Instant::now();

        if self.calls.fetch_add(1, Ordering::Relaxed) % SWEEP_EVERY == 0 {
            self.sweep(now);
        }

        let mut entry = self.buckets.entry(key.to_string()).or_insert((now, 0));
        if now.duration_since(entry.0).as_secs() >= self.window_secs {
            *entry = (now, 1); // window expired — start a fresh one
            true
        } else if entry.1 < self.limit {
            entry.1 += 1;
            true
        } else {
            false
        }
    }

    /// Drops buckets whose window has closed.
    fn sweep(&self, now: Instant) {
        self.buckets
            .retain(|_, (at, _)| now.duration_since(*at).as_secs() < self.window_secs);
    }

    /// Buckets currently held. Tests and diagnostics only.
    pub fn tracked_keys(&self) -> usize {
        self.buckets.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_up_to_the_limit_then_refuses() {
        let rl = RateLimiter::new(3, 60);
        for i in 0..3 {
            assert!(rl.check("ip"), "request {i} should be allowed");
        }
        assert!(!rl.check("ip"), "the 4th request is over the limit");
    }

    #[test]
    fn keys_are_counted_independently() {
        let rl = RateLimiter::new(1, 60);
        assert!(rl.check("a"));
        assert!(!rl.check("a"));
        // A different key must be unaffected by a's exhausted budget.
        assert!(rl.check("b"));
    }

    #[test]
    fn a_shared_limiter_counts_once_across_clones() {
        // The bug this replaces: one limiter per worker meant the real limit was
        // limit x workers. Sharing an Arc is what makes the number mean anything.
        let rl = std::sync::Arc::new(RateLimiter::new(2, 60));
        let a = rl.clone();
        let b = rl.clone();
        assert!(a.check("ip"));
        assert!(b.check("ip"));
        assert!(!a.check("ip"), "the third call is over the shared limit");
    }

    #[test]
    fn expired_buckets_are_swept_rather_than_kept_for_ever() {
        // Zero-length window so every bucket is immediately stale.
        let rl = RateLimiter::new(5, 0);
        for i in 0..SWEEP_EVERY {
            rl.check(&format!("key-{i}"));
        }
        // A sweep runs on the next call; without it this would hold SWEEP_EVERY keys.
        rl.check("trigger");
        assert!(
            rl.tracked_keys() < SWEEP_EVERY as usize,
            "expired buckets should be dropped, held {}",
            rl.tracked_keys(),
        );
    }
}
