import type { MatchEndMsg } from '../multiplayer/CombatProtocol';

/**
 * Reports a finished real-time PvP match to the API so both players are awarded
 * (XP / rank / G$). This is the bridge from GameRoom's authoritative MatchEnd to
 * the economy — called by the trusted realtime sim host, never by a client. The
 * shared secret authenticates the host to the server-only `/battles/pvp/complete`
 * endpoint (the API computes all amounts; the host only reports who won).
 */
export interface ReportMatchOpts {
  apiUrl: string;
  /** Shared secret matching the API's PVP_SERVER_SECRET. */
  secret: string;
  /** How long the fight ran, for the API's min-duration guard. */
  durationSecs: number;
  /** Injectable for tests / non-browser hosts. */
  fetchImpl?: typeof fetch;
}

export interface PvpAwardResult {
  battleId: string;
  winner: { wallet: string; xpAwarded: number; rankedUp: boolean; newRank: string | null; gAwarded: number };
  loser:  { wallet: string; xpAwarded: number; rankedUp: boolean; newRank: string | null; gAwarded: number };
}

export async function reportPvpMatch(
  matchEnd: MatchEndMsg,
  opts: ReportMatchOpts,
): Promise<PvpAwardResult | null> {
  const f = opts.fetchImpl ?? fetch;
  try {
    const res = await f(`${opts.apiUrl}/battles/pvp/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pvp-secret': opts.secret,
      },
      body: JSON.stringify({
        winner_wallet: matchEnd.winnerId,
        loser_wallet: matchEnd.loserId,
        duration_secs: opts.durationSecs,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      battleId: data.battle_id,
      winner: {
        wallet: data.winner.wallet,
        xpAwarded: data.winner.xp_awarded,
        rankedUp: data.winner.ranked_up,
        newRank: data.winner.new_rank ?? null,
        gAwarded: data.winner.g_awarded,
      },
      loser: {
        wallet: data.loser.wallet,
        xpAwarded: data.loser.xp_awarded,
        rankedUp: data.loser.ranked_up,
        newRank: data.loser.new_rank ?? null,
        gAwarded: data.loser.g_awarded,
      },
    };
  } catch {
    return null;
  }
}
