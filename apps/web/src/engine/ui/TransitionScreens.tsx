'use client';

import { motion } from 'framer-motion';
import type { RewardSummary } from '../story/Progression';

interface FightIntroProps {
  playerName: string;
  playerClass: string;
  enemyName: string;
  enemyClass: string;
  zoneName: string;
  show: boolean;
  onComplete: () => void;
}

const CLASS_COLORS: Record<string, string> = {
  berserker: '#ff4422',
  sentinel: '#4488ff',
  phantom: '#aa44ff',
};

export function FightIntro({
  playerName,
  playerClass,
  enemyName,
  enemyClass,
  zoneName,
  show,
  onComplete,
}: FightIntroProps) {
  if (!show) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onAnimationComplete={() => {
        setTimeout(onComplete, 2500);
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
    >
      <div className="flex items-center gap-8 md:gap-16">
        {/* Player side */}
        <motion.div
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="text-right"
        >
          <div className="text-2xl md:text-4xl font-black text-white">{playerName}</div>
          <div
            className="text-sm uppercase tracking-widest font-bold mt-1"
            style={{ color: CLASS_COLORS[playerClass] }}
          >
            {playerClass}
          </div>
        </motion.div>

        {/* VS */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.6, type: 'spring', stiffness: 200 }}
        >
          <div className="text-4xl md:text-6xl font-black text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.4)]">
            VS
          </div>
        </motion.div>

        {/* Enemy side */}
        <motion.div
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="text-left"
        >
          <div className="text-2xl md:text-4xl font-black text-white">{enemyName}</div>
          <div
            className="text-sm uppercase tracking-widest font-bold mt-1"
            style={{ color: CLASS_COLORS[enemyClass] }}
          >
            {enemyClass}
          </div>
        </motion.div>
      </div>

      {/* Zone name */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="absolute bottom-16 text-center"
      >
        <div className="text-xs uppercase tracking-[0.3em] text-white/30">{zoneName}</div>
      </motion.div>

      {/* FIGHT flash */}
      <motion.div
        initial={{ scale: 3, opacity: 0 }}
        animate={{ scale: 1, opacity: [0, 1, 1, 0] }}
        transition={{ delay: 1.5, duration: 1 }}
        className="absolute text-6xl md:text-8xl font-black text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.5)]"
      >
        FIGHT
      </motion.div>
    </motion.div>
  );
}

interface VictoryScreenProps {
  show: boolean;
  playerName: string;
  playerClass: string;
  rewards: RewardSummary | null;
  onContinue: () => void;
}

export function VictoryScreen({
  show,
  playerName,
  playerClass,
  rewards,
  onContinue,
}: VictoryScreenProps) {
  if (!show) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85"
      onClick={onContinue}
    >
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 150 }}
      >
        <h1
          className="text-5xl md:text-7xl font-black tracking-tight"
          style={{ color: CLASS_COLORS[playerClass] }}
        >
          VICTORY
        </h1>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="text-lg text-white/60 mt-2"
      >
        {playerName} wins
      </motion.div>

      {rewards && (
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="mt-8 bg-black/60 border border-white/10 rounded-lg p-6 min-w-[280px]"
        >
          <div className="flex justify-between text-sm mb-3">
            <span className="text-white/50">XP Earned</span>
            <span className="text-yellow-400 font-bold">+{rewards.xpGained}</span>
          </div>
          <div className="flex justify-between text-sm mb-3">
            <span className="text-white/50">Gold Earned</span>
            <span className="text-amber-400 font-bold">+{rewards.goldGained}</span>
          </div>

          {rewards.bonuses.map((bonus, i) => (
            <motion.div
              key={bonus.label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1 + i * 0.15 }}
              className="flex justify-between text-sm mb-2"
            >
              <span className="text-green-400">{bonus.label}</span>
              <span className="text-green-300 font-bold">+{bonus.value}</span>
            </motion.div>
          ))}

          {rewards.leveledUp && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 1.5, type: 'spring' }}
              className="mt-4 text-center py-2 rounded bg-yellow-500/20 border border-yellow-500/30"
            >
              <span className="text-yellow-400 font-bold text-lg">
                LEVEL UP! → Lv.{rewards.newLevel}
              </span>
            </motion.div>
          )}

          {rewards.unlocks.length > 0 && (
            <div className="mt-3 space-y-1">
              {rewards.unlocks.map((unlock) => (
                <motion.div
                  key={unlock}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.8 }}
                  className="text-xs text-purple-400"
                >
                  ★ {unlock}
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="mt-8 text-xs text-white/30"
      >
        Tap to continue
      </motion.div>
    </motion.div>
  );
}

interface DefeatScreenProps {
  show: boolean;
  enemyName: string;
  onRetry: () => void;
  onQuit: () => void;
}

export function DefeatScreen({ show, enemyName, onRetry, onQuit }: DefeatScreenProps) {
  if (!show) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90"
    >
      <motion.h1
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-5xl md:text-7xl font-black text-red-500"
      >
        DEFEATED
      </motion.h1>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-white/40 mt-2"
      >
        Slain by {enemyName}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1 }}
        className="mt-10 flex gap-4 pointer-events-auto"
      >
        <button
          onClick={onRetry}
          className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-colors"
        >
          RETRY
        </button>
        <button
          onClick={onQuit}
          className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white/60 font-bold rounded-lg transition-colors"
        >
          QUIT
        </button>
      </motion.div>
    </motion.div>
  );
}
