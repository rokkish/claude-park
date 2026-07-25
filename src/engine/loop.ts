import { DT, MAX_FRAME_TIME } from "../game/tuning";

/**
 * 固定タイムステップループ (SPEC §2.1)。
 * 物理は常に 1/60 秒で進み、描画は rAF に乗る。
 * 補間は行わない（60Hz 固定で十分滑らかで、実装も単純に保てる）。
 */
export interface LoopHandlers {
  step(dt: number): void;
  render(): void;
}

export class GameLoop {
  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;

  constructor(private readonly handlers: LoopHandlers) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);

    // タブ復帰時に数百ステップを一度に回して固まるのを防ぐ
    const elapsed = Math.min((now - this.lastTime) / 1000, MAX_FRAME_TIME);
    this.lastTime = now;
    this.accumulator += elapsed;

    while (this.accumulator >= DT) {
      this.handlers.step(DT);
      this.accumulator -= DT;
    }

    this.handlers.render();
  };
}
