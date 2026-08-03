import { describe, it, expect } from 'vitest'
import { GUN_ITEM_ID, isGunItem, equippedGunId } from '@/lib/guns'
import type { InventoryItem } from '@/types'

const inv = (over: Partial<InventoryItem>): InventoryItem => ({
  wallet_address: '0xabc', item_id: 'x', equipped: false, acquired_at: '', ...over,
})

describe('equipped gun mapping', () => {
  it('defaults to the starter sidearm with no gun equipped', () => {
    expect(equippedGunId([])).toBe('sidearm')
    expect(equippedGunId([inv({ item_id: GUN_ITEM_ID.smg, equipped: false })])).toBe('sidearm')
  })

  it('returns the equipped gun tier', () => {
    expect(equippedGunId([inv({ item_id: GUN_ITEM_ID.marksman, equipped: true })])).toBe('marksman')
    expect(equippedGunId([inv({ item_id: GUN_ITEM_ID.legendary, equipped: true })])).toBe('legendary')
  })

  it('ignores equipped non-gun items (cosmetics, shields)', () => {
    expect(equippedGunId([inv({ item_id: 'some-cosmetic-uuid', equipped: true })])).toBe('sidearm')
  })

  it('recognises gun item ids', () => {
    expect(isGunItem(GUN_ITEM_ID.assault_rifle)).toBe(true)
    expect(isGunItem('not-a-gun')).toBe(false)
  })
})
