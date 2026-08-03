/**
 * @module customizer.types
 * @description Core type definitions for the StillHunt Character Customization Engine.
 *
 * All shared interfaces and union types are centralized here to enforce strict
 * compile-time contracts across the engine, data layer, and UI router. No
 * runtime code lives in this file — types are stripped at compile time.
 */

// ─── Primitive Unions ─────────────────────────────────────────────────────────

/** Top-level tabs visible in the customizer sidebar. */
export type CustomizerCategory = 'Base' | 'Hair' | 'Armor' | 'Weapons' | 'Accessories';

/** Granular equipment slots a MarketplaceItem can occupy on a character. */
export type SubSlot =
  | 'skin_tone'
  | 'hair_style'
  | 'eye_style'
  | 'head'
  | 'chest'
  | 'legs'
  | 'main_hand'
  | 'off_hand';

/** The three playable factions in StillHunt. */
export type Faction = 'Berserker' | 'Sentinel' | 'Phantom';

/** Item rarity tiers, ordered from lowest to highest value. */
export type Rarity = 'Common' | 'Rare' | 'Epic' | 'Legendary';

/** Supported character gender variants. */
export type Gender = 'Male' | 'Female';

/** Valid base template identifiers that drive skeleton and proportions. */
export type BaseTemplateId = 'berserker_base' | 'sentinel_base' | 'phantom_base';

// ─── Interfaces ───────────────────────────────────────────────────────────────

/** A named color swatch for palette pickers. */
export interface ColorPalette {
  id: string;
  hex: string;
  displayName: string;
}

/**
 * A single item entry in the StillHunt marketplace catalog.
 *
 * Items may be universal (no `allowedFactions`) or faction-gated.
 * Locked items require purchase before `equipItem` will accept them.
 */
export interface MarketplaceItem {
  /** Unique stable identifier referenced in CharacterState slot fields. */
  id: string;
  name: string;
  category: CustomizerCategory;
  /** The specific equipment slot this item occupies on the character rig. */
  subSlot: SubSlot;
  /** Relative path to the 3D mesh asset (GLTF/GLB) or sprite sheet. */
  assetUrl: string;
  rarity: Rarity;
  /** When true, the item must be purchased before it can be equipped. */
  isLocked: boolean;
  /** Virtual currency cost. Absent means the item is free. */
  price?: number;
  /** When set, only characters belonging to one of these factions can equip this item. */
  allowedFactions?: Faction[];
  /** Optional renderer hints for particle / audio effects. */
  fx?: {
    particle?: string;
    soundProfile?: string;
    glowColor?: string;
  };
}

/**
 * The complete serialisable snapshot of a character's active customisation.
 * This is the canonical record persisted to the database after each change.
 */
export interface CharacterState {
  baseTemplateId: BaseTemplateId;
  gender: Gender;
  customProperties: {
    /** Hex string (#rrggbb or #rgb) for the skin shader tint. */
    skinColor: string;
    /** ID of the currently equipped hair mesh. Empty string means no hair. */
    hairStyleId: string;
    /** Hex string for the hair albedo override. */
    hairColor: string;
    /** ID of the currently equipped eye texture variant. */
    eyeStyleId: string;
    equippedArmor: {
      head?: string;
      chest?: string;
      legs?: string;
    };
    equippedWeapons: {
      mainHand?: string;
      offHand?: string;
    };
  };
}

/** Unified return type for all mutating engine operations. */
export interface EngineOperationResult {
  success: boolean;
  error?: string;
  /** The item acted on, when applicable. */
  affectedItem?: MarketplaceItem;
}

/**
 * Declares which SubSlots are exposed under each CustomizerCategory tab.
 * Used by the UI router to build the slot-selector carousel.
 */
export type CategorySlotMap = Readonly<Record<CustomizerCategory, readonly SubSlot[]>>;
