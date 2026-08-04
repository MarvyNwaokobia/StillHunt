import { ImageResponse } from 'next/og'
import { RANK_DEFINITIONS } from '@/lib/ranks'
import type { Rank } from '@/types/database'

/**
 * ONE picture of a player's card, used for two jobs.
 *
 * It is the social preview (opengraph-image) AND the file a player downloads to
 * post on X. Those were going to drift the moment they were written twice, and a
 * download that looks different from the link preview is the sort of thing people
 * notice immediately — so both routes render this.
 *
 * 1200x630 because that is what every link unfurler crops to. It also posts to X
 * without letterboxing, which is where these are actually going.
 */
export const CARD_IMAGE_SIZE = { width: 1200, height: 630 }

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

interface CardPlayer {
  character_name: string
  username: string | null
  rank: Rank
  character_class: string | null
  wins: number
  losses: number
  prestige_level?: number
  xp?: number
  g_earned_lifetime?: number
}

/** Compact G$ for a picture: 14000 -> "14.0k". */
function compactG(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(Math.round(n))
}

export async function renderCardImage(walletAddress: string): Promise<ImageResponse> {
  // Never let a dead API produce a broken image — a card with placeholder text
  // still previews, a 500 leaves the link bare, which is the thing this fixes.
  let player: CardPlayer | null = null
  let recruited = 0
  try {
    const [pRes, rRes] = await Promise.all([
      fetch(`${API}/players/${walletAddress.toLowerCase()}`, { cache: 'no-store' }),
      fetch(`${API}/players/${walletAddress.toLowerCase()}/referrals`, { cache: 'no-store' }).catch(() => null),
    ])
    if (pRes.ok) player = (await pRes.json()) as CardPlayer
    if (rRes?.ok) {
      const r = await rRes.json()
      if (typeof r?.recruited === 'number') recruited = r.recruited
    }
  } catch {
    player = null
  }

  const rank: Rank = player?.rank && RANK_DEFINITIONS[player.rank] ? player.rank : 'Drifter'
  const def = RANK_DEFINITIONS[rank]
  const name = player?.character_name || player?.username || 'Unclaimed Warrior'
  const handle = player?.username ? `@${player.username}` : null
  const wins = player?.wins ?? 0
  const losses = player?.losses ?? 0
  const total = wins + losses
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0
  const earned = player?.g_earned_lifetime ?? 0
  const prestige = player?.prestige_level ?? 0
  const rankLabel = prestige > 0 ? `${def.label} ${'I'.repeat(Math.min(prestige, 3))}` : def.label

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#04030c',
          backgroundImage: `radial-gradient(ellipse 90% 70% at 50% 0%, ${def.color}22 0%, transparent 65%)`,
          padding: 56,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', width: '100%', height: 10, background: def.color }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', fontSize: 24, letterSpacing: 10, color: '#eab308', fontWeight: 800 }}>
            STILLHUNT
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 22 }}>
            <div style={{ display: 'flex', fontSize: 76, color: '#ffffff', fontWeight: 800 }}>{name}</div>
            {handle && (
              <div style={{ display: 'flex', fontSize: 30, color: '#64748b', paddingBottom: 14 }}>{handle}</div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div
              style={{
                display: 'flex',
                padding: '9px 22px',
                borderRadius: 10,
                background: def.badgeBg,
                color: def.color,
                fontSize: 28,
                fontWeight: 800,
                letterSpacing: 3,
              }}
            >
              {rankLabel}
            </div>
            {player?.character_class && (
              <div style={{ display: 'flex', fontSize: 28, color: '#94a3b8' }}>{player.character_class}</div>
            )}
          </div>

          {/* The numbers a player would actually screenshot for. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 40, marginTop: 6 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', fontSize: 18, letterSpacing: 3, color: '#64748b' }}>RECORD</div>
              <div style={{ display: 'flex', fontSize: 34, color: '#e2e8f0', fontWeight: 700 }}>
                {wins}W / {losses}L
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', fontSize: 18, letterSpacing: 3, color: '#64748b' }}>WIN RATE</div>
              <div style={{ display: 'flex', fontSize: 34, color: '#e2e8f0', fontWeight: 700 }}>{winRate}%</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', fontSize: 18, letterSpacing: 3, color: '#64748b' }}>EARNED</div>
              <div style={{ display: 'flex', fontSize: 34, color: '#eab308', fontWeight: 800 }}>
                {compactG(earned)} G$
              </div>
            </div>
            {/* Hidden at zero, like the other surfaces. */}
            {recruited > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', fontSize: 18, letterSpacing: 3, color: '#64748b' }}>RECRUITED</div>
                <div style={{ display: 'flex', fontSize: 34, color: '#e2e8f0', fontWeight: 700 }}>{recruited}</div>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', fontSize: 22, color: '#64748b' }}>
            One human. One fighter. Earn real G$ on Celo.
          </div>
          {/* The player's own link, so a screenshot still points somewhere. */}
          <div style={{ display: 'flex', fontSize: 22, color: '#eab308', fontWeight: 700 }}>
            stillhunt.app{handle ? `/${player?.username}` : ''}
          </div>
        </div>
      </div>
    ),
    CARD_IMAGE_SIZE,
  )
}
