import { STARTER_GUN_ID, type GunId } from '@/engine/combat'
import {
  ATTACHMENT_CATALOG,
  type AmmoId,
  type AttachmentId,
  type AttachmentSlot,
} from '@/engine/combat/Loadout'
import type { InventoryItem } from '@/types'

/**
 * Join between marketplace items and the engine's gun catalog.
 *
 * Combat stats live in the typed GUN_CATALOG (engine/combat/GunStats.ts). A gun
 * sold in the marketplace is an `items` row whose fixed UUID maps to a gun id here.
 * These UUIDs MUST match supabase/migrations/004_guns.sql. The free starter sidearm
 * is the default loadout (not a sellable item), so it has no entry.
 */
export const GUN_ITEM_ID: Record<Exclude<GunId, 'sidearm'>, string> = {
  smg:           '22222222-2222-4222-8222-222222222222',
  assault_rifle: '33333333-3333-4333-8333-333333333333',
  marksman:      '44444444-4444-4444-8444-444444444444',
  legendary:     '55555555-5555-4555-8555-555555555555',
  // ── Seasonal weapons ──
  // Fixed UUIDs, mirrored by the items seed (add_seasonal_weapons.sql) and by the
  // on-chain registration script, so one row means the same gun everywhere.
  ashfall_carbine: '66666666-6666-4666-8666-666666666666',
  warden_repeater: '77777777-7777-4777-8777-777777777777',
  rift_lance:      '88888888-8888-4888-8888-888888888888',
  seraph_lmg:      '99999999-9999-4999-8999-999999999999',
  ember_halo:      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
}

const ITEM_ID_TO_GUN: Record<string, GunId> = Object.fromEntries(
  Object.entries(GUN_ITEM_ID).map(([gun, id]) => [id, gun as GunId]),
)

/** True if a marketplace item is one of the gun tiers. */
/** Which gun a marketplace item is, or null if it isn't a weapon. */
export function gunFromItemId(itemId: string): GunId | null {
  return ITEM_ID_TO_GUN[itemId] ?? null
}

export function isGunItem(itemId: string): boolean {
  return itemId in ITEM_ID_TO_GUN
}

/**
 * The gun a player fights with: their equipped weapon if it's a gun tier, else the
 * free starter sidearm. (Engine `GunStats` are looked up from the returned id.)
 */
export function equippedGunId(inventory: InventoryItem[]): GunId {
  const equipped = inventory.find((i) => i.equipped && ITEM_ID_TO_GUN[i.item_id])
  return equipped ? ITEM_ID_TO_GUN[equipped.item_id] : STARTER_GUN_ID
}

/**
 * Join between marketplace ammo/attachment items and the engine's typed Loadout
 * catalog (engine/combat/Loadout.ts). Fixed UUIDs MUST match
 * supabase/migrations/008_ammo_attachments.sql. Standard FMJ is the free default,
 * so it has no sellable item.
 */
export const AMMO_ITEM_ID: Record<Exclude<AmmoId, 'standard'>, string> = {
  hollow_point:   'aaaa0001-aaaa-4aaa-8aaa-aaaaaaaaa001',
  armor_piercing: 'aaaa0002-aaaa-4aaa-8aaa-aaaaaaaaa002',
  tracer:         'aaaa0003-aaaa-4aaa-8aaa-aaaaaaaaa003',
  incendiary:     'aaaa0004-aaaa-4aaa-8aaa-aaaaaaaaa004',
}

export const ATTACHMENT_ITEM_ID: Record<AttachmentId, string> = {
  suppressor:      'bbbb0001-bbbb-4bbb-8bbb-bbbbbbbbb001',
  extended_barrel: 'bbbb0002-bbbb-4bbb-8bbb-bbbbbbbbb002',
  red_dot:         'bbbb0003-bbbb-4bbb-8bbb-bbbbbbbbb003',
  acog_scope:      'bbbb0004-bbbb-4bbb-8bbb-bbbbbbbbb004',
  foregrip:        'bbbb0005-bbbb-4bbb-8bbb-bbbbbbbbb005',
  quick_grip:      'bbbb0006-bbbb-4bbb-8bbb-bbbbbbbbb006',
  extended_mag:    'bbbb0007-bbbb-4bbb-8bbb-bbbbbbbbb007',
  speed_loader:    'bbbb0008-bbbb-4bbb-8bbb-bbbbbbbbb008',
}

const ITEM_ID_TO_AMMO: Record<string, AmmoId> = Object.fromEntries(
  Object.entries(AMMO_ITEM_ID).map(([ammo, id]) => [id, ammo as AmmoId]),
)
const ITEM_ID_TO_ATTACHMENT: Record<string, AttachmentId> = Object.fromEntries(
  Object.entries(ATTACHMENT_ITEM_ID).map(([att, id]) => [id, att as AttachmentId]),
)

/** The ammo a player fights with: their equipped ammo item, else standard FMJ. */
export function equippedAmmoId(inventory: InventoryItem[]): AmmoId {
  const equipped = inventory.find((i) => i.equipped && ITEM_ID_TO_AMMO[i.item_id])
  return equipped ? ITEM_ID_TO_AMMO[equipped.item_id] : 'standard'
}

/**
 * The attachments a player fights with, one per slot. If two attachments in the
 * same slot are equipped, the last one wins (the UI should keep it to one/slot).
 */
export function equippedAttachments(
  inventory: InventoryItem[],
): Partial<Record<AttachmentSlot, AttachmentId>> {
  const mods: Partial<Record<AttachmentSlot, AttachmentId>> = {}
  for (const i of inventory) {
    if (!i.equipped) continue
    const attId = ITEM_ID_TO_ATTACHMENT[i.item_id]
    if (!attId) continue
    mods[ATTACHMENT_CATALOG[attId].slot] = attId
  }
  return mods
}

/**
 * Field-kit gear (tactical toggles), sold off-chain like ammo. The kit_id maps to
 * the engine's FpsSim tactical attachment. Fixed UUIDs MUST match
 * supabase/migrations/009_field_kit.sql.
 */
export type FieldKitId = 'light' | 'nvg' | 'laser'
export const FIELD_KIT_ITEM_ID: Record<FieldKitId, string> = {
  light: 'cccc0001-cccc-4ccc-8ccc-cccccccccc01',
  nvg:   'cccc0002-cccc-4ccc-8ccc-cccccccccc02',
  laser: 'cccc0003-cccc-4ccc-8ccc-cccccccccc03',
}
const ITEM_ID_TO_KIT: Record<string, FieldKitId> = Object.fromEntries(
  Object.entries(FIELD_KIT_ITEM_ID).map(([kit, id]) => [id, kit as FieldKitId]),
)

/** True if a marketplace item is a field-kit gear item. */
export function fieldKitIdFromItemId(itemId: string): FieldKitId | undefined {
  return ITEM_ID_TO_KIT[itemId]
}

/** The field-kit gear a player OWNS (whether or not equipped) — the loadout only
 *  offers what you've bought. */
export function ownedFieldKit(inventory: InventoryItem[]): FieldKitId[] {
  return inventory.map((i) => ITEM_ID_TO_KIT[i.item_id]).filter((k): k is FieldKitId => !!k)
}
