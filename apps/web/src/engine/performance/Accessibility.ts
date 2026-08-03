export enum ColorblindMode {
  None = 'none',
  Protanopia = 'protanopia',
  Deuteranopia = 'deuteranopia',
  Tritanopia = 'tritanopia',
}

export interface AccessibilitySettings {
  reducedMotion: boolean;
  colorblindMode: ColorblindMode;
  screenShakeIntensity: number;
  flashIntensity: number;
  hitStopEnabled: boolean;
  slowMotionEnabled: boolean;
  subtitlesEnabled: boolean;
  fontSize: number;
  highContrast: boolean;
  autoBlock: boolean;
}

const DEFAULT_ACCESSIBILITY: AccessibilitySettings = {
  reducedMotion: false,
  colorblindMode: ColorblindMode.None,
  screenShakeIntensity: 1,
  flashIntensity: 1,
  hitStopEnabled: true,
  slowMotionEnabled: true,
  subtitlesEnabled: true,
  fontSize: 1,
  highContrast: false,
  autoBlock: false,
};

const COLORBLIND_MAPS: Record<ColorblindMode, Record<string, string>> = {
  [ColorblindMode.None]: {},
  [ColorblindMode.Protanopia]: {
    '#ff4422': '#ddaa00',
    '#22cc66': '#4488ff',
    '#ff6644': '#ddaa00',
    '#ef4444': '#ddaa00',
  },
  [ColorblindMode.Deuteranopia]: {
    '#ff4422': '#ff8800',
    '#22cc66': '#4488ff',
    '#ff6644': '#ff8800',
    '#22c55e': '#6688ff',
  },
  [ColorblindMode.Tritanopia]: {
    '#4488ff': '#ff6688',
    '#aa44ff': '#ff4466',
    '#6644ff': '#ff6688',
    '#2244ff': '#ff4466',
  },
};

export class Accessibility {
  private settings: AccessibilitySettings;
  private onChange?: (settings: AccessibilitySettings) => void;

  constructor() {
    this.settings = { ...DEFAULT_ACCESSIBILITY };
    this.detectSystemPreferences();
  }

  get current(): AccessibilitySettings {
    return { ...this.settings };
  }

  setOnChange(cb: (settings: AccessibilitySettings) => void) {
    this.onChange = cb;
  }

  update(partial: Partial<AccessibilitySettings>) {
    this.settings = { ...this.settings, ...partial };
    this.onChange?.(this.settings);
  }

  remapColor(color: string): string {
    const map = COLORBLIND_MAPS[this.settings.colorblindMode];
    return map[color] ?? color;
  }

  getShakeMultiplier(): number {
    if (this.settings.reducedMotion) return 0;
    return this.settings.screenShakeIntensity;
  }

  getFlashMultiplier(): number {
    if (this.settings.reducedMotion) return 0;
    return this.settings.flashIntensity;
  }

  shouldHitStop(): boolean {
    return this.settings.hitStopEnabled && !this.settings.reducedMotion;
  }

  shouldSlowMo(): boolean {
    return this.settings.slowMotionEnabled && !this.settings.reducedMotion;
  }

  save(): string {
    return JSON.stringify(this.settings);
  }

  load(data: string) {
    try {
      const parsed = JSON.parse(data);
      this.settings = { ...DEFAULT_ACCESSIBILITY, ...parsed };
      this.onChange?.(this.settings);
    } catch {
      // keep defaults
    }
  }

  private detectSystemPreferences() {
    if (typeof window === 'undefined') return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (prefersReduced.matches) {
      this.settings.reducedMotion = true;
      this.settings.screenShakeIntensity = 0;
      this.settings.flashIntensity = 0;
      this.settings.hitStopEnabled = false;
      this.settings.slowMotionEnabled = false;
    }

    const prefersContrast = window.matchMedia('(prefers-contrast: more)');
    if (prefersContrast.matches) {
      this.settings.highContrast = true;
    }
  }
}
