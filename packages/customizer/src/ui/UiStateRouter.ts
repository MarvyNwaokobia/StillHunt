/**
 * @module UiStateRouter
 * @description Stateless helper layer between the engine data model and the
 * front-end carousel/grid rendering.
 *
 * Responsibilities:
 *   - Map each CustomizerCategory tab to its ordered list of SubSlots so the
 *     left-rail slot selector knows what buttons to render.
 *   - Filter the flat catalog into per-slot, per-faction item lists for the
 *     item grid without the UI needing to know the data shape.
 *   - Provide a one-shot `resolveCategoryView` function that the sidebar can
 *     call on every tab click to get everything it needs in one call.
 *
 * All functions are pure — they take data in and return data out, making them
 * trivial to unit test and safe to call in any rendering context.
 */

import type {
  CategorySlotMap,
  CustomizerCategory,
  Faction,
  MarketplaceItem,
  SubSlot,
} from '../types/customizer.types';

// ─── Slot Map ─────────────────────────────────────────────────────────────────

/**
 * Canonical mapping from UI tab → ordered sub-slot list.
 * Order matters: the first entry is the default slot shown on tab activation.
 */
export const CATEGORY_SLOT_MAP: CategorySlotMap = {
  Base:        ['skin_tone', 'eye_style'],
  Hair:        ['hair_style'],
  Armor:       ['head', 'chest', 'legs'],
  Weapons:     ['main_hand', 'off_hand'],
  Accessories: ['chest'],
} as const;

// ─── Pure Helpers ─────────────────────────────────────────────────────────────

/**
 * Returns the ordered SubSlot list for a given category tab.
 * Used by the slot-selector rail on the left of the customizer panel.
 */
export function getSubSlotsForCategory(category: CustomizerCategory): readonly SubSlot[] {
  return CATEGORY_SLOT_MAP[category];
}

/**
 * Filters a catalog to items matching the given SubSlot.
 *
 * When `faction` is supplied, items with an `allowedFactions` restriction that
 * does NOT include this faction are excluded. Items with no restriction pass
 * through regardless of faction (universal items).
 */
export function getItemsForSlot(
  catalog: readonly MarketplaceItem[],
  slot: SubSlot,
  faction?: Faction,
): MarketplaceItem[] {
  return catalog.filter(item => {
    if (item.subSlot !== slot) return false;
    if (faction !== undefined && item.allowedFactions !== undefined) {
      return item.allowedFactions.includes(faction);
    }
    return true;
  });
}

/**
 * One-shot resolver for a category tab click.
 *
 * Returns:
 *   - `subSlots`    — ordered slot list to render in the slot-selector rail.
 *   - `defaultSlot` — the slot automatically selected on tab activation.
 *   - `items`       — filtered MarketplaceItem list for `defaultSlot`.
 */
export function resolveCategoryView(
  catalog: readonly MarketplaceItem[],
  category: CustomizerCategory,
  faction?: Faction,
): { subSlots: readonly SubSlot[]; defaultSlot: SubSlot; items: MarketplaceItem[] } {
  const subSlots = getSubSlotsForCategory(category);
  const defaultSlot = subSlots[0];
  const items = getItemsForSlot(catalog, defaultSlot, faction);
  return { subSlots, defaultSlot, items };
}

/**
 * Convenience filter for the "free items" carousel shown to new players.
 * Returns only unlocked items for a given slot and optional faction.
 */
export function getFreeItemsForSlot(
  catalog: readonly MarketplaceItem[],
  slot: SubSlot,
  faction?: Faction,
): MarketplaceItem[] {
  return getItemsForSlot(catalog, slot, faction).filter(item => !item.isLocked);
}

/**
 * Returns locked (purchasable) items sorted ascending by price.
 * Used to populate the "Premium" section of the marketplace grid.
 */
export function getPremiumItemsForSlot(
  catalog: readonly MarketplaceItem[],
  slot: SubSlot,
  faction?: Faction,
): MarketplaceItem[] {
  return getItemsForSlot(catalog, slot, faction)
    .filter(item => item.isLocked)
    .sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
}
