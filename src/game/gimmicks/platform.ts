import { PALETTE } from "../../art/palette";
import type { AABB } from "../../engine/aabb";
import type { Renderer } from "../../engine/renderer";
import { evaluateSignals } from "../signals";
import type { SignalMode } from "../signals";
import type { Gimmick, GimmickContext, GimmickDef, GimmickParams, SpawnContext } from "./types";

/**
 * 動く足場 (World 2 のキーアイデア)。
 *
 * x/y を始点、to を終点とする直線上を往復する。
 * - listen を指定すると「信号が立っている間だけ終点へ、離すと始点へ戻る」
 * - listen が無ければ常に往復し続ける
 *
 * 逆位相（1つの信号で2つの足場を逆向きに動かす）は、専用オプションを
 * 足さずに from と to を入れ替えるだけで表現できる。
 */
export interface PlatformParams extends GimmickParams {
  w?: number;
  h?: number;
  /** 終点（タイル座標）。 */
  to: { x: number; y: number };
  /** 移動速度 (px/s)。走行速度 160 の半分くらいが足場らしい。 */
  speed?: number;
  listen?: string[];
  mode?: SignalMode;
}

const DEFAULT_SPEED = 80;

class Platform implements Gimmick {
  readonly type = "platform";
  readonly aabb: AABB;

  private readonly from: { x: number; y: number };
  private readonly to: { x: number; y: number };
  private readonly speed: number;
  private readonly listen: string[];
  private readonly mode: SignalMode;
  /** 始点からの進捗 0..1。位置はここから毎回引き直す（誤差を溜めないため）。 */
  private t = 0;
  /** 信号を使わない往復の向き。 */
  private dir: 1 | -1 = 1;
  /** 直前の update で動いた整数 px。物理へはこれを申告する。 */
  private dx = 0;
  private dy = 0;

  constructor(params: PlatformParams, ctx: SpawnContext) {
    // to が無いと座標が NaN になり、足場が消えたように見えるだけで
    // 原因が分からない。registry と同じくロード時に落とす。
    if (typeof params.to?.x !== "number" || typeof params.to?.y !== "number") {
      throw new Error(`platform(${params.x},${params.y}): to は {x, y} が必須です`);
    }
    const ts = ctx.tileSize;
    this.from = { x: params.x * ts, y: params.y * ts };
    this.to = { x: params.to.x * ts, y: params.to.y * ts };
    this.aabb = {
      x: this.from.x,
      y: this.from.y,
      w: (params.w ?? 1) * ts,
      h: (params.h ?? 1) * ts,
    };
    this.speed = params.speed ?? DEFAULT_SPEED;
    this.listen = params.listen ?? [];
    this.mode = params.mode ?? "all";
  }

  update(dt: number, ctx: GimmickContext): void {
    const spanX = this.to.x - this.from.x;
    const spanY = this.to.y - this.from.y;
    const length = Math.hypot(spanX, spanY);
    if (length === 0) {
      this.dx = 0;
      this.dy = 0;
      return;
    }

    // 進捗は「距離ぶんの割合」で進める。斜めでも速度が一定になる。
    const step = (this.speed * dt) / length;

    if (this.listen.length > 0) {
      const on = evaluateSignals(ctx.signals, this.listen, this.mode);
      this.t = clamp01(this.t + (on ? step : -step));
    } else {
      this.t += step * this.dir;
      if (this.t >= 1) {
        this.t = 1;
        this.dir = -1;
      } else if (this.t <= 0) {
        this.t = 0;
        this.dir = 1;
      }
    }

    // 位置は必ず整数に丸める。乗員判定が bottom === top の厳密一致なので、
    // 小数のままだと足場の上に立てなくなる。
    const nx = Math.round(this.from.x + spanX * this.t);
    const ny = Math.round(this.from.y + spanY * this.t);
    this.dx = nx - this.aabb.x;
    this.dy = ny - this.aabb.y;
    this.aabb.x = nx;
    this.aabb.y = ny;
  }

  solidAABB(): AABB {
    return this.aabb;
  }

  solidDelta(): { dx: number; dy: number } {
    return { dx: this.dx, dy: this.dy };
  }

  draw(r: Renderer): void {
    const { x, y, w, h } = this.aabb;
    // 地形より明るくして「動くもの」だと分かるようにする。
    r.rect(x, y, w, h, PALETTE.tileTop);
    r.rect(x, y, w, 4, PALETTE.textDim);
  }

  reset(): void {
    this.t = 0;
    this.dir = 1;
    this.aabb.x = this.from.x;
    this.aabb.y = this.from.y;
    // リセットは瞬間移動なので搬送を起こさない。dx/dy を残すと
    // 乗っていたプレイヤーが一緒に飛ばされる。
    this.dx = 0;
    this.dy = 0;
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export const platformDef: GimmickDef<PlatformParams> = {
  type: "platform",
  create(params, ctx) {
    return new Platform(params, ctx);
  },
};
