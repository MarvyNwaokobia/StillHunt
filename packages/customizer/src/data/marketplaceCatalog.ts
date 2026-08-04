/**
 * @module marketplaceCatalog
 * @description Seed data for the StillHunt Marketplace.
 *
 * Design principles:
 *   - Each faction has a free starter set (isLocked: false, no price) so new
 *     players can immediately dress their character.
 *   - Premium items (Epic/Legendary) are locked with explicit prices to form
 *     the monetisation layer.
 *   - Cross-faction accessories exist to reward long-term players regardless
 *     of class.
 *   - The CATALOG_MAP export provides O(1) lookups for hot paths.
 */

import type { MarketplaceItem } from '../types/customizer.types';

export const MARKETPLACE_CATALOG: readonly MarketplaceItem[] = [

  // ══════════════════════════════════════════════════════════════════════════
  // BASE — Skin Tones (universal, always free)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'skin_pale',
    name: 'Pale Tone',
    category: 'Base',
    subSlot: 'skin_tone',
    assetUrl: '/assets/textures/skin/pale.png',
    rarity: 'Common',
    isLocked: false,
  },
  {
    id: 'skin_tan',
    name: 'Sun-Kissed Tan',
    category: 'Base',
    subSlot: 'skin_tone',
    assetUrl: '/assets/textures/skin/tan.png',
    rarity: 'Common',
    isLocked: false,
  },
  {
    id: 'skin_dark',
    name: 'Ebony Tone',
    category: 'Base',
    subSlot: 'skin_tone',
    assetUrl: '/assets/textures/skin/dark.png',
    rarity: 'Common',
    isLocked: false,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // HAIR — Berserker
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'hair_viking_braids',
    name: 'Runic Braids',
    category: 'Hair',
    subSlot: 'hair_style',
    assetUrl: '/assets/meshes/hair/viking_braids.glb',
    rarity: 'Common',
    isLocked: false,
    allowedFactions: ['Berserker'],
  },
  {
    id: 'hair_top_knot',
    name: 'Warlord Top Knot',
    category: 'Hair',
    subSlot: 'hair_style',
    assetUrl: '/assets/meshes/hair/top_knot.glb',
    rarity: 'Rare',
    isLocked: true,
    price: 300,
    allowedFactions: ['Berserker', 'Phantom'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // HAIR — Sentinel
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'hair_buzzcut',
    name: 'Sentinel Buzzcut',
    category: 'Hair',
    subSlot: 'hair_style',
    assetUrl: '/assets/meshes/hair/buzzcut.glb',
    rarity: 'Common',
    isLocked: false,
    allowedFactions: ['Sentinel'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // HAIR — Phantom / Sentinel (cross-faction premium)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'hair_tactical_undercut',
    name: 'Operator Undercut',
    category: 'Hair',
    subSlot: 'hair_style',
    assetUrl: '/assets/meshes/hair/tactical_undercut.glb',
    rarity: 'Rare',
    isLocked: true,
    price: 150,
    allowedFactions: ['Phantom', 'Sentinel'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ARMOR — Berserker
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'arm_berserker_helm',
    name: 'Drifter War Helm',
    category: 'Armor',
    subSlot: 'head',
    assetUrl: '/assets/meshes/armor/berserker/iron_war_helm.glb',
    rarity: 'Common',
    isLocked: false,
    allowedFactions: ['Berserker'],
  },
  {
    id: 'arm_crimson_pauldrons',
    name: 'Crimson Pauldrons',
    category: 'Armor',
    subSlot: 'head',
    assetUrl: '/assets/meshes/armor/berserker/crimson_pauldrons.glb',
    rarity: 'Epic',
    isLocked: true,
    price: 800,
    allowedFactions: ['Berserker'],
    fx: { glowColor: '#ff3300', particle: 'embers' },
  },
  {
    id: 'arm_berserker_chest',
    name: 'Ironclad Hauberk',
    category: 'Armor',
    subSlot: 'chest',
    assetUrl: '/assets/meshes/armor/berserker/ironclad_hauberk.glb',
    rarity: 'Common',
    isLocked: false,
    allowedFactions: ['Berserker'],
  },
  {
    id: 'arm_berserker_legs',
    name: 'Warbeast Greaves',
    category: 'Armor',
    subSlot: 'legs',
    assetUrl: '/assets/meshes/armor/berserker/warbeast_greaves.glb',
    rarity: 'Common',
    isLocked: false,
    allowedFactions: ['Berserker'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ARMOR — Sentinel
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'arm_griffin_helm',
    name: 'Griffin Helm',
    category: 'Armor',
    subSlot: 'head',
    assetUrl: '/assets/meshes/armor/sentinel/griffin_helm.glb',
    rarity: 'Epic',
    isLocked: true,
    price: 900,
    allowedFactions: ['Sentinel'],
    fx: { glowColor: '#4488ff' },
  },
  {
    id: 'arm_sentinel_chest',
    name: 'Bastion Hauberk',
    category: 'Armor',
    subSlot: 'chest',
    assetUrl: '/assets/meshes/armor/sentinel/bastion_hauberk.glb',
    rarity: 'Common',
    isLocked: false,
    allowedFactions: ['Sentinel'],
  },
  {
    id: 'arm_griffin_breastplate',
    name: 'Griffin Breastplate',
    category: 'Armor',
    subSlot: 'chest',
    assetUrl: '/assets/meshes/armor/sentinel/griffin_breastplate.glb',
    rarity: 'Legendary',
    isLocked: true,
    price: 1200,
    allowedFactions: ['Sentinel'],
    fx: { glowColor: '#4488ff', particle: 'electric_sparks' },
  },
  {
    id: 'arm_sentinel_legs',
    name: 'Bastion Legguards',
    category: 'Armor',
    subSlot: 'legs',
    assetUrl: '/assets/meshes/armor/sentinel/bastion_legguards.glb',
    rarity: 'Common',
    isLocked: false,
    allowedFactions: ['Sentinel'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ARMOR — Phantom
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'arm_shadow_cowl',
    name: 'Shadow Cowl',
    category: 'Armor',
    subSlot: 'head',
    assetUrl: '/assets/meshes/armor/phantom/shadow_cowl.glb',
    rarity: 'Common',
    isLocked: false,
    allowedFactions: ['Phantom'],
  },
  {
    id: 'arm_shadow_plate',
    name: 'Shadow Plate',
    category: 'Armor',
    subSlot: 'chest',
    assetUrl: '/assets/meshes/armor/phantom/shadow_plate.glb',
    rarity: 'Epic',
    isLocked: true,
    price: 750,
    allowedFactions: ['Phantom'],
    fx: { glowColor: '#9b5de5', particle: 'void_wisps' },
  },
  {
    id: 'arm_phantom_chest',
    name: 'Wraith Tunic',
    category: 'Armor',
    subSlot: 'chest',
    assetUrl: '/assets/meshes/armor/phantom/wraith_tunic.glb',
    rarity: 'Common',
    isLocked: false,
    allowedFactions: ['Phantom'],
  },
  {
    id: 'arm_stealth_wraps',
    name: 'Void Wraps',
    category: 'Armor',
    subSlot: 'legs',
    assetUrl: '/assets/meshes/armor/phantom/void_wraps.glb',
    rarity: 'Common',
    isLocked: false,
    allowedFactions: ['Phantom'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // WEAPONS — Berserker
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'wep_crude_axe',
    name: 'Crude War Axe',
    category: 'Weapons',
    subSlot: 'main_hand',
    assetUrl: '/assets/meshes/weapons/berserker/crude_axe.glb',
    rarity: 'Common',
    isLocked: false,
    allowedFactions: ['Berserker'],
    fx: { soundProfile: 'heavy_slash' },
  },
  {
    id: 'wep_red_axe',
    name: 'Ragnarok Great Axe',
    category: 'Weapons',
    subSlot: 'main_hand',
    assetUrl: '/assets/meshes/weapons/berserker/ragnarok_axe.glb',
    rarity: 'Epic',
    isLocked: true,
    price: 600,
    allowedFactions: ['Berserker'],
    fx: { particle: 'embers', soundProfile: 'heavy_slash', glowColor: '#ff2200' },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // WEAPONS — Sentinel
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'wep_iron_sword',
    name: 'Drifter Shortsword',
    category: 'Weapons',
    subSlot: 'main_hand',
    assetUrl: '/assets/meshes/weapons/sentinel/iron_shortsword.glb',
    rarity: 'Common',
    isLocked: false,
    allowedFactions: ['Sentinel'],
    fx: { soundProfile: 'steel_clash' },
  },
  {
    id: 'wep_sentinel_shield',
    name: 'Drifter Tower Shield',
    category: 'Weapons',
    subSlot: 'off_hand',
    assetUrl: '/assets/meshes/weapons/sentinel/tower_shield.glb',
    rarity: 'Common',
    isLocked: false,
    allowedFactions: ['Sentinel'],
  },
  {
    id: 'wep_blue_broadsword',
    name: 'Tempest Broadsword',
    category: 'Weapons',
    subSlot: 'main_hand',
    assetUrl: '/assets/meshes/weapons/sentinel/tempest_broadsword.glb',
    rarity: 'Legendary',
    isLocked: true,
    price: 1500,
    allowedFactions: ['Sentinel'],
    fx: { particle: 'lightning_arc', soundProfile: 'energy_hum', glowColor: '#00aaff' },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // WEAPONS — Phantom
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'wep_phantom_sidearm',
    name: 'Shadow Dirk',
    category: 'Weapons',
    subSlot: 'main_hand',
    assetUrl: '/assets/meshes/weapons/phantom/shadow_dirk.glb',
    rarity: 'Common',
    isLocked: false,
    allowedFactions: ['Phantom'],
    fx: { soundProfile: 'stealth_slice' },
  },
  {
    id: 'wep_purple_dagger_main',
    name: 'Void Fang (Main)',
    category: 'Weapons',
    subSlot: 'main_hand',
    assetUrl: '/assets/meshes/weapons/phantom/void_fang_main.glb',
    rarity: 'Epic',
    isLocked: true,
    price: 550,
    allowedFactions: ['Phantom'],
    fx: { particle: 'void_trail', soundProfile: 'stealth_slice', glowColor: '#9b5de5' },
  },
  {
    id: 'wep_purple_dagger_off',
    name: 'Void Fang (Off)',
    category: 'Weapons',
    subSlot: 'off_hand',
    assetUrl: '/assets/meshes/weapons/phantom/void_fang_off.glb',
    rarity: 'Epic',
    isLocked: true,
    price: 550,
    allowedFactions: ['Phantom'],
    fx: { particle: 'void_trail', soundProfile: 'stealth_slice', glowColor: '#9b5de5' },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ACCESSORIES — Cross-faction prestige items
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'acc_hunt_cape',
    name: 'StillHunt War Cape',
    category: 'Accessories',
    subSlot: 'chest',
    assetUrl: '/assets/meshes/accessories/stillhunt_cape.glb',
    rarity: 'Legendary',
    isLocked: true,
    price: 2000,
  },
];

/** O(1) lookup map constructed once at module load — use this in hot paths. */
export const CATALOG_MAP: ReadonlyMap<string, MarketplaceItem> = new Map(
  MARKETPLACE_CATALOG.map(item => [item.id, item]),
);
