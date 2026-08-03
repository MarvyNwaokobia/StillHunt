import { type QualitySettings } from './PerformanceManager';

export interface MobileConfig {
  forceLandscape: boolean;
  reducedParticles: boolean;
  lowerResolution: boolean;
  disablePostProcessing: boolean;
  simplifiedShadows: boolean;
  touchControlsScale: number;
  hapticFeedback: boolean;
}

export class MobileOptimizer {
  private isMobile: boolean;
  private isTablet: boolean;
  private pixelRatio: number;
  private config: MobileConfig;

  constructor() {
    this.isMobile = typeof window !== 'undefined' && /Mobi|Android|iPhone/i.test(navigator.userAgent);
    this.isTablet = typeof window !== 'undefined' && /iPad|Android(?!.*Mobi)/i.test(navigator.userAgent);
    this.pixelRatio = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1;

    this.config = {
      forceLandscape: this.isMobile,
      reducedParticles: this.isMobile,
      lowerResolution: this.isMobile && !this.isTablet,
      disablePostProcessing: this.isMobile && !this.isTablet,
      simplifiedShadows: this.isMobile,
      touchControlsScale: this.isTablet ? 1.2 : 1,
      hapticFeedback: this.isMobile && 'vibrate' in navigator,
    };
  }

  get mobile(): boolean {
    return this.isMobile;
  }

  get tablet(): boolean {
    return this.isTablet;
  }

  get currentConfig(): MobileConfig {
    return { ...this.config };
  }

  getOptimalPixelRatio(): number {
    if (this.isMobile && !this.isTablet) return Math.min(this.pixelRatio, 1.5);
    if (this.isTablet) return Math.min(this.pixelRatio, 2);
    return this.pixelRatio;
  }

  applyToQuality(settings: QualitySettings): QualitySettings {
    if (!this.isMobile) return settings;

    return {
      ...settings,
      shadowMapSize: Math.min(settings.shadowMapSize, this.isTablet ? 1024 : 512),
      shadowsEnabled: this.isTablet,
      particleMultiplier: settings.particleMultiplier * 0.4,
      maxParticles: Math.min(settings.maxParticles, 500),
      postProcessing: this.isTablet,
      bloomEnabled: this.isTablet,
      chromaticAberrationEnabled: false,
      motionBlurEnabled: false,
      trailsEnabled: this.isTablet,
      ambientParticles: this.isTablet,
      drawDistance: Math.min(settings.drawDistance, 30),
    };
  }

  triggerHaptic(type: 'light' | 'medium' | 'heavy') {
    if (!this.config.hapticFeedback || !('vibrate' in navigator)) return;

    switch (type) {
      case 'light':
        navigator.vibrate(10);
        break;
      case 'medium':
        navigator.vibrate(25);
        break;
      case 'heavy':
        navigator.vibrate([30, 10, 50]);
        break;
    }
  }

  shouldShowLandscapePrompt(): boolean {
    if (!this.isMobile || typeof window === 'undefined') return false;
    return window.innerWidth < window.innerHeight;
  }

  getCanvasResolution(): { width: number; height: number } {
    if (typeof window === 'undefined') return { width: 1920, height: 1080 };

    const dpr = this.getOptimalPixelRatio();
    const width = Math.floor(window.innerWidth * dpr);
    const height = Math.floor(window.innerHeight * dpr);

    if (this.isMobile && !this.isTablet) {
      const maxDim = 1280;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        return {
          width: Math.floor(width * scale),
          height: Math.floor(height * scale),
        };
      }
    }

    return { width, height };
  }
}
