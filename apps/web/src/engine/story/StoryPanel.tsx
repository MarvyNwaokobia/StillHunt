'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface DialogueLine {
  speaker?: string;
  text: string;
  speakerColor?: string;
  effect?: 'shake' | 'fade' | 'flash';
}

export interface StoryScene {
  id: string;
  lines: DialogueLine[];
  backgroundClass?: string;
  onComplete?: () => void;
}

interface StoryPanelProps {
  scene: StoryScene;
  onComplete: () => void;
}

export function StoryPanel({ scene, onComplete }: StoryPanelProps) {
  const [lineIndex, setLineIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);

  const currentLine = scene.lines[lineIndex];
  const isLastLine = lineIndex >= scene.lines.length - 1;

  useEffect(() => {
    setLineIndex(0);
    setDisplayedText('');
    setIsTyping(true);
  }, [scene.id]);

  useEffect(() => {
    if (!currentLine) return;

    setDisplayedText('');
    setIsTyping(true);

    let charIdx = 0;
    const text = currentLine.text;
    const speed = 30;

    const interval = setInterval(() => {
      charIdx++;
      setDisplayedText(text.slice(0, charIdx));
      if (charIdx >= text.length) {
        clearInterval(interval);
        setIsTyping(false);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [lineIndex, currentLine]);

  const advance = useCallback(() => {
    if (isTyping) {
      setDisplayedText(currentLine.text);
      setIsTyping(false);
      return;
    }

    if (isLastLine) {
      onComplete();
      return;
    }

    setLineIndex((i) => i + 1);
  }, [isTyping, isLastLine, currentLine, onComplete]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyJ') {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance]);

  if (!currentLine) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-50 flex flex-col justify-end"
      onClick={advance}
      onTouchEnd={advance}
    >
      <div className="absolute inset-0 bg-black/70" />

      <AnimatePresence mode="wait">
        <motion.div
          key={lineIndex}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className={`relative z-10 mx-4 mb-8 md:mx-16 md:mb-16 ${
            currentLine.effect === 'shake' ? 'animate-[shake_0.3s_ease-in-out]' : ''
          }`}
        >
          <div className="rounded-lg border border-white/10 bg-black/80 backdrop-blur-md p-6 md:p-8">
            {currentLine.speaker && (
              <div
                className="text-sm font-bold uppercase tracking-widest mb-2"
                style={{ color: currentLine.speakerColor ?? '#ffffff' }}
              >
                {currentLine.speaker}
              </div>
            )}

            <div className="text-lg md:text-xl text-white/90 leading-relaxed font-light min-h-[3em]">
              {displayedText}
              {isTyping && (
                <span className="inline-block w-0.5 h-5 bg-white/80 ml-0.5 animate-pulse" />
              )}
            </div>

            <div className="mt-4 flex justify-between items-center">
              <span className="text-xs text-white/30">
                {lineIndex + 1} / {scene.lines.length}
              </span>
              <span className="text-xs text-white/40">
                {isTyping ? 'Click to skip' : isLastLine ? 'Click to continue' : 'Click to advance'}
              </span>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
