export type UpdateCallback = (dt: number, realDt: number, elapsed: number) => void;

const FIXED_TIMESTEP = 1 / 60;
const MAX_FRAME_SKIP = 5;

export class GameLoop {
  private rafId: number | null = null;
  private lastTime = 0;
  private accumulator = 0;
  private elapsed = 0;
  private running = false;

  private fixedUpdate: UpdateCallback | null = null;
  private frameUpdate: UpdateCallback | null = null;

  onFixedUpdate(cb: UpdateCallback) {
    this.fixedUpdate = cb;
  }

  onFrameUpdate(cb: UpdateCallback) {
    this.frameUpdate = cb;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.tick(this.lastTime);
  }

  stop() {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  get isRunning() {
    return this.running;
  }

  get timeScale() {
    return this._timeScale;
  }

  set timeScale(v: number) {
    this._timeScale = Math.max(0, v);
  }

  private _timeScale = 1;

  private tick = (now: number) => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    const rawDt = Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;

    const dt = rawDt * this._timeScale;
    this.accumulator += dt;

    let steps = 0;
    while (this.accumulator >= FIXED_TIMESTEP && steps < MAX_FRAME_SKIP) {
      this.fixedUpdate?.(FIXED_TIMESTEP, rawDt, this.elapsed);
      this.accumulator -= FIXED_TIMESTEP;
      this.elapsed += FIXED_TIMESTEP;
      steps++;
    }

    this.frameUpdate?.(dt, rawDt, this.elapsed);
  };
}

let instance: GameLoop | null = null;

export function getGameLoop(): GameLoop {
  if (!instance) instance = new GameLoop();
  return instance;
}
