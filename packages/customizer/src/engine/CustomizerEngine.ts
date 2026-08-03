/**
 * @module CustomizerEngine
 * @description Central orchestrator for the StillHunt character customization system.
 *
 * Architecture:
 *   - Pure TypeScript class with no UI framework dependency.
 *   - Owns a live CharacterState that is mutated through validated operations.
 *   - Maintains an O(1) Map registry for instant item lookups.
 *   - All public methods return EngineOperationResult so callers can react
 *     to success or failure without try/catch.
 *   - State is deep-cloned on read so external code can't corrupt internal state.
 */

import type {
  CharacterState,
  EngineOperationResult,
  Faction,
  MarketplaceItem,
  SubSlot,
} from '../types/customizer.types';

/** #rrggbb and #rgb are both valid color inputs. */
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export class CharacterCustomizerEngine {
  /** Live mutable character state — never leak a direct reference outward. */
  private state: CharacterState;

  /** Item registry keyed by item.id for O(1) equip-time lookups. */
  private readonly registry: Map<string, MarketplaceItem> = new Map();

  constructor(initialState: CharacterState) {
    this.state = this.deepClone(initialState);
  }

  // ─── Catalog Management ───────────────────────────────────────────────────

  /** Adds a single item to the runtime catalog. Overwrites on duplicate ID. */
  public registerItem(item: MarketplaceItem): void {
    this.registry.set(item.id, item);
  }

  /** Batch-loads an entire catalog array into the registry in one pass. */
  public loadCatalog(items: readonly MarketplaceItem[]): void {
    for (const item of items) {
      this.registry.set(item.id, item);
    }
  }

  // ─── Equip / Unequip ──────────────────────────────────────────────────────

  /**
   * Attempts to equip the item identified by `itemId`.
   *
   * Validation pipeline (short-circuits on first failure):
   *   1. Existence check — item must be in the registry.
   *   2. Lock check    — item must have been purchased/unlocked.
   *   3. Faction gate  — item's allowedFactions must include this character's faction.
   *   4. Slot routing  — writes the item ID into the correct CharacterState field.
   */
  public equipItem(itemId: string): EngineOperationResult {
    const item = this.registry.get(itemId);

    if (!item) {
      return { success: false, error: `Item "${itemId}" not found in catalog.` };
    }

    if (item.isLocked) {
      return {
        success: false,
        error: `"${item.name}" is locked — purchase required from the Marketplace.`,
        affectedItem: item,
      };
    }

    const faction = this.getFaction();
    if (item.allowedFactions !== undefined && !item.allowedFactions.includes(faction)) {
      return {
        success: false,
        error: `"${item.name}" is restricted to [${item.allowedFactions.join(', ')}]. Your character is a ${faction}.`,
        affectedItem: item,
      };
    }

    this.routeToSlot(item);
    return { success: true, affectedItem: item };
  }

  /**
   * Clears whatever is equipped in the given slot.
   * Returns an error result if the slot was already empty.
   */
  public unequipSlot(slot: SubSlot): EngineOperationResult {
    const props = this.state.customProperties;

    switch (slot) {
      case 'head':
        if (props.equippedArmor.head === undefined) return { success: false, error: 'Head slot is already empty.' };
        delete props.equippedArmor.head;
        break;
      case 'chest':
        if (props.equippedArmor.chest === undefined) return { success: false, error: 'Chest slot is already empty.' };
        delete props.equippedArmor.chest;
        break;
      case 'legs':
        if (props.equippedArmor.legs === undefined) return { success: false, error: 'Legs slot is already empty.' };
        delete props.equippedArmor.legs;
        break;
      case 'main_hand':
        if (props.equippedWeapons.mainHand === undefined) return { success: false, error: 'Main-hand slot is already empty.' };
        delete props.equippedWeapons.mainHand;
        break;
      case 'off_hand':
        if (props.equippedWeapons.offHand === undefined) return { success: false, error: 'Off-hand slot is already empty.' };
        delete props.equippedWeapons.offHand;
        break;
      case 'hair_style':
        if (props.hairStyleId === '') return { success: false, error: 'Hair slot is already empty.' };
        props.hairStyleId = '';
        break;
      default:
        return { success: false, error: `Slot "${slot}" cannot be manually unequipped.` };
    }

    return { success: true };
  }

  // ─── Dynamic Property Setters ─────────────────────────────────────────────

  /** Updates the character skin tone. Rejects malformed hex strings. */
  public updateSkinTone(hexColor: string): EngineOperationResult {
    if (!HEX_COLOR_RE.test(hexColor)) {
      return { success: false, error: `Invalid hex color: "${hexColor}". Expected #rrggbb or #rgb.` };
    }
    this.state.customProperties.skinColor = hexColor;
    return { success: true };
  }

  /** Updates the hair albedo override. Rejects malformed hex strings. */
  public updateHairColor(hexColor: string): EngineOperationResult {
    if (!HEX_COLOR_RE.test(hexColor)) {
      return { success: false, error: `Invalid hex color: "${hexColor}". Expected #rrggbb or #rgb.` };
    }
    this.state.customProperties.hairColor = hexColor;
    return { success: true };
  }

  // ─── State Accessors ──────────────────────────────────────────────────────

  /** Returns a deep-cloned snapshot safe for external consumption. */
  public getCurrentState(): CharacterState {
    return this.deepClone(this.state);
  }

  /**
   * Returns the full MarketplaceItem occupying the given slot, or undefined
   * if the slot is empty or the stored ID has been removed from the catalog.
   */
  public getEquippedItem(slot: SubSlot): MarketplaceItem | undefined {
    const props = this.state.customProperties;
    let id: string | undefined;

    switch (slot) {
      case 'head':       id = props.equippedArmor.head; break;
      case 'chest':      id = props.equippedArmor.chest; break;
      case 'legs':       id = props.equippedArmor.legs; break;
      case 'main_hand':  id = props.equippedWeapons.mainHand; break;
      case 'off_hand':   id = props.equippedWeapons.offHand; break;
      case 'hair_style': id = props.hairStyleId !== '' ? props.hairStyleId : undefined; break;
      default:           return undefined;
    }

    return id !== undefined ? this.registry.get(id) : undefined;
  }

  /** Exposes the full catalog as a read-only Map for external views. */
  public getCatalog(): ReadonlyMap<string, MarketplaceItem> {
    return this.registry;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /** Derives the Faction from the character's base template ID prefix. */
  private getFaction(): Faction {
    const base = this.state.baseTemplateId;
    if (base.startsWith('berserker')) return 'Berserker';
    if (base.startsWith('sentinel')) return 'Sentinel';
    return 'Phantom';
  }

  /**
   * Routes a fully validated item into the correct CharacterState field.
   * The dispatch table avoids a long switch on every equip call.
   */
  private routeToSlot(item: MarketplaceItem): void {
    const props = this.state.customProperties;
    const dispatch: Partial<Record<SubSlot, () => void>> = {
      hair_style: () => { props.hairStyleId = item.id; },
      eye_style:  () => { props.eyeStyleId  = item.id; },
      head:       () => { props.equippedArmor.head  = item.id; },
      chest:      () => { props.equippedArmor.chest = item.id; },
      legs:       () => { props.equippedArmor.legs  = item.id; },
      main_hand:  () => { props.equippedWeapons.mainHand = item.id; },
      off_hand:   () => { props.equippedWeapons.offHand  = item.id; },
    };
    dispatch[item.subSlot]?.();
  }

  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj)) as T;
  }
}
