export enum QualityLevel {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Ultra = 'ultra',
}

export interface QualitySettings {
  shadowMapSize: number;
  shadowsEnabled: boolean;
  particleMultiplier: number;
  maxParticles: number;
  postProcessing: boolean;
  bloomEnabled: boolean;
  chromaticAberrationEnabled: boolean;
  motionBlurEnabled: boolean;
  antialiasing: boolean;
  trailsEnabled: boolean;
  ambientParticles: boolean;
  textureQuality: number;
  drawDistance: number;
}

const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  [QualityLevel.Low]: {
    shadowMapSize: 512,
    shadowsEnabled: false,
    particleMultiplier: 0.3,
    maxParticles: 500,
    postProcessing: false,
    bloomEnabled: false,
    chromaticAberrationEnabled: false,
    motionBlurEnabled: false,
    antialiasing: false,
    trailsEnabled: false,
    ambientParticles: false,
    textureQuality: 0.5,
    drawDistance: 30,
  },
  [QualityLevel.Medium]: {
    shadowMapSize: 1024,
    shadowsEnabled: true,
    particleMultiplier: 0.6,
    maxParticles: 1000,
    postProcessing: true,
    bloomEnabled: true,
    chromaticAberrationEnabled: true,
    motionBlurEnabled: false,
    antialiasing: true,
    trailsEnabled: true,
    ambientParticles: true,
    textureQuality: 0.75,
    drawDistance: 40,
  },
  [QualityLevel.High]: {
    shadowMapSize: 2048,
    shadowsEnabled: true,
    particleMultiplier: 1,
    maxParticles: 2000,
    postProcessing: true,
    bloomEnabled: true,
    chromaticAberrationEnabled: true,
    motionBlurEnabled: true,
    antialiasing: true,
    trailsEnabled: true,
    ambientParticles: true,
    textureQuality: 1,
    drawDistance: 50,
  },
  [QualityLevel.Ultra]: {
    shadowMapSize: 4096,
    shadowsEnabled: true,
    particleMultiplier: 1.5,
    maxParticles: 3000,
    postProcessing: true,
    bloomEnabled: true,
    chromaticAberrationEnabled: true,
    motionBlurEnabled: true,
    antialiasing: true,
    trailsEnabled: true,
    ambientParticles: true,
    textureQuality: 1,
    drawDistance: 60,
  },
};

export class PerformanceManager {
  private quality: QualityLevel;
  private settings: QualitySettings;
  private fpsSamples: number[] = [];
  private lastFrameTime = 0;
  private autoAdjust = true;
  private onSettingsChange?: (settings: QualitySettings) => void;

  constructor(initialQuality?: QualityLevel) {
    this.quality = initialQuality ?? this.detectQuality();
    this.settings = { ...QUALITY_PRESETS[this.quality] };
  }

  get current(): QualitySettings {
    return { ...this.settings };
  }

  get currentLevel(): QualityLevel {
    return this.quality;
  }

  setOnSettingsChange(cb: (settings: QualitySettings) => void) {
    this.onSettingsChange = cb;
  }

  setQuality(level: QualityLevel) {
    this.quality = level;
    this.settings = { ...QUALITY_PRESETS[level] };
    this.autoAdjust = false;
    this.onSettingsChange?.(this.settings);
  }

  setAutoAdjust(enabled: boolean) {
    this.autoAdjust = enabled;
  }

  recordFrame() {
    const now = performance.now();
    if (this.lastFrameTime > 0) {
      const dt = now - this.lastFrameTime;
      const fps = 1000 / dt;
      this.fpsSamples.push(fps);

      if (this.fpsSamples.length > 60) {
        this.fpsSamples.shift();
      }

      if (this.autoAdjust && this.fpsSamples.length >= 60) {
        this.adjustQuality();
      }
    }
    this.lastFrameTime = now;
  }

  get averageFPS(): number {
    if (this.fpsSamples.length === 0) return 60;
    return this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
  }

  get isGPUBound(): boolean {
    return this.averageFPS < 30;
  }

  private adjustQuality() {
    const avg = this.averageFPS;
    const levels = [QualityLevel.Low, QualityLevel.Medium, QualityLevel.High, QualityLevel.Ultra];
    const currentIdx = levels.indexOf(this.quality);

    if (avg < 25 && currentIdx > 0) {
      this.setQualityInternal(levels[currentIdx - 1]);
    } else if (avg > 55 && currentIdx < levels.length - 1) {
      this.setQualityInternal(levels[currentIdx + 1]);
    }
  }

  private setQualityInternal(level: QualityLevel) {
    if (level === this.quality) return;
    this.quality = level;
    this.settings = { ...QUALITY_PRESETS[level] };
    this.fpsSamples = [];
    this.onSettingsChange?.(this.settings);
  }

  private detectQuality(): QualityLevel {
    if (typeof window === 'undefined') return QualityLevel.Medium;

    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return QualityLevel.Low;


    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    const cores = navigator.hardwareConcurrency ?? 2;
    const memory = (navigator as any).deviceMemory ?? 4;

    if (isMobile) {
      return memory >= 6 ? QualityLevel.Medium : QualityLevel.Low;
    }

    if (cores >= 8 && memory >= 8) return QualityLevel.High;
    if (cores >= 4) return QualityLevel.Medium;
    return QualityLevel.Low;
  }
}
