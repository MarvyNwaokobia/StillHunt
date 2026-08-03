'use client';

import { useCallback, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export interface WaveBoardEntry {
  rank: number;
  wallet_address: string;
  username: string | null;
  waves: number;
  est_payout_g?: number;
}

/**
 * The wave ladder, shared by Campaign Endless and the Seasonal Campaign.
 *
 * Ranked by WAVES COMPLETED — the same number the player watches climb in the HUD —
 * with ties broken by who reached that wave first, so no two players ever share a
 * place. Omit `seasonId` for the all-time Campaign Endless board.
 */
export default function WaveBoard({
  seasonId,
  highlightWallet,
  limit = 25,
  title = 'Wave Leaderboard',
}: {
  seasonId?: string;
  highlightWallet?: string;
  limit?: number;
  title?: string;
}) {
  const [entries, setEntries] = useState<WaveBoardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (seasonId) qs.set('season_id', seasonId);
      const res = await fetch(`${API}/endless/board?${qs}`);
      if (res.ok) setEntries((await res.json()).entries ?? []);
    } catch {
      /* offline — show the empty state rather than breaking the page */
    } finally {
      setLoading(false);
    }
  }, [seasonId, limit]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-slate-500">{title}</p>
        <button onClick={load} className="text-[10px] uppercase tracking-widest text-slate-600 hover:text-slate-300">
          refresh
        </button>
      </div>

      {loading ? (
        <p className="text-slate-600 text-sm">loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-slate-600 text-sm">No one has cleared a wave yet. Be first.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {entries.map((e) => {
            const mine = e.wallet_address.toLowerCase() === (highlightWallet ?? '').toLowerCase();
            return (
              <div
                key={e.wallet_address}
                className="flex items-center gap-3 px-4 py-2.5 rounded-xl border"
                style={{
                  background: mine ? 'rgba(234,179,8,0.08)' : 'rgba(8,8,14,0.9)',
                  borderColor: mine ? 'rgba(234,179,8,0.4)' : 'rgba(42,42,58,0.8)',
                }}
              >
                <span className="font-display font-black text-slate-500 w-6 tabular-nums">{e.rank}</span>
                <span className="flex-1 min-w-0 truncate text-white text-sm">
                  {e.username || `${e.wallet_address.slice(0, 6)}…${e.wallet_address.slice(-4)}`}
                  {mine && <span className="text-amber-500/70 text-[10px] uppercase tracking-widest ml-2">you</span>}
                </span>
                <span className="text-white font-bold tabular-nums text-sm">{e.waves}</span>
                <span className="text-[10px] uppercase tracking-widest text-slate-600">waves</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
