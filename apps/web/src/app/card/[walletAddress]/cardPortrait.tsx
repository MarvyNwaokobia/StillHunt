import { ImageResponse } from 'next/og'
import { RANK_DEFINITIONS } from '@/lib/ranks'
import { CLASS_DEFINITIONS } from '@/lib/classes'
import { xpForNextRank } from '@/lib/constants'
import type { Rank } from '@/types/database'

/**
 * The DOWNLOADABLE card — a portrait picture of the card as it appears in the app.
 *
 * Deliberately a different shape from the link preview (see ./cardImage, 1200x630).
 * A preview is cropped to a wide strip by every unfurler, but a download is going
 * to be posted as an image, and a landscape banner is not what a player sees on
 * screen or expects to share. 1080x1130 fits the card content with no dead space, and posts whole on X.
 *
 * Laid out to mirror PlayerCard: avatar ring, name + handle, win rate, rank and
 * class badges, XP meter, ATK/DEF/SPD, record + earned, achievements, footer.
 */
export const CARD_PORTRAIT_SIZE = { width: 1080, height: 1130 }

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

interface CardPlayer {
  wallet_address: string
  character_name: string
  username: string | null
  rank: Rank
  character_class: string | null
  wins: number
  losses: number
  xp: number
  prestige_level?: number
  attack_stat?: number
  defense_stat?: number
  speed_stat?: number
  g_earned_lifetime?: number
  last_active?: string
}

function compactG(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(Math.round(n))
}

function timeAgo(iso?: string): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return 'Active just now'
  if (h < 24) return `Active ${h}h ago`
  return `Active ${Math.floor(h / 24)}d ago`
}

export async function renderCardPortrait(walletAddress: string): Promise<ImageResponse> {
  const wallet = walletAddress.toLowerCase()

  let player: CardPlayer | null = null
  let unlocked = 0
  let recruited = 0
  try {
    const [pRes, aRes, rRes] = await Promise.all([
      fetch(`${API}/players/${wallet}`, { cache: 'no-store' }),
      fetch(`${API}/players/${wallet}/achievements`, { cache: 'no-store' }).catch(() => null),
      fetch(`${API}/players/${wallet}/referrals`, { cache: 'no-store' }).catch(() => null),
    ])
    if (pRes.ok) player = (await pRes.json()) as CardPlayer
    if (aRes?.ok) {
      const rows = await aRes.json()
      if (Array.isArray(rows)) unlocked = rows.length
    }
    if (rRes?.ok) {
      const r = await rRes.json()
      if (typeof r?.recruited === 'number') recruited = r.recruited
    }
  } catch {
    player = null
  }

  const rank: Rank = player?.rank && RANK_DEFINITIONS[player.rank] ? player.rank : 'Drifter'
  const def = RANK_DEFINITIONS[rank]
  const classDef = player?.character_class
    ? CLASS_DEFINITIONS[player.character_class as keyof typeof CLASS_DEFINITIONS]
    : null
  const classColor = classDef?.accentColor ?? '#94a3b8'

  const name = player?.character_name || player?.username || 'Unclaimed Warrior'
  const handle = player?.username ? `@${player.username}` : null
  const wins = player?.wins ?? 0
  const losses = player?.losses ?? 0
  const total = wins + losses
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0
  const xp = player?.xp ?? 0
  const xpMax = xpForNextRank(rank)
  const pct = xpMax > 0 ? Math.min(100, Math.round((xp / xpMax) * 100)) : 0
  const prestige = player?.prestige_level ?? 0
  const rankLabel = prestige > 0 ? `${def.label} ${'I'.repeat(Math.min(prestige, 3))}` : def.label
  const earned = player?.g_earned_lifetime ?? 0

  const stat = (label: string, value: number, color: string) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flex: 1,
        padding: '26px 0 20px',
        borderRadius: 18,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <div style={{ display: 'flex', fontSize: 26, color: '#7c8899', letterSpacing: 3 }}>{label}</div>
      <div style={{ display: 'flex', fontSize: 54, color: '#ffffff', fontWeight: 800, marginTop: 4 }}>{value}</div>
      <div style={{ display: 'flex', width: 84, height: 5, borderRadius: 3, background: color, marginTop: 14 }} />
    </div>
  )

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#05060b',
          backgroundImage: `radial-gradient(ellipse 80% 50% at 50% 0%, ${def.color}1f 0%, transparent 60%)`,
          padding: 56,
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            borderRadius: 34,
            background: '#0b0c13',
            border: `2px solid ${def.color}44`,
            padding: 46,
          }}
        >
          {/* Identity */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 30 }}>
            <div
              style={{
                display: 'flex',
                width: 148,
                height: 148,
                borderRadius: 74,
                border: `5px solid ${def.color}`,
                flexShrink: 0,
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 10 }}>
              <div style={{ display: 'flex', fontSize: 52, color: '#ffffff', fontWeight: 800 }}>{name}</div>
              {handle && <div style={{ display: 'flex', fontSize: 26, color: '#6b7889' }}>{handle}</div>}
              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                <div
                  style={{
                    display: 'flex',
                    padding: '9px 20px',
                    borderRadius: 9,
                    background: def.badgeBg,
                    color: def.color,
                    fontSize: 24,
                    fontWeight: 800,
                    letterSpacing: 3,
                  }}
                >
                  {rankLabel.toUpperCase()}
                </div>
                {classDef && (
                  <div
                    style={{
                      display: 'flex',
                      padding: '9px 20px',
                      borderRadius: 9,
                      background: `${classColor}1f`,
                      border: `1px solid ${classColor}55`,
                      color: classColor,
                      fontSize: 24,
                      fontWeight: 800,
                      letterSpacing: 3,
                    }}
                  >
                    {String(player?.character_class ?? '').toUpperCase()}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', fontSize: 24, color: '#7c8899' }}>Win Rate</div>
              <div style={{ display: 'flex', fontSize: 52, color: '#ffffff', fontWeight: 800 }}>{winRate}%</div>
            </div>
          </div>

          {/* XP meter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 40 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', fontSize: 26, color: '#7c8899', letterSpacing: 4 }}>XP</div>
              <div style={{ display: 'flex', fontSize: 28, color: '#e2e8f0', fontWeight: 700 }}>
                {xp.toLocaleString()} <span style={{ color: '#55606f' }}>/ {xpMax.toLocaleString()}</span>
              </div>
            </div>
            <div style={{ display: 'flex', width: '100%', height: 16, borderRadius: 8, background: 'rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', width: `${pct}%`, height: 16, borderRadius: 8, background: def.color }} />
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 20, marginTop: 34 }}>
            {stat('ATK', player?.attack_stat ?? 0, '#ef4444')}
            {stat('DEF', player?.defense_stat ?? 0, '#3b82f6')}
            {stat('SPD', player?.speed_stat ?? 0, '#22c55e')}
          </div>

          {/* Record + earned */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 34,
              paddingTop: 28,
              borderTop: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div style={{ display: 'flex', fontSize: 38, fontWeight: 800 }}>
              <span style={{ color: '#22c55e' }}>{wins}W</span>
              <span style={{ color: '#55606f', margin: '0 10px' }}>/</span>
              <span style={{ color: '#ef4444' }}>{losses}L</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              {/* Hidden at zero — a new player's card should not advertise an
                  empty stat. */}
              {recruited > 0 && (
                <div style={{ display: 'flex', fontSize: 30, color: '#94a3b8' }}>
                  {recruited} recruited
                </div>
              )}
              <div style={{ display: 'flex', fontSize: 30, color: '#eab308', fontWeight: 700 }}>
                {compactG(earned)} TALLY earned
              </div>
            </div>
          </div>

          {/* Achievements */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 30 }}>
            <div style={{ display: 'flex', fontSize: 24, color: '#7c8899', letterSpacing: 4 }}>ACHIEVEMENTS</div>
            <div style={{ display: 'flex', gap: 16 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 96,
                    height: 96,
                    borderRadius: 14,
                    background: i < unlocked ? 'rgba(234,179,8,0.10)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${i < unlocked ? 'rgba(234,179,8,0.5)' : 'rgba(255,255,255,0.07)'}`,
                  }}
                >
                  {/* A rotated square, not a ★: Satori has no glyph for the star
                      and rendered it as a tofu box. */}
                  <div
                    style={{
                      display: 'flex',
                      width: 30,
                      height: 30,
                      transform: 'rotate(45deg)',
                      borderRadius: 5,
                      background: i < unlocked ? '#eab308' : '#252b34',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              marginTop: 'auto',
              paddingTop: 34,
              fontSize: 26,
              color: '#4a5462',
            }}
          >
            One human. One fighter. Earn real TALLY on Celo.
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: 30,
              fontSize: 24,
              color: '#55606f',
            }}
          >
            <div style={{ display: 'flex' }}>{timeAgo(player?.last_active)}</div>
            <div style={{ display: 'flex', color: '#eab308', fontWeight: 700 }}>
              stillhunt.app{handle ? `/${player?.username}` : ''}
            </div>
          </div>
        </div>
      </div>
    ),
    CARD_PORTRAIT_SIZE,
  )
}
