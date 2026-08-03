'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { X, Check, AlertTriangle } from 'lucide-react'
import type { Item } from '@/types'
import { CAMPAIGN } from '@/engine/fps/campaign'
import { usePlayerStore } from '@/stores/usePlayerStore'
import { gunIdFromItemId } from '@/components/marketplace/GunIcons'
import {
  GUN_ITEM_ID, AMMO_ITEM_ID, ATTACHMENT_ITEM_ID,
  equippedGunId, equippedAmmoId, equippedAttachments, ownedFieldKit,
} from '@/lib/guns'
import { GUN_CATALOG, gunDps, type GunId } from '@/engine/combat/GunStats'
import {
  AMMO_CATALOG, ATTACHMENT_CATALOG,
  type AmmoId, type AttachmentId, type AttachmentSlot,
} from '@/engine/combat/Loadout'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

// Field kit — tactical gear you BUY in the Marketplace, then fit here and carry
// into the op (see fight?kit=). kit_id maps to the engine's FpsSim attachment.
type KitId = 'light' | 'laser' | 'nvg'
const KIT_META: Record<KitId, { label: string; desc: string }> = {
  light: { label: 'Tactical Flashlight', desc: 'Forward light cone for dark ops' },
  nvg:   { label: 'Night Vision', desc: 'Lifts the dark on night operations' },
  laser: { label: 'Laser Sight', desc: 'Tighter hip-fire' },
}

const SLOTS: { slot: AttachmentSlot; label: string }[] = [
  { slot: 'barrel', label: 'Barrel' },
  { slot: 'optic', label: 'Optic' },
  { slot: 'grip', label: 'Grip' },
  { slot: 'magazine', label: 'Magazine' },
]

interface Props {
  /** Campaign op this is for, if any. Endless and Seasonal waves have no op — they
   *  issue no weapon of their own, so you carry purely what you equipped. */
  opIndex?: number
  opName: string
  /** Overrides the "OP n" eyebrow, e.g. "Seasonal · Wave 7". */
  label?: string
  /** Wording on the confirm button; waves "enter" rather than "deploy". */
  cta?: string
  walletAddress?: string
  onClose: () => void
  onDeploy: (kit: KitId[]) => void
}

function Row({ selected, onClick, title, sub, accent }: {
  selected: boolean; onClick: () => void; title: string; sub?: string; accent: string
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all"
      style={{
        background: selected ? `${accent}14` : 'rgba(8,10,16,0.7)',
        borderColor: selected ? `${accent}99` : 'rgba(42,42,58,0.7)',
      }}
    >
      <div
        className="w-4 h-4 rounded-full border shrink-0 flex items-center justify-center"
        style={{ borderColor: selected ? accent : '#4a5763', background: selected ? accent : 'transparent' }}
      >
        {selected && <Check size={11} className="text-black" strokeWidth={3} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-white leading-tight truncate">{title}</p>
        {sub && <p className="text-[11px] text-slate-500 truncate">{sub}</p>}
      </div>
    </button>
  )
}

export default function LoadoutModal({ opIndex, opName, label, cta, walletAddress, onClose, onDeploy }: Props) {
  const inventory = usePlayerStore((s) => s.inventory)
  const toggleEquip = usePlayerStore((s) => s.toggleEquip)

  const { data: items = [] } = useQuery({
    queryKey: ['items-all'],
    queryFn: async () => {
      const res = await fetch(`${API}/items`)
      if (!res.ok) return []
      // Cast alone is a lie about a network response — a non-list here would leave
      // every owned weapon out of the picker with no sign anything went wrong.
      const all = await res.json()
      return Array.isArray(all) ? (all as Item[]) : []
    },
  })

  const ownedIds = new Set(inventory.map((i) => i.item_id))
  const owned = items.filter((i) => ownedIds.has(i.id))
  const ownedGuns = owned.map((i) => gunIdFromItemId(i.id)).filter((g): g is GunId => !!g)
  const ownedAmmo = owned.filter((i) => i.category === 'ammo')
  const ownedAttach = owned.filter((i) => i.category === 'attachment')
  const ownedKit = ownedFieldKit(inventory) // field-kit gear you've bought

  // Selection starts from what's currently equipped (engine ids).
  const [gun, setGun] = useState<GunId>(() => equippedGunId(inventory))
  const [ammo, setAmmo] = useState<AmmoId>(() => equippedAmmoId(inventory))
  const [attach, setAttach] = useState<Partial<Record<AttachmentSlot, AttachmentId>>>(() => equippedAttachments(inventory))
  const [kit, setKit] = useState<Set<KitId>>(new Set())
  const [deploying, setDeploying] = useState(false)

  function patch(itemId: string, equipped: boolean) {
    if (!walletAddress) return Promise.resolve()
    return fetch(`${API}/players/${walletAddress}/inventory/${itemId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ equipped }),
    }).catch(() => {})
  }

  /** Make the inventory's equipped flags match `wantEquipped` across `candidates`. */
  async function reconcile(candidateItemIds: string[], wantEquipped: Set<string>) {
    for (const id of candidateItemIds) {
      const cur = inventory.find((i) => i.item_id === id)?.equipped ?? false
      const want = wantEquipped.has(id)
      if (cur !== want) { toggleEquip(id); await patch(id, want) }
    }
  }

  async function handleDeploy() {
    setDeploying(true)
    // Guns: exactly the chosen one equipped (sidearm = none owned equipped).
    const gunItemIds = ownedGuns.map((g) => GUN_ITEM_ID[g as Exclude<GunId, 'sidearm'>]).filter(Boolean)
    const wantGun = new Set(gun !== 'sidearm' ? [GUN_ITEM_ID[gun as Exclude<GunId, 'sidearm'>]] : [])
    // Ammo: the chosen one (standard = none owned equipped).
    const ammoItemIds = ownedAmmo.map((i) => i.id)
    const wantAmmo = new Set(ammo !== 'standard' ? [AMMO_ITEM_ID[ammo as Exclude<AmmoId, 'standard'>]] : [])
    // Attachments: one per slot.
    const attachItemIds = ownedAttach.map((i) => i.id)
    const wantAttach = new Set(
      Object.values(attach).filter(Boolean).map((a) => ATTACHMENT_ITEM_ID[a as AttachmentId]),
    )
    await reconcile(gunItemIds, wantGun)
    await reconcile(ammoItemIds, wantAmmo)
    await reconcile(attachItemIds, wantAttach)
    onDeploy([...kit])
  }

  const chosenGun = GUN_CATALOG[gun]
  // The weapon this op hands you if you bring nothing better. Your equipped gun is now
  // ALWAYS the one you deploy with (a bought gun is never silently overridden) — so if
  // it's a lower tier than what the op would issue, say so plainly here. That's the fix
  // for "I bought a gun and nothing changed": now it changes, and you're told when the
  // op's issued weapon would have been the stronger pick. The starter sidearm is the one
  // exception — picking it deploys the issued weapon (the floor), so no warning there.
  const issuedGun = opIndex !== undefined && CAMPAIGN[opIndex]?.gun ? GUN_CATALOG[CAMPAIGN[opIndex].gun] : null
  const underGunned = gun !== 'sidearm' && issuedGun != null && chosenGun.tier < issuedGun.tier

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(2,3,8,0.86)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={(e) => { if (e.target === e.currentTarget && !deploying) onClose() }}
    >
      <motion.div
        className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-2xl border flex flex-col"
        style={{ background: '#0a0c12', borderColor: '#2a2a3a' }}
        initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-2 p-5 pb-3" style={{ background: '#0a0c12', borderBottom: '1px solid #1c1f28' }}>
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] font-bold" style={{ color: '#37d0e0' }}>{label ?? `Loadout · OP ${(opIndex ?? 0) + 1}`}</p>
            <h2 className="font-display font-black text-white text-xl leading-tight">{opName}</h2>
          </div>
          {!deploying && (
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors shrink-0 mt-0.5"><X size={18} /></button>
          )}
        </div>

        <div className="flex flex-col gap-5 p-5 pt-4">
          {/* Primary weapon */}
          <section>
            <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-slate-500 mb-2">Primary Weapon</p>
            <div className="flex flex-col gap-2">
              <Row accent="#37d0e0" selected={gun === 'sidearm'} onClick={() => setGun('sidearm')}
                title="Standard Sidearm" sub="Free starter · Tier 1" />
              {ownedGuns.map((g) => (
                <Row key={g} accent="#37d0e0" selected={gun === g} onClick={() => setGun(g)}
                  title={GUN_CATALOG[g].name} sub={`Tier ${GUN_CATALOG[g].tier} · ${Math.round(gunDps(GUN_CATALOG[g]))} DPS`} />
              ))}
            </div>
            {ownedGuns.length === 0 && <p className="text-[11px] text-slate-600 mt-2">Buy a gun in the Marketplace to bring it here.</p>}
            {underGunned && issuedGun && (
              <div className="mt-2 flex items-start gap-2 rounded-lg px-3 py-2 border" style={{ background: 'rgba(245,158,11,0.10)', borderColor: 'rgba(245,158,11,0.45)' }}>
                <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
                <p className="text-[11px] leading-snug" style={{ color: '#f8d38a' }}>
                  This op issues the <span className="font-bold">{issuedGun.name}</span> (Tier {issuedGun.tier}) — stronger than your <span className="font-bold">{chosenGun.name}</span> (Tier {chosenGun.tier}). You&apos;ll still deploy with your {chosenGun.name}.
                </p>
              </div>
            )}
          </section>

          {/* Ammo */}
          <section>
            <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-slate-500 mb-2">Ammunition</p>
            <div className="flex flex-col gap-2">
              <Row accent="#f59e0b" selected={ammo === 'standard'} onClick={() => setAmmo('standard')}
                title="Standard FMJ" sub="Free · factory rounds" />
              {ownedAmmo.map((i) => {
                const aid = (i.weapon_stats as { ammo_id?: AmmoId } | null)?.ammo_id
                if (!aid) return null
                return (
                  <Row key={i.id} accent="#f59e0b" selected={ammo === aid} onClick={() => setAmmo(aid)}
                    title={AMMO_CATALOG[aid].name} sub={i.description} />
                )
              })}
            </div>
          </section>

          {/* Attachments per slot */}
          {ownedAttach.length > 0 && (
            <section>
              <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-slate-500 mb-2">Attachments</p>
              <div className="flex flex-col gap-3">
                {SLOTS.map(({ slot, label }) => {
                  const inSlot = ownedAttach.filter((i) => (i.weapon_stats as { slot?: string } | null)?.slot === slot)
                  if (inSlot.length === 0) return null
                  return (
                    <div key={slot}>
                      <p className="text-[10px] font-bold text-slate-600 uppercase mb-1.5">{label}</p>
                      <div className="flex flex-col gap-2">
                        <Row accent="#22c55e" selected={!attach[slot]} onClick={() => setAttach((p) => ({ ...p, [slot]: undefined }))} title="None" />
                        {inSlot.map((i) => {
                          const aid = (i.weapon_stats as { attachment_id?: AttachmentId } | null)?.attachment_id
                          if (!aid) return null
                          return (
                            <Row key={i.id} accent="#22c55e" selected={attach[slot] === aid}
                              onClick={() => setAttach((p) => ({ ...p, [slot]: aid }))}
                              title={ATTACHMENT_CATALOG[aid].name} sub={i.description} />
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Field kit — only what you own */}
          <section>
            <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-slate-500 mb-2">Field Kit</p>
            {ownedKit.length === 0 ? (
              <p className="text-[11px] text-slate-600">Buy field kit (flashlight, night vision, laser) in the Marketplace to bring it into an op.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {ownedKit.map((id) => {
                  const on = kit.has(id)
                  return (
                    <Row key={id} accent="#a855f7" selected={on} title={KIT_META[id].label} sub={KIT_META[id].desc}
                      onClick={() => setKit((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })} />
                  )
                })}
              </div>
            )}
          </section>
        </div>

        {/* Deploy */}
        <div className="sticky bottom-0 p-5 pt-3" style={{ background: '#0a0c12', borderTop: '1px solid #1c1f28' }}>
          <div className="flex items-center justify-between mb-2 text-[11px]">
            <span className="text-slate-500">Carrying</span>
            <span className="text-slate-300 font-bold">{chosenGun.name}{ammo !== 'standard' ? ` · ${AMMO_CATALOG[ammo].name}` : ''}</span>
          </div>
          <motion.button
            onClick={handleDeploy} disabled={deploying}
            whileTap={{ scale: 0.98 }}
            className="w-full py-3 rounded-xl font-display font-black text-black text-sm tracking-wide disabled:opacity-60"
            style={{ background: '#37d0e0' }}
          >
            {deploying ? 'LOADING OUT…' : (cta ?? 'DEPLOY')}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
}
