'use client'

import type { Item } from '@/types'
import { ItemArt } from './ItemArt'
import { gunIdFromItemId } from './GunIcons'
import { GUN_CATALOG, type GunId } from '@/engine/combat/GunStats'

// Short tactical designation stencilled onto the crate.
const GUN_TYPE: Record<GunId, string> = {
  sidearm: 'SIDEARM', smg: 'SMG', assault_rifle: 'RIFLE', marksman: 'DMR', legendary: 'PROTOTYPE',
  ashfall_carbine: 'CARBINE', warden_repeater: 'BATTLE RIFLE', rift_lance: 'LANCE',
  seraph_lmg: 'LMG', ember_halo: 'EXOTIC',
}

/** The stencil designation for an item's crate, e.g. "T3 · RIFLE", "OPTIC · MOD". */
export function crateLabel(item: Item): string {
  const gid = gunIdFromItemId(item.id)
  if (gid) return `T${GUN_CATALOG[gid].tier} · ${GUN_TYPE[gid]}`
  const slot = (item.weapon_stats as Record<string, string> | null)?.slot
  switch (item.category) {
    case 'ammo':       return `${item.rarity.toUpperCase()} · AMMO`
    case 'attachment': return `${(slot ?? 'MOD').toUpperCase()} · MOD`
    case 'gear':       return `${item.rarity.toUpperCase()} · KIT`
    case 'shield':     return 'TAC · SHIELD'
    case 'booster':    return 'FIELD · BOOSTER'
    default:           return item.rarity.toUpperCase()
  }
}

/**
 * The presentation frame that makes catalogue art read as a premium tactical
 * asset instead of a toy on a shelf. A low-poly mesh in a dark weapon case — with
 * corner brackets, a stencilled designation and a grounding shadow — reads
 * "collectible weapon skin", the same trick CS/StillHuntant inspectors use. The
 * container does more of the "real" work than the mesh does.
 *
 * Shared by the marketplace grid and the profile inventory so owned gear looks
 * exactly like what you bought.
 */

function Bracket({ pos, color }: { pos: 'tl' | 'tr' | 'bl' | 'br'; color: string }) {
  const edge: Record<typeof pos, string> = {
    tl: 'top-1.5 left-1.5 border-t border-l',
    tr: 'top-1.5 right-1.5 border-t border-r',
    bl: 'bottom-1.5 left-1.5 border-b border-l',
    br: 'bottom-1.5 right-1.5 border-b border-r',
  }
  return <span className={`absolute ${edge[pos]} w-3 h-3 pointer-events-none`} style={{ borderColor: color }} />
}

export function WeaponCrate({
  item,
  rarityColor,
  label,
}: {
  item: Item
  rarityColor: string
  /** Short stencil designation, e.g. "T3 · RIFLE" or "EPIC · AMMO". */
  label: string
}) {
  return (
    <div
      className="relative w-full rounded-lg overflow-hidden select-none"
      style={{
        background:
          'radial-gradient(120% 90% at 50% 18%, #191c23 0%, #0d0f14 55%, #070709 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -24px 40px rgba(0,0,0,0.55)',
      }}
    >
      {/* Faint tactical grid — texture, not decoration; barely there. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0.05,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '13px 13px',
        }}
      />
      {/* Rarity corner brackets — the "case" read. */}
      <Bracket pos="tl" color={rarityColor} />
      <Bracket pos="tr" color={rarityColor} />
      <Bracket pos="bl" color={rarityColor} />
      <Bracket pos="br" color={rarityColor} />

      {/* Stencil designation, top-left. */}
      <span
        className="absolute top-2 left-3 z-10 font-mono text-[8px] font-bold uppercase"
        style={{ letterSpacing: '0.22em', color: rarityColor, opacity: 0.9 }}
      >
        {label}
      </span>

      {/* The dramatically-lit asset, grounded by a soft shadow. */}
      <div className="relative flex items-center justify-center px-3 pt-5 pb-4">
        <ItemArt item={item} color={rarityColor} />
      </div>

      {/* Bottom edge strip in the rarity colour — a thin machined seam. */}
      <div
        className="absolute bottom-0 left-0 h-0.5 pointer-events-none"
        style={{
          width: '100%',
          background: `linear-gradient(90deg, transparent, ${rarityColor}aa 50%, transparent)`,
          opacity: 0.5,
        }}
      />
    </div>
  )
}
