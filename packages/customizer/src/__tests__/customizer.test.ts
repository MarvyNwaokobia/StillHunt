/**
 * @file customizer.test.ts
 * @description Jest test suite for the StillHunt Character Customization Engine.
 *
 * Coverage:
 *   1. Faction lock restrictions — items bound to specific factions reject others.
 *   2. Equipment swapping — slot state is correctly overwritten and cleared.
 *   3. Marketplace balance — catalog pricing / rarity invariants hold.
 *   4. Color validation — hex gate allows valid inputs, rejects malformed ones.
 *   5. UI state router — category → slot mapping and item filtering work correctly.
 */

import { CharacterCustomizerEngine } from '../engine/CustomizerEngine';
import { MARKETPLACE_CATALOG } from '../data/marketplaceCatalog';
import {
  getSubSlotsForCategory,
  getItemsForSlot,
  resolveCategoryView,
  getFreeItemsForSlot,
  getPremiumItemsForSlot,
} from '../ui/UiStateRouter';
import type { CharacterState, MarketplaceItem } from '../types/customizer.types';

// ─── Test State Factories ─────────────────────────────────────────────────────

function makeBerserkerState(): CharacterState {
  return {
    baseTemplateId: 'berserker_base',
    gender: 'Male',
    customProperties: {
      skinColor: '#c8a882',
      hairStyleId: '',
      hairColor: '#4a2c0f',
      eyeStyleId: '',
      equippedArmor: {},
      equippedWeapons: {},
    },
  };
}

function makeSentinelState(): CharacterState {
  return {
    baseTemplateId: 'sentinel_base',
    gender: 'Male',
    customProperties: {
      skinColor: '#e0c8a0',
      hairStyleId: '',
      hairColor: '#888888',
      eyeStyleId: '',
      equippedArmor: {},
      equippedWeapons: {},
    },
  };
}

function makePhantomState(): CharacterState {
  return {
    baseTemplateId: 'phantom_base',
    gender: 'Female',
    customProperties: {
      skinColor: '#d1a384',
      hairStyleId: '',
      hairColor: '#9b5de5',
      eyeStyleId: '',
      equippedArmor: {},
      equippedWeapons: {},
    },
  };
}

/** Unlocked copy of a catalog item — simulates a completed marketplace purchase. */
function unlocked(item: MarketplaceItem): MarketplaceItem {
  return { ...item, isLocked: false };
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. FACTION LOCK RESTRICTIONS
// ═════════════════════════════════════════════════════════════════════════════

describe('Faction Lock Restrictions', () => {
  let engine: CharacterCustomizerEngine;

  beforeEach(() => {
    engine = new CharacterCustomizerEngine(makeBerserkerState());
    engine.loadCatalog(MARKETPLACE_CATALOG);
  });

  it('allows a Berserker to equip a Berserker-only free item', () => {
    const result = engine.equipItem('arm_berserker_chest');
    expect(result.success).toBe(true);
    expect(result.affectedItem?.id).toBe('arm_berserker_chest');
  });

  it('blocks a Berserker from equipping a Sentinel-only item', () => {
    const result = engine.equipItem('arm_sentinel_chest');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Sentinel/);
    expect(result.affectedItem?.id).toBe('arm_sentinel_chest');
  });

  it('blocks a Berserker from equipping a Phantom-only free weapon', () => {
    const result = engine.equipItem('wep_phantom_sidearm');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Phantom/);
  });

  it('reports faction name in error, not a generic message', () => {
    const result = engine.equipItem('wep_iron_sword');       // Sentinel only
    expect(result.error).toContain('Sentinel');
    expect(result.error).toContain('Berserker');             // "your faction is Berserker"
  });

  it('allows a Phantom to equip the Warlord Top Knot (Berserker + Phantom)', () => {
    const phantomEngine = new CharacterCustomizerEngine(makePhantomState());
    phantomEngine.loadCatalog(MARKETPLACE_CATALOG);
    // top knot is locked — unlock it first to isolate the faction check
    const topKnot = MARKETPLACE_CATALOG.find(i => i.id === 'hair_top_knot')!;
    phantomEngine.registerItem(unlocked(topKnot));

    const result = phantomEngine.equipItem('hair_top_knot');
    expect(result.success).toBe(true);
  });

  it('blocks a Sentinel from equipping the Warlord Top Knot', () => {
    const sentinelEngine = new CharacterCustomizerEngine(makeSentinelState());
    sentinelEngine.loadCatalog(MARKETPLACE_CATALOG);
    const topKnot = MARKETPLACE_CATALOG.find(i => i.id === 'hair_top_knot')!;
    sentinelEngine.registerItem(unlocked(topKnot));

    const result = sentinelEngine.equipItem('hair_top_knot');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Sentinel/);
  });

  it('blocks equipping any item when the item is not in the registry', () => {
    const result = engine.equipItem('ghost_item_that_does_not_exist');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('blocks equipping locked items regardless of faction match', () => {
    // arm_crimson_pauldrons is Berserker-only but locked
    const result = engine.equipItem('arm_crimson_pauldrons');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/locked/i);
    // Faction error must NOT be the reason here — lock check comes first
    expect(result.error).not.toMatch(/incompatible|restricted/i);
  });

  it('allows cross-faction items (no allowedFactions) to be equipped after unlock', () => {
    const cape = MARKETPLACE_CATALOG.find(i => i.id === 'acc_hunt_cape')!;
    engine.registerItem(unlocked(cape));
    const result = engine.equipItem('acc_hunt_cape');
    expect(result.success).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. EQUIPMENT SWAPPING
// ═════════════════════════════════════════════════════════════════════════════

describe('Equipment Swapping', () => {
  let engine: CharacterCustomizerEngine;

  beforeEach(() => {
    engine = new CharacterCustomizerEngine(makeBerserkerState());
    engine.loadCatalog(MARKETPLACE_CATALOG);
  });

  it('writes item ID into the correct slot after equip', () => {
    engine.equipItem('arm_berserker_chest');
    expect(engine.getCurrentState().customProperties.equippedArmor.chest).toBe('arm_berserker_chest');
  });

  it('overwrites a slot when a new item is equipped to the same slot', () => {
    // Register a second free Berserker chest item for this test
    engine.registerItem({
      id: 'test_berserker_chest_v2',
      name: 'Test Chest V2',
      category: 'Armor',
      subSlot: 'chest',
      assetUrl: '/test/chest_v2.glb',
      rarity: 'Common',
      isLocked: false,
      allowedFactions: ['Berserker'],
    });
    engine.equipItem('arm_berserker_chest');
    engine.equipItem('test_berserker_chest_v2');
    expect(engine.getCurrentState().customProperties.equippedArmor.chest).toBe('test_berserker_chest_v2');
  });

  it('clears a slot after unequipSlot', () => {
    engine.equipItem('arm_berserker_chest');
    engine.unequipSlot('chest');
    expect(engine.getCurrentState().customProperties.equippedArmor.chest).toBeUndefined();
  });

  it('returns an error when unequipping an already-empty slot', () => {
    const result = engine.unequipSlot('chest');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it('equips weapons to the correct hands independently', () => {
    // Register unlocked versions of both weapon hands
    engine.registerItem(unlocked(MARKETPLACE_CATALOG.find(i => i.id === 'wep_red_axe')!));
    engine.equipItem('wep_crude_axe');             // main_hand free item
    expect(engine.getCurrentState().customProperties.equippedWeapons.mainHand).toBe('wep_crude_axe');
    expect(engine.getCurrentState().customProperties.equippedWeapons.offHand).toBeUndefined();
  });

  it('getEquippedItem returns the full MarketplaceItem for an occupied slot', () => {
    engine.equipItem('arm_berserker_chest');
    const item = engine.getEquippedItem('chest');
    expect(item).toBeDefined();
    expect(item?.name).toBe('Ironclad Hauberk');
  });

  it('getEquippedItem returns undefined for an empty slot', () => {
    expect(engine.getEquippedItem('chest')).toBeUndefined();
  });

  it('getCurrentState returns a deep clone — mutations do not affect internal state', () => {
    engine.equipItem('arm_berserker_chest');
    const snap = engine.getCurrentState();
    snap.customProperties.equippedArmor.chest = 'tampered_value';
    // Internal state must be unaffected
    expect(engine.getCurrentState().customProperties.equippedArmor.chest).toBe('arm_berserker_chest');
  });

  it('equips hair to hairStyleId and clears it on unequipSlot', () => {
    engine.equipItem('hair_viking_braids');
    expect(engine.getCurrentState().customProperties.hairStyleId).toBe('hair_viking_braids');
    engine.unequipSlot('hair_style');
    expect(engine.getCurrentState().customProperties.hairStyleId).toBe('');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. MARKETPLACE ITEM BALANCE VERIFICATION
// ═════════════════════════════════════════════════════════════════════════════

describe('Marketplace Item Balance', () => {
  it('every Legendary item is locked and has a price above 0', () => {
    const legendaries = MARKETPLACE_CATALOG.filter(i => i.rarity === 'Legendary');
    expect(legendaries.length).toBeGreaterThan(0);
    for (const item of legendaries) {
      expect(item.isLocked).toBe(true);
      expect(item.price).toBeDefined();
      expect(item.price!).toBeGreaterThan(0);
    }
  });

  it('every Common item that is locked has a price below 500', () => {
    const lockedCommons = MARKETPLACE_CATALOG.filter(i => i.rarity === 'Common' && i.isLocked);
    for (const item of lockedCommons) {
      expect(item.price ?? 0).toBeLessThan(500);
    }
  });

  it('average Legendary price > average Epic price', () => {
    const avg = (items: MarketplaceItem[]) => {
      const priced = items.filter(i => i.price !== undefined);
      return priced.reduce((sum, i) => sum + (i.price ?? 0), 0) / priced.length;
    };

    const legendaries = MARKETPLACE_CATALOG.filter(i => i.rarity === 'Legendary');
    const epics        = MARKETPLACE_CATALOG.filter(i => i.rarity === 'Epic');
    expect(avg(legendaries)).toBeGreaterThan(avg(epics));
  });

  it('each weapon item is assigned to at most one physical hand slot', () => {
    const weapons = MARKETPLACE_CATALOG.filter(i => i.category === 'Weapons');
    for (const w of weapons) {
      expect(['main_hand', 'off_hand']).toContain(w.subSlot);
    }
  });

  it('all three factions have at least one free weapon', () => {
    const freeWeapons = MARKETPLACE_CATALOG.filter(i => i.category === 'Weapons' && !i.isLocked);
    const factions = (['Berserker', 'Sentinel', 'Phantom'] as const);
    for (const faction of factions) {
      const has = freeWeapons.some(w => w.allowedFactions?.includes(faction) ?? false);
      expect(has).toBe(true);
    }
  });

  it('all three factions have at least one free chest piece', () => {
    const freeChests = MARKETPLACE_CATALOG.filter(i => i.subSlot === 'chest' && !i.isLocked);
    const factions = (['Berserker', 'Sentinel', 'Phantom'] as const);
    for (const faction of factions) {
      const has = freeChests.some(c => c.allowedFactions?.includes(faction) ?? false);
      expect(has).toBe(true);
    }
  });

  it('no item has an undefined id or empty name', () => {
    for (const item of MARKETPLACE_CATALOG) {
      expect(item.id).toBeTruthy();
      expect(item.name).toBeTruthy();
    }
  });

  it('no duplicate item IDs exist in the catalog', () => {
    const ids = MARKETPLACE_CATALOG.map(i => i.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. COLOR VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

describe('Color Validation', () => {
  let engine: CharacterCustomizerEngine;

  beforeEach(() => {
    engine = new CharacterCustomizerEngine(makeBerserkerState());
  });

  it('accepts a valid 6-digit hex skin color', () => {
    const result = engine.updateSkinTone('#a8c0ff');
    expect(result.success).toBe(true);
    expect(engine.getCurrentState().customProperties.skinColor).toBe('#a8c0ff');
  });

  it('accepts a valid 3-digit shorthand hex', () => {
    const result = engine.updateSkinTone('#abc');
    expect(result.success).toBe(true);
  });

  it('rejects a color string without the leading #', () => {
    expect(engine.updateSkinTone('ff0000').success).toBe(false);
  });

  it('rejects a color with an invalid character', () => {
    expect(engine.updateSkinTone('#gg0000').success).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(engine.updateSkinTone('').success).toBe(false);
  });

  it('rejects a colour that is too long', () => {
    expect(engine.updateSkinTone('#aabbccdd').success).toBe(false);
  });

  it('accepts a valid 6-digit hex hair color', () => {
    const result = engine.updateHairColor('#9b5de5');
    expect(result.success).toBe(true);
    expect(engine.getCurrentState().customProperties.hairColor).toBe('#9b5de5');
  });

  it('does not mutate state when a color update is rejected', () => {
    const before = engine.getCurrentState().customProperties.skinColor;
    engine.updateSkinTone('invalid');
    expect(engine.getCurrentState().customProperties.skinColor).toBe(before);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. UI STATE ROUTER
// ═════════════════════════════════════════════════════════════════════════════

describe('UI State Router', () => {
  it('Armor category maps to [head, chest, legs]', () => {
    const slots = getSubSlotsForCategory('Armor');
    expect(slots).toEqual(['head', 'chest', 'legs']);
  });

  it('Weapons category maps to [main_hand, off_hand]', () => {
    const slots = getSubSlotsForCategory('Weapons');
    expect(slots).toEqual(['main_hand', 'off_hand']);
  });

  it('Hair category maps to [hair_style]', () => {
    const slots = getSubSlotsForCategory('Hair');
    expect(slots).toEqual(['hair_style']);
  });

  it('getItemsForSlot without faction returns all items in that slot', () => {
    const chestItems = getItemsForSlot(MARKETPLACE_CATALOG, 'chest');
    expect(chestItems.length).toBeGreaterThan(0);
    expect(chestItems.every(i => i.subSlot === 'chest')).toBe(true);
  });

  it('getItemsForSlot with faction filters out incompatible items', () => {
    const berserkerChests = getItemsForSlot(MARKETPLACE_CATALOG, 'chest', 'Berserker');
    expect(berserkerChests.every(i =>
      !i.allowedFactions || i.allowedFactions.includes('Berserker'),
    )).toBe(true);
  });

  it('getItemsForSlot with faction still includes universal items (no allowedFactions)', () => {
    // acc_hunt_cape goes to chest with no faction restriction
    const chestItems = getItemsForSlot(MARKETPLACE_CATALOG, 'chest', 'Phantom');
    const cape = chestItems.find(i => i.id === 'acc_hunt_cape');
    expect(cape).toBeDefined();
  });

  it('resolveCategoryView defaultSlot is the first sub-slot of the category', () => {
    const view = resolveCategoryView(MARKETPLACE_CATALOG, 'Armor', 'Sentinel');
    expect(view.defaultSlot).toBe('head');
  });

  it('resolveCategoryView items match the defaultSlot and the given faction', () => {
    const view = resolveCategoryView(MARKETPLACE_CATALOG, 'Armor', 'Phantom');
    for (const item of view.items) {
      expect(item.subSlot).toBe(view.defaultSlot);
      if (item.allowedFactions) {
        expect(item.allowedFactions).toContain('Phantom');
      }
    }
  });

  it('getFreeItemsForSlot returns only unlocked items', () => {
    const freeChests = getFreeItemsForSlot(MARKETPLACE_CATALOG, 'chest');
    expect(freeChests.every(i => !i.isLocked)).toBe(true);
    expect(freeChests.length).toBeGreaterThan(0);
  });

  it('getPremiumItemsForSlot returns locked items sorted by price ascending', () => {
    const premiumChests = getPremiumItemsForSlot(MARKETPLACE_CATALOG, 'chest');
    expect(premiumChests.every(i => i.isLocked)).toBe(true);
    for (let idx = 1; idx < premiumChests.length; idx++) {
      expect((premiumChests[idx].price ?? 0)).toBeGreaterThanOrEqual((premiumChests[idx - 1].price ?? 0));
    }
  });
});
