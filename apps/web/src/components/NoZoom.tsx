'use client';

import { useEffect } from 'react';

/**
 * App-wide zoom lock. The viewport meta already pins scale to 1
 * (maximumScale:1 + userScalable:false), but iOS Safari IGNORES that for pinch, so
 * we also cancel the iOS-only `gesture*` (pinch) events here. This is deliberately
 * gesture-only — it never touches `touchend`/click, so buttons and scrolling keep
 * working everywhere. Double-tap-zoom is handled by `touch-action: manipulation`
 * (in globals.css) + the viewport lock.
 */
export function NoZoom() {
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', prevent, { passive: false });
    document.addEventListener('gesturechange', prevent, { passive: false });
    document.addEventListener('gestureend', prevent, { passive: false });
    return () => {
      document.removeEventListener('gesturestart', prevent);
      document.removeEventListener('gesturechange', prevent);
      document.removeEventListener('gestureend', prevent);
    };
  }, []);
  return null;
}
