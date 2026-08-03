/**
 * @module viewport
 * @description Terminal-based mock 3D viewport simulation.
 *
 * Demonstrates the engine's state machine by running a scripted sequence of
 * equip operations and rendering the character state as a styled ASCII frame
 * after each change — mimicking the real-time viewport update that a WebGL
 * renderer would receive.
 *
 * Run with:  npx ts-node --project tsconfig.jest.json src/simulation/viewport.ts
 */

import { CharacterCustomizerEngine } from '../engine/CustomizerEngine';
import { MARKETPLACE_CATALOG } from '../data/marketplaceCatalog';
import type { CharacterState, MarketplaceItem } from '../types/customizer.types';

// ─── ANSI helpers (no external dependency) ───────────────────────────────────

const ANSI = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
  bgBlack: '\x1b[40m',
};

function c(code: string, text: string): string {
  return `${code}${text}${ANSI.reset}`;
}

// ─── Viewport Renderer ────────────────────────────────────────────────────────

const VIEWPORT_WIDTH = 52;

function hr(char = '═'): string {
  return char.repeat(VIEWPORT_WIDTH - 2);
}

function row(content: string): string {
  const visible = content.replace(/\x1b\[[0-9;]*m/g, '');
  const pad = VIEWPORT_WIDTH - 2 - visible.length;
  return `║${content}${' '.repeat(Math.max(0, pad))}║`;
}

function renderViewport(state: CharacterState, label: string): void {
  const props = state.customProperties;
  const faction =
    state.baseTemplateId === 'berserker_base' ? 'BERSERKER' :
    state.baseTemplateId === 'sentinel_base'  ? 'SENTINEL'  : 'PHANTOM';

  const factionColor =
    faction === 'BERSERKER' ? ANSI.red :
    faction === 'SENTINEL'  ? ANSI.blue : ANSI.magenta;

  const chestLabel = props.equippedArmor.chest  ?? c(ANSI.dim, '—bare—');
  const headLabel  = props.equippedArmor.head   ?? c(ANSI.dim, '—bare—');
  const legsLabel  = props.equippedArmor.legs   ?? c(ANSI.dim, '—bare—');
  const mainLabel  = props.equippedWeapons.mainHand ?? c(ANSI.dim, '—empty—');
  const offLabel   = props.equippedWeapons.offHand  ?? c(ANSI.dim, '—empty—');

  console.log(`\n╔${hr()}╗`);
  console.log(row(c(ANSI.bold + ANSI.yellow, `  ⚔  STILLHUNT 3D VIEWPORT  ⚔  ${label}`)));
  console.log(`╠${hr()}╣`);
  console.log(row(`  Class  : ${c(factionColor + ANSI.bold, faction)}  (${state.gender})`));
  console.log(row(`  Skin   : ${c(ANSI.white, props.skinColor)}   Hair dye: ${c(ANSI.white, props.hairColor)}`));
  console.log(`╠${hr('─')}╣`);

  // ASCII character silhouette
  const headGlyph  = headLabel  === c(ANSI.dim, '—bare—') ? c(ANSI.dim, '[ bare ]') : c(factionColor, `[ ${String(headLabel).substring(4, 14)} ]`);
  const chestGlyph = chestLabel === c(ANSI.dim, '—bare—') ? c(ANSI.dim, '|  bare  |') : c(factionColor, `| ${String(chestLabel).substring(4, 12)} |`);
  const legsGlyph  = legsLabel  === c(ANSI.dim, '—bare—') ? c(ANSI.dim, '| bare  |') : c(factionColor, `| ${String(legsLabel).substring(4, 12)} |`);

  console.log(row(`          /‾‾‾‾‾‾‾‾\\`));
  console.log(row(`         |  O    O  |  ← eye style`));
  console.log(row(`          \\________/`));
  console.log(row(`        ~~~ ${props.hairStyleId !== '' ? c(ANSI.yellow, props.hairStyleId.replace('hair_', '')) : c(ANSI.dim, 'no hair')} ~~~`));
  console.log(row(`          ${headGlyph}  ← head`));
  console.log(row(`         ${chestGlyph} ← chest`));
  console.log(row(`         ${legsGlyph}  ← legs`));
  console.log(row(`           /     \\`));
  console.log(row(`    ${c(ANSI.cyan, `[M:${mainLabel}]`)}  ${c(ANSI.cyan, `[O:${offLabel}]`)}`));

  console.log(`╠${hr('─')}╣`);
  console.log(row(c(ANSI.green, '  ✓ Viewport synced — all layers composited')));
  console.log(`╚${hr()}╝`);
}

// ─── Scripted Demo Sequence ───────────────────────────────────────────────────

function logEvent(emoji: string, msg: string): void {
  console.log(`\n${emoji}  ${c(ANSI.bold, msg)}`);
}

function logResult(result: { success: boolean; error?: string; affectedItem?: MarketplaceItem }): void {
  if (result.success) {
    const name = result.affectedItem?.name ?? 'operation';
    console.log(c(ANSI.green, `   ✓  SUCCESS — "${name}" equipped`));
  } else {
    console.log(c(ANSI.red, `   ✗  BLOCKED — ${result.error ?? 'unknown error'}`));
  }
}

function runSimulation(): void {
  console.clear();
  console.log(c(ANSI.bold + ANSI.yellow, '\n════════ STILLHUNT CUSTOMIZER ENGINE — VIEWPORT SIMULATION ════════\n'));

  // ── Step 1: Initialise a Phantom female character ──────────────────────────
  const initialState: CharacterState = {
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

  const engine = new CharacterCustomizerEngine(initialState);
  engine.loadCatalog(MARKETPLACE_CATALOG);

  logEvent('🎮', 'Step 1 — Initialising Phantom base avatar...');
  renderViewport(engine.getCurrentState(), '[ NAKED STATE ]');

  // ── Step 2: Equip free starter gear ───────────────────────────────────────
  logEvent('🛡️', 'Step 2 — Equipping free Phantom starter gear...');
  logResult(engine.equipItem('arm_shadow_cowl'));
  logResult(engine.equipItem('arm_phantom_chest'));
  logResult(engine.equipItem('arm_stealth_wraps'));
  logResult(engine.equipItem('wep_phantom_sidearm'));
  renderViewport(engine.getCurrentState(), '[ STARTER LOADOUT ]');

  // ── Step 3: Apply cosmetics ────────────────────────────────────────────────
  logEvent('💇', 'Step 3 — Styling hair and skin tone...');
  logResult(engine.updateSkinTone('#b5856a'));
  logResult(engine.updateHairColor('#ff00cc'));
  logResult(engine.equipItem('hair_tactical_undercut'));  // locked → should fail
  renderViewport(engine.getCurrentState(), '[ STYLING FAIL — item locked ]');

  // ── Step 4: Faction violation test ────────────────────────────────────────
  logEvent('🚫', 'Step 4 — Attempting cross-faction equip (Berserker axe on Phantom)...');
  logResult(engine.equipItem('wep_crude_axe'));          // Berserker only → rejected
  logResult(engine.equipItem('arm_berserker_chest'));    // Berserker only → rejected

  // ── Step 5: Unlock and equip premium items (simulate purchase) ────────────
  logEvent('💰', 'Step 5 — Purchase simulation: unlocking Void Fangs...');
  // In production this unlock would come from a blockchain/payment callback.
  // We simulate it here by re-registering the item with isLocked: false.
  const voidFangMain = MARKETPLACE_CATALOG.find(i => i.id === 'wep_purple_dagger_main')!;
  const voidFangOff  = MARKETPLACE_CATALOG.find(i => i.id === 'wep_purple_dagger_off')!;
  engine.registerItem({ ...voidFangMain, isLocked: false });
  engine.registerItem({ ...voidFangOff,  isLocked: false });

  logResult(engine.equipItem('wep_purple_dagger_main'));
  logResult(engine.equipItem('wep_purple_dagger_off'));
  renderViewport(engine.getCurrentState(), '[ VOID FANG LOADOUT ]');

  // ── Step 6: Invalid hex color rejection ───────────────────────────────────
  logEvent('🎨', 'Step 6 — Testing invalid hex color input...');
  logResult(engine.updateSkinTone('not-a-color'));
  logResult(engine.updateSkinTone('#gg0000'));
  logResult(engine.updateSkinTone('#aaa'));   // 3-char shorthand — valid

  // ── Step 7: Slot swap — main weapon ───────────────────────────────────────
  logEvent('🔄', 'Step 7 — Unequipping main hand then re-equipping dirk...');
  logResult(engine.unequipSlot('main_hand'));
  logResult(engine.equipItem('wep_phantom_sidearm'));
  renderViewport(engine.getCurrentState(), '[ FINAL STATE ]');

  console.log(c(ANSI.green + ANSI.bold, '\n════════ SIMULATION COMPLETE ════════\n'));
}

runSimulation();
