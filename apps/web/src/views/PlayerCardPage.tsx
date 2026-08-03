'use client'

import { useParams, useRouter } from 'next/navigation'
import { useResolvedAuth } from '@/hooks/useResolvedAuth'
import { shareCard } from '@/lib/shareCard'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Swords, Copy, Check, Download, ArrowLeft } from 'lucide-react'
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
import type { Player } from '@/types'
import PlayerCard from '@/components/player-card/PlayerCard'
import LoadingScreen from '@/components/ui/LoadingScreen'
import { RANK_COLORS } from '@/lib/constants'
import { formatGDollarNumber } from '@/utils/format'

export default function PlayerCardPage() {
  const params = useParams()
  const router = useRouter()
  const walletAddress = params?.walletAddress as string | undefined
  const [player, setPlayer] = useState<Player | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [copied, setCopied] = useState(false)

  const { status: authStatus } = useResolvedAuth()
  const signedIn = authStatus === 'ready'

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  /**
   * Save the card as a picture WITHOUT leaving the page.
   *
   * A plain <a download> navigated the tab to the PNG, and on iOS that lands in
   * the Files viewer ("Open in iRAR") with no route into Photos. Fetching the
   * blob and handing it to the share sheet is the only way a phone offers
   * "Save Image"; desktop has no share sheet, so it gets a real anchor download.
   * Either way the player stays on their card.
   */
  async function downloadCard() {
    if (!walletAddress || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/card/${walletAddress}/download`)
      if (!res.ok) throw new Error(String(res.status))
      const blob = await res.blob()
      const filename = `stillhunt-${(player?.username || player?.character_name || 'card')
        .replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`
      const file = new File([blob], filename, { type: 'image/png' })

      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
      if (typeof navigator.share === 'function' && nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // Dismissing the share sheet is a choice, not a failure — say nothing.
    } finally {
      setSaving(false)
    }
  }

  function copyCardUrl() {
    void shareCard(walletAddress as string, player?.username || player?.character_name)
      .then((outcome) => {
        // Only confirm when there is something to confirm. A native share sheet
        // gives its own feedback, and a cancelled one should say nothing at all.
        if (outcome !== 'copied') return
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {})
  }

  useEffect(() => {
    if (!walletAddress) return

    fetch(`${API}/players/${walletAddress}`)
      .then(async res => {
        if (!res.ok) { setNotFound(true); return }
        const data: Player = await res.json()
        setPlayer(data)
        document.title = `${data.character_name} | StillHunt`
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))

    return () => {
      document.title = 'StillHunt'
    }
  }, [walletAddress])

  if (loading) return <LoadingScreen />

  if (notFound || !player) {
    return (
      <div className="min-h-screen bg-stillhunt-dark flex flex-col items-center justify-center gap-4 p-6">
        <Swords size={52} className="text-slate-600" strokeWidth={1.2} />
        <p className="text-white font-display text-2xl font-bold">Warrior Not Found</p>
        <p className="text-slate-400 text-sm">This address hasn't created a character yet.</p>
        <Link
          href="/"
          className="mt-2 px-6 py-2.5 bg-hunt-gold text-black font-bold rounded-lg hover:bg-hunt-gold-light transition-colors text-sm"
        >
          Enter StillHunt
        </Link>
      </div>
    )
  }

  const rankColor = RANK_COLORS[player.rank]

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0a0a0f 0%, #12121a 100%)' }}
    >
      {/* Rank-colored ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 40%, ${rankColor}0d 0%, transparent 65%)`,
        }}
      />

      {/* Way out. A card is usually opened from a link in a chat, so history may
          be empty — fall back to home rather than leaving someone stranded on a
          page whose only other exits are "Challenge" and "Share". */}
      <motion.div
        className="w-full max-w-sm z-10"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Sits in the same column as the card, so it lines up with the content
            instead of floating against the top-left corner of the viewport. */}
        <button
          onClick={() => { if (window.history.length > 1) router.back(); else router.push('/') }}
          className="mb-3 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-colors"
          style={{ background: 'rgba(6,10,16,.6)', border: '1px solid rgba(255,255,255,.12)' }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        <PlayerCard player={player} isPublic />

        {/* CTA below card */}
        <motion.div
          className="mt-6 text-center flex flex-col gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <p className="text-slate-500 text-sm">
            <span className="text-hunt-gold font-bold">{player.character_name}</span> has earned{' '}
            <span className="text-hunt-gold font-bold">
              {formatGDollarNumber(player.g_earned_lifetime)} G$
            </span>{' '}
            playing StillHunt.
          </p>

          {/* THE reason a shared card exists. This was a grey "Create your own
              warrior →" under everything else, which is not an invitation — a
              stranger who followed someone's link had no obvious way in. It is
              now the primary action.

              The ?ref rides along even though middleware.ts already wrote the
              referral cookie when this page loaded: the cookie is the reliable
              path, the query is the belt-and-braces one for a visitor whose
              cookie was blocked or cleared between landing and tapping. */}
          <Link
            href={signedIn ? '/' : `/?ref=${walletAddress}`}
            className={
              signedIn
                ? 'self-center px-6 py-2.5 rounded-xl font-bold text-xs text-center tracking-wide transition-transform active:scale-[0.98]'
                : 'w-full px-5 py-4 rounded-xl font-black text-base text-center tracking-wide transition-transform active:scale-[0.98]'
            }
            style={
              signedIn
                ? { background: 'rgba(234,179,8,0.12)', color: '#eab308', border: '1px solid rgba(234,179,8,0.35)' }
                : { background: 'linear-gradient(180deg,#fde047,#eab308)', color: '#0a0a0f', boxShadow: '0 6px 24px rgba(234,179,8,0.25)' }
            }
          >
            {signedIn ? 'ENTER STILLHUNT' : 'JOIN STILLHUNT'}
          </Link>
          <p className="text-[11px] text-slate-600 -mt-1">
            {signedIn
              ? 'Back to your own warrior'
              : 'Create your character, fight, and earn real G$ on Celo.'}
          </p>

          {/* Action row */}
          <div className="flex gap-2 justify-center">
            <Link
              href={`/battle?challenge=${walletAddress}`}
              className="flex-1 max-w-45 px-5 py-3 rounded-xl font-bold text-sm text-center transition-colors"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              <span className="flex items-center justify-center gap-1.5">
                <Swords size={14} /> Challenge
              </span>
            </Link>
            <button
              onClick={copyCardUrl}
              className="flex-1 max-w-45 flex items-center justify-center gap-1.5 px-5 py-3 rounded-xl font-bold text-sm transition-colors"
              style={{ background: 'rgba(234,179,8,0.1)', color: copied ? '#22c55e' : '#eab308', border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : 'rgba(234,179,8,0.25)'}` }}
            >
              {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Share</>}
            </button>
          </div>

          {/* Downloads the SAME picture the link preview uses, as a PNG file —
              so a player posts the card itself on X instead of a phone
              screenshot with a status bar across the top. */}
          <button
            onClick={downloadCard}
            disabled={saving}
            className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl font-bold text-xs transition-colors disabled:opacity-60"
            style={{ background: 'rgba(255,255,255,0.04)', color: saved ? '#22c55e' : '#cbd5e1', border: `1px solid ${saved ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.12)'}` }}
          >
            {saved
              ? <><Check size={14} /> Saved</>
              : <><Download size={14} /> {saving ? 'Preparing…' : 'Save card as picture'}</>}
          </button>

        </motion.div>
      </motion.div>
    </div>
  )
}
