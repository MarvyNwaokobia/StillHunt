'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { CharacterState } from '../character';
import type { FighterStats } from '../combat/DamageSystem';
import type { ComboState } from '../combat/ComboSystem';

interface HealthBarProps {
  current: number;
  max: number;
  label: string;
  side: 'left' | 'right';
  classColor: string;
  showDamage?: number;
}

function HealthBar({ current, max, label, side, classColor, showDamage }: HealthBarProps) {
  const pct = Math.max(0, (current / max) * 100);
  const isLow = pct < 25;
  const isCritical = pct < 10;

  return (
    <div className={`flex flex-col ${side === 'right' ? 'items-end' : 'items-start'}`}>
      <div className="flex items-center gap-2 mb-1">
        {side === 'left' && (
          <span className="text-xs font-bold uppercase tracking-wider text-white/80">{label}</span>
        )}
        <span className={`text-xs font-mono ${isLow ? 'text-red-400' : 'text-white/60'}`}>
          {current}/{max}
        </span>
        {side === 'right' && (
          <span className="text-xs font-bold uppercase tracking-wider text-white/80">{label}</span>
        )}
      </div>

      <div className="relative w-48 md:w-64 h-4 rounded-sm overflow-hidden bg-black/60 border border-white/10">
        <motion.div
          className="absolute inset-y-0 rounded-sm"
          style={{
            [side === 'left' ? 'left' : 'right']: 0,
            backgroundColor: isCritical ? '#ef4444' : isLow ? '#f59e0b' : classColor,
            boxShadow: isLow ? `0 0 8px ${isCritical ? '#ef4444' : '#f59e0b'}` : 'none',
          }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        />

        {isCritical && (
          <motion.div
            className="absolute inset-0 rounded-sm bg-red-500/20"
            animate={{ opacity: [0.2, 0.5, 0.2] }}
            transition={{ repeat: Infinity, duration: 0.8 }}
          />
        )}
      </div>

      <AnimatePresence>
        {showDamage && showDamage > 0 && (
          <motion.span
            key={`dmg-${Date.now()}`}
            initial={{ opacity: 1, y: 0 }}
            animate={{ opacity: 0, y: -20 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="text-sm font-bold text-red-400 mt-1"
          >
            -{showDamage}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

interface StaminaBarProps {
  current: number;
  max: number;
}

function StaminaBar({ current, max }: StaminaBarProps) {
  const pct = (current / max) * 100;
  const isLow = pct < 20;

  return (
    <div className="w-32 md:w-48 h-2 rounded-full overflow-hidden bg-black/40 border border-white/5">
      <motion.div
        className="h-full rounded-full"
        style={{
          backgroundColor: isLow ? '#f59e0b' : '#22c55e',
        }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.15 }}
      />
    </div>
  );
}

interface ComboDisplayProps {
  combo: ComboState | null;
}

function ComboDisplay({ combo }: ComboDisplayProps) {
  if (!combo || combo.count < 2) return null;

  const size = combo.count >= 10 ? 'text-5xl' : combo.count >= 5 ? 'text-4xl' : 'text-3xl';

  return (
    <motion.div
      key={combo.count}
      initial={{ scale: 1.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="fixed top-1/3 right-8 md:right-16 text-center pointer-events-none z-30"
    >
      <div className={`${size} font-black text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]`}>
        {combo.count}
      </div>
      <div className="text-sm font-bold uppercase tracking-widest text-yellow-300/80 mt-1">
        HIT COMBO
      </div>
      {combo.damageMultiplier > 1.1 && (
        <div className="text-xs text-orange-400 mt-0.5">
          ×{combo.damageMultiplier.toFixed(1)} DMG
        </div>
      )}
    </motion.div>
  );
}

interface SpecialMeterProps {
  value: number;
  max: number;
  ready: boolean;
  classColor: string;
}

function SpecialMeter({ value, max, ready, classColor }: SpecialMeterProps) {
  const pct = (value / max) * 100;

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-white/40">SP</span>
      <div className="w-24 md:w-32 h-2.5 rounded-full overflow-hidden bg-black/40 border border-white/10">
        <motion.div
          className="h-full rounded-full"
          style={{
            backgroundColor: ready ? classColor : '#666',
            boxShadow: ready ? `0 0 8px ${classColor}` : 'none',
          }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.2 }}
        />
      </div>
      {ready && (
        <motion.span
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1.2 }}
          className="text-[10px] font-bold uppercase"
          style={{ color: classColor }}
        >
          READY
        </motion.span>
      )}
    </div>
  );
}

interface BattleHUDProps {
  playerState: CharacterState;
  playerStats: FighterStats | null;
  playerClass: string;
  playerName: string;
  enemyState: CharacterState;
  enemyStats: FighterStats | null;
  enemyClass: string;
  enemyName: string;
  combo: ComboState | null;
  specialMeter: number;
  specialMax: number;
  specialReady: boolean;
  waveInfo?: { current: number; total: number };
  zoneName?: string;
}

const CLASS_COLORS: Record<string, string> = {
  berserker: '#ff4422',
  sentinel: '#4488ff',
  phantom: '#aa44ff',
};

export function BattleHUD({
  playerState,
  playerStats,
  playerClass,
  playerName,
  enemyState,
  enemyStats: _enemyStats,
  enemyClass,
  enemyName,
  combo,
  specialMeter,
  specialMax,
  specialReady,
  waveInfo,
  zoneName,
}: BattleHUDProps) {
  return (
    <div className="fixed inset-0 pointer-events-none z-30">
      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 p-3 md:p-5 flex justify-between items-start">
        {/* Player HP — left */}
        <div>
          <HealthBar
            current={playerState.health}
            max={playerState.maxHealth}
            label={playerName}
            side="left"
            classColor={CLASS_COLORS[playerClass] ?? '#ffffff'}
          />
          {playerStats && (
            <div className="mt-1.5">
              <StaminaBar current={playerStats.stamina} max={playerStats.staminaMax} />
            </div>
          )}
          <div className="mt-1.5">
            <SpecialMeter
              value={specialMeter}
              max={specialMax}
              ready={specialReady}
              classColor={CLASS_COLORS[playerClass] ?? '#ffffff'}
            />
          </div>
        </div>

        {/* Zone / Wave info — center */}
        <div className="text-center">
          {zoneName && (
            <div className="text-xs uppercase tracking-widest text-white/30 mb-1">
              {zoneName}
            </div>
          )}
          {waveInfo && (
            <div className="text-xs text-white/40">
              Wave {waveInfo.current}/{waveInfo.total}
            </div>
          )}
        </div>

        {/* Enemy HP — right */}
        <HealthBar
          current={enemyState.health}
          max={enemyState.maxHealth}
          label={enemyName}
          side="right"
          classColor={CLASS_COLORS[enemyClass] ?? '#ff4444'}
        />
      </div>

      {/* Combo display */}
      <ComboDisplay combo={combo} />
    </div>
  );
}
