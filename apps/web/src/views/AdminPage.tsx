'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useResolvedAuth } from '@/hooks/useResolvedAuth'
import { useActiveWalletClient } from '@/hooks/useActiveWalletClient'
import { formatGDollarNumber } from '@/utils/format'

const API = process.env.NEXT_PUBLIC_API_URL ?? ''
const SESSION_KEY = 'stillhunt-admin-session'

interface AdminSession {
  token: string
  wallet: string
  expires_at: number
}

interface Season {
  id: string
  name: string
  starts_at: string
  ends_at: string | null
}

interface AdminStats {
  season_name: string | null
  starts_at: string
  ends_at: string | null
  new_players: number
  active_players: number
  total_battles: number
  total_g_awarded: number
  total_g_volume: number
  total_g_transferred_out: number
}

interface OnchainRow {
  kind: string
  wallet: string
  detail: string | null
  tx_hash: string
  created_at: string
}

/** What GET /admin/seasons/:id/payout-preview returns — the exact shape of the
 *  transfer the Pay button will make, checked against the pool balance. */
interface PayoutWinner {
  rank: number
  wallet_address: string
  username: string | null
  waves: number
  amount_g: number
  status: string
  tx_hash: string | null
}
interface PayoutPreview {
  season: { id: string; name: string; ends_at: string | null; prize_pool_g: number; payout_status: string; closed: boolean }
  winners: PayoutWinner[]
  winner_count: number
  total_g: number
  unpaid_g: number
  tx_count: number
  pool_address: string | null
  pool_balance_g: number | null
  funded: boolean
  relay_celo: number | null
  can_pay: boolean
}

// Every category the API writes needs a label here, or real money shows up in the
// activity feed as a raw category string. The five below were invisible until the
// g_ledger CHECK that rejected them was dropped (fix_ledger_categories.sql).
const KIND_LABEL: Record<string, string> = {
  mission_record:       'Mission cleared',
  marketplace_purchase: 'Purchase',
  battle_reward:        'Reward paid',
  transfer_out:         'Transfer',
  ubi_claim:            'UBI claim',
  season_reward:        'Season prize',
  referral_reward:      'Referral',
  survival_rearm:       'Re-arm',
  duel_stake:           'Duel stake',
  duel_payout:          'Duel payout',
}

// ── CSV export ───────────────────────────────────────────────────────────────
type CsvValue = string | number | null | undefined

function csvCell(v: CsvValue): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(rows: CsvValue[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

function DownloadButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white border disabled:opacity-50 shrink-0"
      style={{ borderColor: '#2a2a3a' }}
    >
      ⤓ Download CSV
    </button>
  )
}

function loadSession(): AdminSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed: AdminSession = JSON.parse(raw)
    if (parsed.expires_at * 1000 <= Date.now()) return null
    return parsed
  } catch {
    return null
  }
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-hunt-surface border border-hunt-border rounded-xl p-4 flex flex-col gap-1">
      <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">{label}</p>
      <p className="font-display font-black text-white text-2xl leading-none">{value}</p>
    </div>
  )
}

export default function AdminPage() {
  const { address } = useResolvedAuth()
  const walletClient = useActiveWalletClient()

  const [session, setSession] = useState<AdminSession | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeason, setSelectedSeason] = useState<string | 'all'>('all')
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [onchain, setOnchain] = useState<OnchainRow[]>([])
  const [newSeasonName, setNewSeasonName] = useState('The Release')
  // A season is a SCHEDULED window with a prize split, not just a name. These default
  // to Season 1 as agreed: 27 Jul 2026 in local time, top 10 paid 50,000 G$ each.
  const [seasonStart, setSeasonStart] = useState('2026-07-27T00:00')
  const [seasonEnd, setSeasonEnd] = useState('2026-07-27T23:59')
  const [seasonWinners, setSeasonWinners] = useState(10)
  const [seasonPerWinner, setSeasonPerWinner] = useState(50000)
  const [busy, setBusy] = useState(false)
  const [showScheduler, setShowScheduler] = useState(false)
  const [preview, setPreview] = useState<PayoutPreview | null>(null)
  const [paying, setPaying] = useState(false)

  useEffect(() => { setSession(loadSession()) }, [])

  async function handleAdminLogin() {
    if (!address || !walletClient?.account) return
    setLoggingIn(true)
    setLoginError(null)
    try {
      const message = `StillHunt Admin Login\ntimestamp:${Math.floor(Date.now() / 1000)}`
      const signature = await walletClient.signMessage({ account: walletClient.account, message })

      const res = await fetch(`${API}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address, message, signature }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Login failed' }))
        throw new Error(body.error ?? 'Login failed')
      }
      const data: AdminSession = await res.json()
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data))
      setSession(data)
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoggingIn(false)
    }
  }

  const authedFetch = useCallback(
    (path: string, init?: RequestInit) => {
      if (!session) return Promise.reject(new Error('Not signed in'))
      return fetch(`${API}${path}`, {
        ...init,
        headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${session.token}` },
      })
    },
    [session],
  )

  const refreshSeasons = useCallback(async () => {
    const res = await authedFetch('/admin/seasons')
    if (res.ok) setSeasons(await res.json())
  }, [authedFetch])

  const refreshStats = useCallback(async () => {
    const qs = selectedSeason === 'all' ? '' : `?season_id=${selectedSeason}`
    const res = await authedFetch(`/admin/stats${qs}`)
    if (res.ok) setStats(await res.json())
  }, [authedFetch, selectedSeason])

  const refreshOnchain = useCallback(async () => {
    const res = await authedFetch('/admin/onchain')
    if (res.ok) setOnchain(await res.json())
  }, [authedFetch])

  const refreshPreview = useCallback(async () => {
    if (selectedSeason === 'all') { setPreview(null); return }
    const res = await authedFetch(`/admin/seasons/${selectedSeason}/payout-preview`)
    setPreview(res.ok ? await res.json() : null)
  }, [authedFetch, selectedSeason])

  useEffect(() => {
    if (!session) return
    refreshSeasons()
  }, [session, refreshSeasons])

  useEffect(() => {
    if (!session) return
    refreshPreview()
  }, [session, refreshPreview])

  useEffect(() => {
    if (!session) return
    refreshStats()
    refreshOnchain()
  }, [session, refreshStats, refreshOnchain])

  // Every winner is paid the same, so the split is simply 10000 basis points shared
  // equally. Ties are broken by who reached the wave first, so no two players can end
  // up sharing a place and the table is always unambiguous.
  const seasonPool = seasonWinners * seasonPerWinner
  const seasonBps = Array.from({ length: seasonWinners }, () => Math.floor(10000 / seasonWinners))

  async function handleDeleteSeason(sn: Season) {
    if (!window.confirm(`Delete "${sn.name}" permanently?\n\nThis removes the season and any progress in it. A season that has already paid a winner cannot be deleted.`)) return
    setBusy(true)
    try {
      const res = await authedFetch(`/admin/seasons/${sn.id}`, { method: 'DELETE' })
      if (res.ok) await refreshSeasons()
      else window.alert(`Could not delete: ${await res.text()}`)
    } finally {
      setBusy(false)
    }
  }

  // Open a scheduled season EARLY so it can be played through before it goes live,
  // then put its real start time back. Progress made while testing must be wiped
  // afterwards (see handleResetProgress) or the tester starts the season ahead.
  async function handleReschedule(sn: Season, startsAt: string, endsAt?: string) {
    setBusy(true)
    try {
      const res = await authedFetch(`/admin/seasons/${sn.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starts_at: startsAt, ends_at: endsAt }),
      })
      if (res.ok) await refreshSeasons()
      else window.alert(`Could not reschedule: ${await res.text()}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleResetProgress(sn: Season) {
    if (!window.confirm(`Wipe ALL player progress in "${sn.name}"?\n\nEveryone goes back to wave 1. Do this after a test run so nobody starts the season with a head start.`)) return
    setBusy(true)
    try {
      const res = await authedFetch(`/admin/seasons/${sn.id}/reset-progress`, { method: 'POST' })
      if (res.ok) {
        const d = await res.json()
        window.alert(`Progress cleared (${d.cleared} player row(s)).`)
        await refreshSeasons()
      } else window.alert(`Could not reset: ${await res.text()}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateSeason() {
    if (!newSeasonName.trim()) return
    // datetime-local is in the BROWSER's timezone, which is the one you're scheduling
    // in; toISOString converts to the UTC the server stores.
    const startsIso = seasonStart ? new Date(seasonStart).toISOString() : undefined
    const endsIso = seasonEnd ? new Date(seasonEnd).toISOString() : undefined
    if (startsIso && endsIso && endsIso <= startsIso) {
      window.alert('The season must end after it starts.')
      return
    }
    const summary =
      `Create "${newSeasonName.trim()}"?\n\n` +
      `Opens:  ${startsIso ?? 'now'}\n` +
      `Closes: ${endsIso ?? 'left open'}\n` +
      `Prize:  ${seasonPool.toLocaleString()} G$ — top ${seasonWinners} take ${seasonPerWinner.toLocaleString()} G$ each`
    if (!window.confirm(summary)) return

    setBusy(true)
    try {
      const res = await authedFetch('/admin/seasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSeasonName.trim(),
          starts_at: startsIso,
          ends_at: endsIso,
          prize_pool_g: seasonPool,
          payout_bps: seasonBps,
        }),
      })
      if (res.ok) {
        await refreshSeasons()
      } else {
        window.alert(`Could not create the season: ${await res.text()}`)
      }
    } finally {
      setBusy(false)
    }
  }

  // Pays the season prizes on-chain. Long-running by nature: each prize is split
  // into 10,000 G$ chunks (the pool's per-transfer cap), so this is dozens of
  // transactions, not one. Safe to re-run — chunks that already landed are
  // skipped without gas, so a timeout here is resumed by pressing the button again.
  async function handlePayout() {
    if (!preview) return
    const { winners, unpaid_g, tx_count, season } = preview
    const lines = winners
      .filter((w) => w.status !== 'paid')
      .map((w) => `  ${w.rank}. ${w.username || w.wallet_address.slice(0, 10)} — ${w.amount_g.toLocaleString()} G$`)
      .join('\n')
    const ok = window.confirm(
      `Pay out "${season.name}"?\n\n${lines}\n\n` +
      `Total: ${unpaid_g.toLocaleString()} G$ across ${tx_count} on-chain transactions.\n\n` +
      `This sends REAL money and cannot be undone. It may take several minutes.`,
    )
    if (!ok) return

    setPaying(true)
    try {
      const res = await authedFetch(`/admin/seasons/${season.id}/payout`, { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (res.ok && body) {
        window.alert(
          body.season_paid
            ? `Season paid in full — ${body.paid} of ${body.attempted} winners settled.`
            : `${body.paid} of ${body.attempted} settled, ${body.still_unpaid} still unpaid.\n\n` +
              `Press Pay again to resume: anything already sent is skipped.`,
        )
      } else {
        window.alert(`Payout did not run: ${body?.error ?? await res.text()}`)
      }
      await Promise.all([refreshPreview(), refreshSeasons()])
    } finally {
      setPaying(false)
    }
  }

  async function handleEndSeason(id: string) {
    setBusy(true)
    try {
      const res = await authedFetch(`/admin/seasons/${id}/end`, { method: 'POST' })
      if (res.ok) await refreshSeasons()
    } finally {
      setBusy(false)
    }
  }

  function handleDownloadStats() {
    if (!stats) return
    const label = stats.season_name ?? 'all-time'
    const rows: CsvValue[][] = [
      ['metric', 'value'],
      ['season', label],
      ['window_start', stats.starts_at],
      ['window_end', stats.ends_at ?? 'now'],
      ['new_players', stats.new_players],
      ['active_players', stats.active_players],
      ['total_battles', stats.total_battles],
      ['g_awarded', stats.total_g_awarded],
      ['g_volume_moved', stats.total_g_volume],
      ['g_transferred_out', stats.total_g_transferred_out],
    ]
    downloadCsv(`stillhunt-summary-${label.replace(/\s+/g, '-').toLowerCase()}-${todayStamp()}.csv`, toCsv(rows))
  }

  async function handleDownloadActivity() {
    setBusy(true)
    try {
      // Pull the FULL history for the export, not just the 100 shown in the list.
      const res = await authedFetch('/admin/onchain?limit=10000')
      if (!res.ok) return
      const all: OnchainRow[] = await res.json()
      const header: CsvValue[] = ['date', 'type', 'wallet', 'detail', 'tx_hash', 'celoscan_url']
      const body: CsvValue[][] = all.map((r) => [
        r.created_at,
        KIND_LABEL[r.kind] ?? r.kind,
        r.wallet,
        r.detail ?? '',
        r.tx_hash,
        `https://celoscan.io/tx/${r.tx_hash}`,
      ])
      downloadCsv(`stillhunt-onchain-activity-${todayStamp()}.csv`, toCsv([header, ...body]))
    } finally {
      setBusy(false)
    }
  }

  const openSeason = seasons.find((s) => !s.ends_at)

  if (!session) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-5 px-6 text-center" style={{ background: '#04030c' }}>
        <p className="font-display font-black text-white text-2xl">StillHunt Admin</p>
        <p className="text-slate-400 text-sm max-w-xs">Sign a message with your admin wallet to view season and G$ volume stats.</p>
        {loginError && <p className="text-red-400 text-xs">{loginError}</p>}
        <motion.button
          onClick={handleAdminLogin}
          disabled={loggingIn || !address}
          whileTap={{ scale: 0.97 }}
          className="px-6 py-3 rounded-xl font-black text-sm uppercase tracking-widest text-black disabled:opacity-50"
          style={{ background: '#eab308' }}
        >
          {loggingIn ? 'Signing…' : 'Sign in as Admin'}
        </motion.button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-amber-500">Admin</p>
        <h1 className="font-display font-black text-white text-2xl tracking-wide">Season Stats</h1>
      </div>

      {/* Season picker */}
      <div className="bg-hunt-surface border border-hunt-border rounded-xl p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSelectedSeason('all')}
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
            style={{
              background: selectedSeason === 'all' ? '#eab308' : 'rgba(255,255,255,0.05)',
              color: selectedSeason === 'all' ? '#000' : '#94a3b8',
            }}
          >
            All time
          </button>
          {seasons.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSeason(s.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
              style={{
                background: selectedSeason === s.id ? '#eab308' : 'rgba(255,255,255,0.05)',
                color: selectedSeason === s.id ? '#000' : '#94a3b8',
              }}
            >
              {s.name}{!s.ends_at ? ' · open' : ''}
            </button>
          ))}
        </div>

        {/* Controls for whichever season is selected. Open-early + reset-progress are
            what make it safe to play a season through BEFORE it goes live: progress
            persists, so a test run has to be wiped or the tester starts ahead. */}
        {selectedSeason !== 'all' && (() => {
          const sn = seasons.find((x) => x.id === selectedSeason)
          if (!sn) return null
          const now = Date.now()
          const opensAt = new Date(sn.starts_at).getTime()
          const closesAt = sn.ends_at ? new Date(sn.ends_at).getTime() : null
          const live = opensAt <= now && (closesAt === null || closesAt >= now)
          const upcoming = opensAt > now
          return (
            <div className="flex flex-col gap-2 mb-3 p-3 rounded-xl border" style={{ borderColor: 'rgba(42,42,58,0.8)', background: 'rgba(0,0,0,0.25)' }}>
              <p className="text-xs text-slate-400">
                <span className="text-white font-bold">{sn.name}</span>
                {' · '}
                {live ? <span className="text-emerald-400">LIVE now</span>
                  : upcoming ? <span className="text-amber-400">opens {new Date(sn.starts_at).toLocaleString()}</span>
                  : <span className="text-slate-500">closed</span>}
                {closesAt && <> · closes {new Date(sn.ends_at as string).toLocaleString()}</>}
              </p>
              <div className="flex flex-wrap gap-2">
                {upcoming && (
                  <button
                    onClick={() => handleReschedule(sn, new Date(Date.now() - 60_000).toISOString())}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-black disabled:opacity-50"
                    style={{ background: '#34d399' }}
                  >
                    Open now (for testing)
                  </button>
                )}
                {live && (
                  <button
                    onClick={() => {
                      const back = window.prompt('Set the real opening time (your local time, e.g. 2026-07-27T00:00)', '2026-07-27T00:00')
                      if (back) handleReschedule(sn, new Date(back).toISOString())
                    }}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-200 border disabled:opacity-50"
                    style={{ borderColor: '#2a2a3a' }}
                  >
                    Close back to scheduled start
                  </button>
                )}
                <button
                  onClick={() => handleResetProgress(sn)}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-amber-300 border disabled:opacity-50"
                  style={{ borderColor: 'rgba(234,179,8,0.4)' }}
                >
                  Wipe test progress
                </button>
                <button
                  onClick={() => handleDeleteSeason(sn)}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-300 border disabled:opacity-50"
                  style={{ borderColor: 'rgba(248,113,113,0.35)' }}
                >
                  Delete season
                </button>
              </div>
            </div>
          )
        })()}
        {/* Prize payout. Shows the exact transfer before it happens — who, how much,
            how many transactions, and whether the pool can actually cover it — so
            the button is a confirmation rather than a leap. Blocked until the season
            has genuinely closed: winners freeze on the first run and each chunk burns
            a one-shot on-chain reference, so an early payout cannot be corrected. */}
        {preview && preview.winner_count > 0 && (
          <div className="mb-3 p-3 rounded-xl border" style={{ borderColor: 'rgba(234,179,8,0.35)', background: 'rgba(234,179,8,0.04)' }}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-amber-400">Prize payout</p>
              {preview.season.payout_status === 'paid' && (
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Paid</span>
              )}
            </div>

            <div className="max-h-56 overflow-y-auto rounded-lg mb-2" style={{ background: 'rgba(0,0,0,0.3)' }}>
              {preview.winners.map((w) => (
                <div key={w.wallet_address} className="flex items-center gap-2 px-2.5 py-1.5 text-xs border-b last:border-0" style={{ borderColor: 'rgba(42,42,58,0.5)' }}>
                  <span className="w-5 text-slate-500 font-bold tabular-nums">{w.rank}</span>
                  <span className="flex-1 truncate text-slate-200">
                    {w.username || `${w.wallet_address.slice(0, 6)}…${w.wallet_address.slice(-4)}`}
                  </span>
                  <span className="text-slate-500 tabular-nums">{w.waves}w</span>
                  <span className="text-amber-300 font-bold tabular-nums">{w.amount_g.toLocaleString()} G$</span>
                  {w.status === 'paid'
                    ? <span className="text-emerald-400 text-[10px] font-bold w-12 text-right">PAID</span>
                    : w.status === 'failed'
                    ? <span className="text-red-400 text-[10px] font-bold w-12 text-right">FAILED</span>
                    : <span className="text-slate-600 text-[10px] w-12 text-right">—</span>}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400 mb-2">
              <span>{preview.winner_count} winners</span>
              <span className="text-slate-200 font-bold">{preview.unpaid_g.toLocaleString()} G$ to send</span>
              <span>{preview.tx_count} transactions</span>
              {preview.pool_balance_g !== null && (
                <span className={preview.funded ? 'text-emerald-400' : 'text-red-400'}>
                  pool {preview.pool_balance_g.toLocaleString()} G$
                </span>
              )}
              {preview.relay_celo !== null && (
                <span className={preview.relay_celo > 0.1 ? '' : 'text-red-400'}>
                  gas {preview.relay_celo.toFixed(2)} CELO
                </span>
              )}
            </div>

            {!preview.season.closed && (
              <p className="text-[11px] text-amber-300/90 mb-2">
                Season is still running. Payout unlocks when it closes
                {preview.season.ends_at && ` — ${new Date(preview.season.ends_at).toLocaleString()}`}.
              </p>
            )}
            {preview.season.closed && !preview.funded && preview.unpaid_g > 0 && (
              <p className="text-[11px] text-red-400 mb-2">
                Reward pool holds less than the prizes. Top it up before paying, or the run stops part-way.
              </p>
            )}

            <button
              onClick={handlePayout}
              disabled={paying || busy || !preview.can_pay}
              className="w-full px-3 py-2 rounded-lg text-xs font-bold text-black disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: '#fbbf24' }}
            >
              {paying ? 'Paying… this takes a few minutes'
                : preview.unpaid_g === 0 ? 'All winners paid'
                : !preview.season.closed ? 'Locked until the season closes'
                : `Pay ${preview.winners.filter((w) => w.status !== 'paid').length} winners · ${preview.unpaid_g.toLocaleString()} G$`}
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2 pt-3 border-t" style={{ borderColor: 'rgba(42,42,58,0.8)' }}>
          <button
            onClick={() => setShowScheduler((v) => !v)}
            className="text-[10px] uppercase tracking-[0.3em] font-bold text-slate-500 hover:text-slate-300 text-left"
          >
            {showScheduler ? '▾ Schedule a season' : '▸ Schedule a season'}
          </button>
          {showScheduler && (<>
          <input
            type="text"
            value={newSeasonName}
            onChange={(e) => setNewSeasonName(e.target.value)}
            placeholder="Season name"
            className="px-3 py-2 rounded-lg bg-black/30 border border-hunt-border text-sm text-white placeholder:text-slate-600 focus:outline-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-slate-600">Opens (your local time)</span>
              <input type="datetime-local" value={seasonStart} onChange={(e) => setSeasonStart(e.target.value)}
                className="px-3 py-2 rounded-lg bg-black/30 border border-hunt-border text-sm text-white focus:outline-none" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-slate-600">Closes</span>
              <input type="datetime-local" value={seasonEnd} onChange={(e) => setSeasonEnd(e.target.value)}
                className="px-3 py-2 rounded-lg bg-black/30 border border-hunt-border text-sm text-white focus:outline-none" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-slate-600">Winners paid</span>
              <input type="number" min={1} max={20} value={seasonWinners}
                onChange={(e) => setSeasonWinners(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                className="px-3 py-2 rounded-lg bg-black/30 border border-hunt-border text-sm text-white focus:outline-none" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-slate-600">G$ each</span>
              <input type="number" min={0} step={1000} value={seasonPerWinner}
                onChange={(e) => setSeasonPerWinner(Math.max(0, Number(e.target.value) || 0))}
                className="px-3 py-2 rounded-lg bg-black/30 border border-hunt-border text-sm text-white focus:outline-none" />
            </label>
          </div>
          <p className="text-xs text-slate-500">
            Prize pool <span className="text-amber-400 font-bold">{seasonPool.toLocaleString()} G$</span>
            {' · '}top {seasonWinners} take {seasonPerWinner.toLocaleString()} G$ each
            {seasonPerWinner > 10000 && (
              <span className="text-slate-600"> · paid in {Math.ceil(seasonPerWinner / 10000)} transactions each (10,000 G$ on-chain cap)</span>
            )}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleCreateSeason}
              disabled={busy || !newSeasonName.trim()}
              className="px-3 py-2 rounded-lg text-xs font-bold text-black disabled:opacity-50"
              style={{ background: '#eab308' }}
            >
              Schedule season
            </button>
            {openSeason && (
              <button
                onClick={() => handleEndSeason(openSeason.id)}
                disabled={busy}
                className="px-3 py-2 rounded-lg text-xs font-bold text-slate-300 hover:text-white border disabled:opacity-50"
                style={{ borderColor: '#2a2a3a' }}
              >
                End &quot;{openSeason.name}&quot;
              </button>
            )}
          </div>
          </>)}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-white text-sm">
              {stats.season_name ?? 'All-Time'} Summary
            </h3>
            <DownloadButton onClick={handleDownloadStats} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatTile label="New Players" value={stats.new_players.toLocaleString()} />
            <StatTile label="Active Players" value={stats.active_players.toLocaleString()} />
            <StatTile label="Total Battles" value={stats.total_battles.toLocaleString()} />
            <StatTile label="G$ Awarded" value={`${formatGDollarNumber(stats.total_g_awarded)} G$`} />
            <StatTile label="G$ Volume Moved" value={`${formatGDollarNumber(stats.total_g_volume)} G$`} />
            <StatTile label="G$ Transferred Out" value={`${formatGDollarNumber(stats.total_g_transferred_out)} G$`} />
          </div>
        </div>
      )}

      {/* On-chain activity — mission records + G$ moves, each linked to Celoscan */}
      <div className="bg-hunt-surface border border-hunt-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3 gap-3">
          <h3 className="font-display font-bold text-white text-sm">On-Chain Activity</h3>
          <div className="flex items-center gap-3">
            <span className="text-[9px] uppercase tracking-widest text-slate-600 font-bold">Latest {onchain.length}</span>
            <DownloadButton onClick={handleDownloadActivity} disabled={busy} />
          </div>
        </div>
        {onchain.length === 0 ? (
          <p className="text-slate-600 text-xs">No on-chain activity yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-96 overflow-y-auto">
            {onchain.map((r) => (
              <a
                key={r.tx_hash}
                href={`https://celoscan.io/tx/${r.tx_hash}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 px-3 py-2 rounded-lg border border-hunt-border hover:border-slate-500 transition-colors text-left"
                style={{ background: 'rgba(8,10,16,0.6)' }}
              >
                <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-sm shrink-0"
                  style={{ background: 'rgba(55,208,224,0.12)', color: '#37d0e0' }}>
                  {KIND_LABEL[r.kind] ?? r.kind}
                </span>
                <span className="text-xs text-slate-300 font-mono truncate flex-1">{r.wallet.slice(0, 8)}…{r.wallet.slice(-4)}</span>
                {r.detail && <span className="text-[11px] text-slate-500 shrink-0">{r.kind === 'mission_record' ? `OP ${r.detail}` : `${formatGDollarNumber(Number(r.detail))} G$`}</span>}
                <span className="text-[10px] text-slate-600 font-mono shrink-0">{r.tx_hash.slice(0, 8)}…</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
