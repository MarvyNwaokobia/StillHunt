import type { GameLoop } from '../core/GameLoop';
import type { BattleCamera } from '../camera/BattleCamera';
import type { AnimationStateMachine } from '../animation/AnimationStateMachine';
import type { ScreenEffects } from './ScreenEffects';
import type { ParticleSystem } from './ParticleSystem';
import type { DamageEvent } from '../combat/DamageSystem';

export interface HitStopConfig {
  light: number;
  heavy: number;
  special: number;
  kill: number;
}

const DEFAULT_HITSTOP: HitStopConfig = {
  light: 0.05,
  heavy: 0.1,
  special: 0.15,
  kill: 0.4,
};

export class CombatFeel {
  private gameLoop: GameLoop;
  private camera: BattleCamera;
  private screenFx: ScreenEffects;
  private particles: ParticleSystem;
  private animMachines: Map<string, AnimationStateMachine> = new Map();

  private freeze = 0;
  private slowmo = 0;
  private slowMoScale = 1;
  private wasFrozen = false;
  private hitStopConfig: HitStopConfig;

  constructor(
    gameLoop: GameLoop,
    camera: BattleCamera,
    screenFx: ScreenEffects,
    particles: ParticleSystem,
    hitStopConfig?: Partial<HitStopConfig>
  ) {
    this.gameLoop = gameLoop;
    this.camera = camera;
    this.screenFx = screenFx;
    this.particles = particles;
    this.hitStopConfig = { ...DEFAULT_HITSTOP, ...hitStopConfig };
  }

  registerAnimMachine(id: string, machine: AnimationStateMachine) {
    this.animMachines.set(id, machine);
  }

  onDamageEvent(event: DamageEvent) {
    if (event.blocked) {
      this.onBlock(event);
      return;
    }

    if (event.killed) {
      this.onKill(event);
      return;
    }

    switch (event.hitType) {
      case 'light':
        this.onLightHit(event);
        break;
      case 'heavy':
        this.onHeavyHit(event);
        break;
      case 'special':
        this.onSpecialHit(event);
        break;
    }
  }

  private onLightHit(event: DamageEvent) {
    this.hitStop(this.hitStopConfig.light);

    this.camera.shake(0.08, 35);

    this.screenFx.onLightHit();

    this.particles.emitImpact(
      event.hitPosition,
      event.knockbackDir,
      'light'
    );
  }

  private onHeavyHit(event: DamageEvent) {
    this.hitStop(this.hitStopConfig.heavy);

    this.camera.shake(0.2, 28);
    this.camera.punch(0.06);

    this.screenFx.onHeavyHit();

    this.particles.emitImpact(
      event.hitPosition,
      event.knockbackDir,
      'heavy'
    );

    if (event.critical) {
      this.screenFx.onCriticalHit();
      this.camera.shake(0.35, 25);
    }
  }

  private onSpecialHit(event: DamageEvent) {
    this.hitStop(this.hitStopConfig.special);

    this.camera.shake(0.35, 22);
    this.camera.punch(0.1);

    this.screenFx.onSpecialHit();

    this.particles.emitImpact(
      event.hitPosition,
      event.knockbackDir,
      'special'
    );
  }

  private onKill(event: DamageEvent) {
    const classColors: Record<string, string> = {
      berserker: '#ff4422',
      sentinel: '#4488ff',
      phantom: '#aa44ff',
    };
    const color = classColors[event.attackerId] ?? '#ffffff';

    this.hitStop(this.hitStopConfig.kill);
    this.startSlowMo(0.2, 1.5);

    this.camera.shake(0.5, 18);
    this.camera.punch(0.15);
    this.camera.setSlowMoFov(-8);

    this.screenFx.onKill(color);

    this.particles.emitKillBurst(event.hitPosition, color);
    this.particles.emitImpact(
      event.hitPosition,
      event.knockbackDir,
      'special'
    );
  }

  private onBlock(event: DamageEvent) {
    this.hitStop(0.03);

    this.camera.shake(0.05, 40);

    this.screenFx.onBlock();

    this.particles.emitSparks(
      event.hitPosition,
      event.knockbackDir,
      0.3
    );
  }

  private hitStop(duration: number) {
    this.freeze = Math.max(this.freeze, duration);
  }

  private startSlowMo(scale: number, duration: number) {
    this.slowMoScale = scale;
    this.slowmo = duration;
  }

  update(realDt: number) {
    if (this.freeze > 0) {
      this.freeze -= realDt;
      this.gameLoop.timeScale = 0;
    } else if (this.slowmo > 0) {
      this.slowmo -= realDt;
      this.gameLoop.timeScale = this.slowMoScale;
      if (this.slowmo <= 0) {
        this.slowMoScale = 1;
        this.gameLoop.timeScale = 1;
        this.camera.setSlowMoFov(0);
      }
    } else {
      this.gameLoop.timeScale = 1;
    }

    const frozen = this.freeze > 0;
    if (frozen !== this.wasFrozen) {
      for (const m of this.animMachines.values()) {
        if (frozen) m.pause(); else m.resume();
      }
      this.wasFrozen = frozen;
    }

    this.screenFx.update(realDt);
    this.particles.update(realDt);
  }
}
