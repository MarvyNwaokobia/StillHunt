'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Copy, Check, LogOut, ArrowUpRight, ArrowLeft } from 'lucide-react'
import { useResolvedAuth } from '@/hooks/useResolvedAuth'
import { useSignOut } from '@/hooks/useSignOut'
import { usePlayerStore } from '@/stores/usePlayerStore'
import { useGBalance } from '@/hooks/useGBalance'
import { useLedgerSummary } from '@/hooks/useLedgerSummary'
import { useTransferOut, useWithdrawFee, splitWithdrawal } from '@/hooks/useTransferOut'
import { useDebt, useSettleDebt } from '@/hooks/useDebt'
import WeeklyEarnCap from '@/components/bank/WeeklyEarnCap'
import ClaimCard from '@/components/bank/ClaimCard'
import { formatTallyNumber } from '@/utils/format'
import LoadingScreen from '@/components/ui/LoadingScreen'

function truncate(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-hunt-surface border border-hunt-border rounded-xl p-4 flex flex-col gap-1">
      <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">{label}</p>
      <p className="font-display font-black text-white text-xl leading-none">{value}</p>
      {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
    </div>
  )
}

/** Outstanding-balance banner: shown when the player owes the shop (e.g. a price
 *  adjustment). Dismissible; settling signs a TALLY permit that moves the owed amount
 *  into the reward pool. Renders nothing when there's no debt. */
function SettleBanner({ address }: { address: string | undefined }) {
  const { data: debt } = useDebt(address)
  const { settle, pending } = useSettleDebt(address)
  const [dismissed, setDismissed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const owed = debt?.owed ?? 0
  if (owed <= 0 || dismissed || done) return null

  async function handleSettle() {
    setError(null)
    try {
      await settle(owed)
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Settlement failed')
    }
  }

  return (
    <div className="px-4 py-3 rounded-xl border"
      style={{ background: 'rgba(239,68,68,0.09)', borderColor: 'rgba(239,68,68,0.4)' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] uppercase tracking-widest text-red-400/80 font-bold">Outstanding balance</p>
          <p className="font-black text-red-300 text-lg leading-tight">{formatTallyNumber(owed)} TALLY due</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {debt?.reason ? `From: ${debt.reason}. ` : ''}Sign to settle — it moves into the prize pool.
          </p>
          {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            onClick={handleSettle}
            disabled={pending}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-50"
            style={{ background: 'rgba(239,68,68,0.85)' }}>
            {pending ? 'Settling…' : `Settle ${formatTallyNumber(owed)} TALLY`}
          </button>
          <button onClick={() => setDismissed(true)} className="text-[10px] text-slate-500 hover:text-slate-300">
            Later
          </button>
        </div>
      </div>
    </div>
  )
}

export default function BankPage() {
  const { status, address } = useResolvedAuth()
  const router = useRouter()
  const signOut = useSignOut()
  const player = usePlayerStore((s) => s.player)
  const playerSynced = usePlayerStore((s) => s.playerSynced)

  const [copied, setCopied] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [destination, setDestination] = useState('')
  const [amount, setAmount] = useState('')
  const [transferError, setTransferError] = useState<string | null>(null)
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null)

  const { formatted: gBalanceFormatted, refetch: refetchBalance } = useGBalance(address as `0x${string}` | undefined)
  const { data: ledger } = useLedgerSummary(address)
  const { transfer, pending: transferring } = useTransferOut(address)
  const { data: withdrawFee } = useWithdrawFee()
  const feeBps = withdrawFee?.bps ?? 0
  const { net: amountNet, fee: amountFee } = splitWithdrawal(parseFloat(amount) || 0, feeBps)

  if (status === 'loading') return <LoadingScreen />
  if (status === 'unauthenticated' || !address) { router.replace('/'); return null }
  if (!player && !playerSynced) return <LoadingScreen />
  if (!player) { router.replace('/'); return null }

  async function handleCopy() {
    await navigator.clipboard.writeText(address as string)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function handleTransfer() {
    setTransferError(null)
    setTransferSuccess(null)
    try {
      const hash = await transfer(destination, parseFloat(amount))
      setTransferSuccess(hash)
      setDestination('')
      setAmount('')
      refetchBalance()
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : 'Transfer failed')
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-2"
      >
        <Link
          href="/profile"
          className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-white transition-colors w-fit"
        >
          <ArrowLeft size={14} /> Profile
        </Link>
        <div className="flex flex-col gap-0.5">
          <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-amber-500">Bank</p>
          <h1 className="font-display font-black text-white text-2xl tracking-wide">Your TALLY</h1>
        </div>
      </motion.div>

      {/* Wallet + sign out */}
      <div className="bg-hunt-surface border border-hunt-border rounded-xl p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-sm text-slate-300 truncate">{truncate(address)}</span>
          <button onClick={handleCopy} className="text-slate-500 hover:text-white transition-colors shrink-0" title="Copy address">
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
          </button>
        </div>
        <button
          onClick={() => signOut()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-colors shrink-0"
          style={{ background: 'rgba(255,255,255,0.04)' }}
        >
          <LogOut size={13} /> Sign out
        </button>
      </div>

      {/* Outstanding balance (price adjustment) — renders only when owed > 0 */}
      <SettleBanner address={address} />

      {/* Balance */}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl border"
        style={{ background: 'rgba(234,179,8,0.08)', borderColor: 'rgba(234,179,8,0.35)' }}>
        <div>
          <p className="text-[9px] uppercase tracking-widest text-amber-500/70 font-bold">TALLY Balance</p>
          <p className="font-black text-amber-400 text-2xl">{gBalanceFormatted ? `${gBalanceFormatted} TALLY` : '—'}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase tracking-widest text-slate-600 font-bold">Spendable</p>
          <p className="text-[9px] text-slate-500 mt-0.5">Use in Marketplace</p>
        </div>
      </div>

      {/* Pending payout — earned TALLY whose on-chain transfer hasn't landed yet. Only
          shown when there is one; it settles by itself (the reconcile sweep retries
          anything the live attempt missed), so this exists to stop the gap between
          "+500 TALLY" and the balance updating reading as lost money. */}
      {!!ledger?.pending_payout && (
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-4 py-3 rounded-xl border"
          style={{ background: 'rgba(234,179,8,0.06)', borderColor: 'rgba(234,179,8,0.22)' }}
        >
          <motion.span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: '#eab308' }}
            animate={{ opacity: [1, 0.25, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="min-w-0">
            <p className="text-xs font-bold text-amber-400">
              {formatTallyNumber(ledger.pending_payout)} TALLY on the way
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Earned and confirmed. It lands in your balance once the transfer settles.
            </p>
          </div>
        </motion.div>
      )}

      {/* Accrued balance waiting to be taken on-chain. Renders nothing on Celo,
          which pays on every win and so has nothing to claim. */}
      <ClaimCard walletAddress={address} />

      {/* Earned / spent breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Earned · UBI" value={`${formatTallyNumber(ledger?.ubi_earned ?? 0)} TALLY`} />
        <StatTile label="Earned · Gameplay" value={`${formatTallyNumber(ledger?.gameplay_earned ?? 0)} TALLY`} />
        <StatTile label="Spent · Market" value={`${formatTallyNumber(ledger?.marketplace_spent ?? 0)} TALLY`} />
        <StatTile label="Transferred Out" value={`${formatTallyNumber(ledger?.transferred_out ?? 0)} TALLY`} />
      </div>

      {/* Daily claim + rank pool */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <WeeklyEarnCap walletAddress={address} />
      </div>

      {/* Transfer out */}
      <div className="bg-hunt-surface border border-hunt-border rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-white text-sm">Transfer TALLY Out</p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Send to any wallet — cash out your winnings
              {feeBps > 0 && ` · ${withdrawFee?.percent}% withdrawal fee`}
            </p>
          </div>
          <ArrowUpRight size={18} className="text-slate-500" />
        </div>

        {!showTransfer ? (
          <button
            onClick={() => setShowTransfer(true)}
            className="w-full py-2.5 font-black text-sm rounded-lg border text-slate-300 hover:text-white transition-colors"
            style={{ borderColor: '#2a2a3a' }}
          >
            Send TALLY
          </button>
        ) : (
          <div className="flex flex-col gap-2.5">
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value.trim())}
              placeholder="Destination wallet (0x...)"
              className="w-full px-3 py-2.5 rounded-lg bg-black/30 border border-hunt-border text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none"
            />
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount (TALLY)"
              min="0"
              step="any"
              className="w-full px-3 py-2.5 rounded-lg bg-black/30 border border-hunt-border text-sm text-white placeholder:text-slate-600 focus:outline-none"
            />

            {/* The breakdown, shown BEFORE they sign. A withdrawal fee a player
                only discovers from the amount that arrived is the single fastest
                way to lose their trust, so it is spelled out here in full. */}
            {feeBps > 0 && (
              <div className="rounded-lg border border-hunt-border bg-black/20 px-3 py-2 flex flex-col gap-1 text-[11px]">
                <div className="flex justify-between text-slate-400">
                  <span>Leaving your wallet</span>
                  <span className="font-mono text-slate-300">{formatTallyNumber(parseFloat(amount) || 0)} TALLY</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Withdrawal fee ({withdrawFee?.percent}%)</span>
                  <span className="font-mono text-amber-400">-{formatTallyNumber(amountFee)} TALLY</span>
                </div>
                <div className="flex justify-between font-bold text-white pt-1 border-t border-hunt-border">
                  <span>They receive</span>
                  <span className="font-mono">{formatTallyNumber(amountNet)} TALLY</span>
                </div>
              </div>
            )}

            {transferError && <p className="text-red-400 text-xs">{transferError}</p>}
            {transferSuccess && <p className="text-green-400 text-xs">Sent! tx {transferSuccess.slice(0, 10)}…</p>}

            <div className="flex gap-2">
              <button
                onClick={() => { setShowTransfer(false); setTransferError(null); setTransferSuccess(null) }}
                disabled={transferring}
                className="flex-1 py-2.5 text-sm font-bold rounded-lg border text-slate-400 hover:text-white transition-colors disabled:opacity-40"
                style={{ borderColor: '#2a2a3a' }}
              >
                Cancel
              </button>
              <motion.button
                onClick={handleTransfer}
                disabled={transferring || !destination || !amount}
                whileTap={{ scale: 0.97 }}
                className="flex-1 py-2.5 text-sm font-black rounded-lg text-black transition-opacity disabled:opacity-50"
                style={{ background: '#eab308' }}
              >
                {transferring
                  ? 'Sending…'
                  : feeBps > 0
                      ? `Send ${formatTallyNumber(amountNet)} TALLY`
                      : `Confirm sending ${amount || '0'} TALLY`}
              </motion.button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
