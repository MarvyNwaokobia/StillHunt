'use client';

import { motion } from 'framer-motion';

interface KeyHint {
  key: string;
  label: string;
  color: string;
  available: boolean;
  cooldownPct?: number;
}

interface MoveInputUIProps {
  hints: KeyHint[];
  show: boolean;
}

export function MoveInputUI({ hints, show }: MoveInputUIProps) {
  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none hidden md:flex gap-3">
      {hints.map((hint) => (
        <motion.div
          key={hint.key}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex flex-col items-center gap-1 ${
            hint.available ? 'opacity-100' : 'opacity-30'
          }`}
        >
          <div
            className="relative w-10 h-10 rounded-lg border flex items-center justify-center text-sm font-mono font-bold"
            style={{
              borderColor: hint.available ? hint.color : '#444',
              color: hint.available ? hint.color : '#666',
              backgroundColor: 'rgba(0,0,0,0.6)',
              boxShadow: hint.available ? `0 0 8px ${hint.color}33` : 'none',
            }}
          >
            {hint.key}

            {hint.cooldownPct !== undefined && hint.cooldownPct > 0 && (
              <div
                className="absolute inset-0 rounded-lg bg-black/60"
                style={{
                  clipPath: `inset(${(1 - hint.cooldownPct) * 100}% 0 0 0)`,
                }}
              />
            )}
          </div>
          <span className="text-[9px] uppercase tracking-wider text-white/40">
            {hint.label}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

export function getDefaultKeyHints(params: {
  specialReady: boolean;
  specialCooldown: number;
  dodgeCooldown: number;
  hasStamina: boolean;
}): KeyHint[] {
  return [
    {
      key: 'J',
      label: 'Light',
      color: '#ff6644',
      available: params.hasStamina,
    },
    {
      key: 'K',
      label: 'Heavy',
      color: '#ff8800',
      available: params.hasStamina,
    },
    {
      key: 'L',
      label: 'Special',
      color: '#aa44ff',
      available: params.specialReady && params.hasStamina,
      cooldownPct: params.specialCooldown,
    },
    {
      key: '⇧',
      label: 'Block',
      color: '#4488ff',
      available: true,
    },
    {
      key: '␣',
      label: 'Dodge',
      color: '#22cc66',
      available: params.hasStamina,
      cooldownPct: params.dodgeCooldown,
    },
    {
      key: '⇥',
      label: 'Lock',
      color: '#888888',
      available: true,
    },
  ];
}
