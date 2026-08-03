'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ChapterIntroProps {
  zoneNumber: number;
  zoneName: string;
  tagline: string;
  onComplete: () => void;
}

export function ChapterIntro({ zoneNumber, zoneName, tagline, onComplete }: ChapterIntroProps) {
  const [phase, setPhase] = useState<'title' | 'tagline' | 'ready'>('title');

  const advance = () => {
    if (phase === 'title')   setPhase('tagline');
    else if (phase === 'tagline') setPhase('ready');
    else onComplete();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black"
      onClick={advance}
    >
      <AnimatePresence mode="wait">
        {phase === 'title' && (
          <motion.div
            key="title"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-sm uppercase tracking-[0.3em] text-white/40 mb-4"
            >
              Zone {zoneNumber}
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.8 }}
              className="text-5xl md:text-7xl font-bold text-white tracking-tight"
            >
              {zoneName}
            </motion.h1>
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 1.2, duration: 0.6 }}
              className="mt-6 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent mx-auto w-64"
            />
          </motion.div>
        )}

        {phase === 'tagline' && (
          <motion.div
            key="tagline"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center max-w-lg px-8"
          >
            <p className="text-lg md:text-xl text-white/70 leading-relaxed font-light italic">
              &quot;{tagline}&quot;
            </p>
          </motion.div>
        )}

        {phase === 'ready' && (
          <motion.div
            key="ready"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="text-center"
          >
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="text-2xl text-white font-bold tracking-wide"
            >
              READY
            </motion.div>
            <div className="text-sm text-white/30 mt-4">Tap to begin</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
