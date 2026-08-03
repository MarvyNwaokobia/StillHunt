/**
 * @module @stillhunt/customizer
 * @description Public API barrel for the StillHunt Character Customization Engine.
 */

export { CharacterCustomizerEngine } from './engine/CustomizerEngine';
export { MARKETPLACE_CATALOG, CATALOG_MAP } from './data/marketplaceCatalog';
export {
  CATEGORY_SLOT_MAP,
  getSubSlotsForCategory,
  getItemsForSlot,
  resolveCategoryView,
  getFreeItemsForSlot,
  getPremiumItemsForSlot,
} from './ui/UiStateRouter';

export type {
  CustomizerCategory,
  SubSlot,
  Faction,
  Rarity,
  Gender,
  BaseTemplateId,
  ColorPalette,
  MarketplaceItem,
  CharacterState,
  EngineOperationResult,
  CategorySlotMap,
} from './types/customizer.types';
