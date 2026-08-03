export interface CombatTimings {
  hitStop: {
    light: number;
    heavy: number;
    special: number;
    kill: number;
    block: number;
  };
  screenShake: {
    lightIntensity: number;
    heavyIntensity: number;
    specialIntensity: number;
    killIntensity: number;
    blockIntensity: number;
    decayRate: number;
  };
  cameraPunch: {
    heavyScale: number;
    specialScale: number;
    killScale: number;
    duration: number;
  };
  slowMotion: {
    killTimeScale: number;
    killDuration: number;
  };
  knockback: {
    lightSlide: number;
    heavySlide: number;
    specialSlide: number;
    friction: number;
    bounceCount: number;
    bounceDamping: number;
  };
  particles: {
    lightCount: number;
    heavyCount: number;
    specialCount: number;
    killBurstCount: number;
    sparkLifetime: number;
    bloodLifetime: number;
  };
  audio: {
    bassPitchLight: number;
    bassPitchHeavy: number;
    bassPitchSpecial: number;
    bassPitchKill: number;
    pitchVariation: number;
    comboPitchScale: number;
  };
  flash: {
    lightDuration: number;
    heavyDuration: number;
    specialDuration: number;
    killDuration: number;
    lightOpacity: number;
    heavyOpacity: number;
    specialOpacity: number;
  };
  chromaticAberration: {
    lightIntensity: number;
    heavyIntensity: number;
    specialIntensity: number;
    killIntensity: number;
    duration: number;
  };
}

export const DEFAULT_TUNING: CombatTimings = {
  hitStop: {
    light: 0.05,
    heavy: 0.1,
    special: 0.15,
    kill: 0.4,
    block: 0.03,
  },
  screenShake: {
    lightIntensity: 0.08,
    heavyIntensity: 0.2,
    specialIntensity: 0.35,
    killIntensity: 0.5,
    blockIntensity: 0.05,
    decayRate: 8,
  },
  cameraPunch: {
    heavyScale: 1.06,
    specialScale: 1.1,
    killScale: 1.15,
    duration: 0.4,
  },
  slowMotion: {
    killTimeScale: 0.2,
    killDuration: 1.5,
  },
  knockback: {
    lightSlide: 0.15,
    heavySlide: 0.3,
    specialSlide: 0.5,
    friction: 8,
    bounceCount: 2,
    bounceDamping: 0.4,
  },
  particles: {
    lightCount: 8,
    heavyCount: 16,
    specialCount: 25,
    killBurstCount: 72,
    sparkLifetime: 0.4,
    bloodLifetime: 0.8,
  },
  audio: {
    bassPitchLight: 60,
    bassPitchHeavy: 45,
    bassPitchSpecial: 35,
    bassPitchKill: 25,
    pitchVariation: 0.12,
    comboPitchScale: 0.08,
  },
  flash: {
    lightDuration: 0.04,
    heavyDuration: 0.06,
    specialDuration: 0.08,
    killDuration: 0.3,
    lightOpacity: 0.3,
    heavyOpacity: 0.6,
    specialOpacity: 0.8,
  },
  chromaticAberration: {
    lightIntensity: 0.003,
    heavyIntensity: 0.008,
    specialIntensity: 0.015,
    killIntensity: 0.025,
    duration: 0.15,
  },
};

export function createTuning(overrides: Partial<CombatTimings> = {}): CombatTimings {
  return deepMerge(DEFAULT_TUNING, overrides) as CombatTimings;
}

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] ?? {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
