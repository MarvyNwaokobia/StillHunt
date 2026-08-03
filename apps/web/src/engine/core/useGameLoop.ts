import { useEffect, useRef } from 'react';
import { GameLoop, getGameLoop, type UpdateCallback } from './GameLoop';

export function useGameLoop(
  fixedUpdate?: UpdateCallback,
  frameUpdate?: UpdateCallback
): GameLoop {
  const loop = useRef(getGameLoop()).current;
  const fixedRef = useRef(fixedUpdate);
  const frameRef = useRef(frameUpdate);

  fixedRef.current = fixedUpdate;
  frameRef.current = frameUpdate;

  useEffect(() => {
    loop.onFixedUpdate((dt, realDt, t) => fixedRef.current?.(dt, realDt, t));
    loop.onFrameUpdate((dt, realDt, t) => frameRef.current?.(dt, realDt, t));
    loop.start();
    return () => loop.stop();
  }, [loop]);

  return loop;
}
