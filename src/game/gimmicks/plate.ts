import { PALETTE } from "../../art/palette";
import type { AABB } from "../../engine/aabb";
import type { Renderer } from "../../engine/renderer";
import type { OverlapSource } from "../entities";
import type { Gimmick, GimmickContext, GimmickDef, GimmickParams, SpawnContext } from "./types";

/** 感圧板 (SPEC §7.3)。誰かが乗っている間、毎フレーム emit チャンネルを ON にする。 */
export interface PlateParams extends GimmickParams {
  w?: number;
  h?: number;
  emit: string;
}

/** 板の見た目・当たり判定の厚み(px)。タイル底に張り付く薄いパッドにする。 */
const PAD_H = 6;

class Plate implements Gimmick {
  readonly type = "plate";
  readonly aabb: AABB;
  private readonly emit: string;
  /** このフレーム押されているか。draw() のためだけの状態で、シグナルの真偽源ではない。 */
  private pressed = false;

  constructor(params: PlateParams, ctx: SpawnContext) {
    const ts = ctx.tileSize;
    const w = params.w ?? 1;
    const h = params.h ?? 1;
    // タイルセルの底に薄いパッドとして置く。1つ上のタイル行に立った
    // プレイヤーの足元とちょうど重なる高さにする。
    this.aabb = {
      x: params.x * ts,
      y: params.y * ts + h * ts - PAD_H,
      w: w * ts,
      h: PAD_H,
    };
    this.emit = params.emit;
  }

  update(_dt: number, _ctx: GimmickContext): void {
    // SPEC §5.3: update() は onOverlap() より先に走る。ここで毎フレーム
    // 「押されていない」状態にリセットし、onOverlap が来たときだけ true にする。
    // signals 自体は SignalBus 側で clearFrame() されるので、ここでは
    // 描画用フラグをリセットするだけでよい（ラッチしない = 毎フレーム assert）。
    this.pressed = false;
  }

  // 重さがあれば人でも箱でもよい。ここが World 3 の「道具が人の代わりをする」の要。
  onOverlap(_source: OverlapSource, ctx: GimmickContext): void {
    this.pressed = true;
    ctx.signals.set(this.emit, true);
  }

  draw(r: Renderer): void {
    const { x, y, w, h } = this.aabb;
    if (this.pressed) {
      // 押し込まれて光る。
      r.rect(x, y + 2, w, h - 2, PALETTE.signalOn);
    } else {
      r.rect(x, y, w, h, PALETTE.tile);
    }
  }

  reset(): void {
    this.pressed = false;
  }
}

export const plateDef: GimmickDef<PlateParams> = {
  type: "plate",
  create(params, ctx) {
    return new Plate(params, ctx);
  },
};
