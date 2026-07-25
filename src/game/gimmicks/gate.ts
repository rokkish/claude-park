import { PALETTE } from "../../art/palette";
import type { AABB } from "../../engine/aabb";
import type { Renderer } from "../../engine/renderer";
import { evaluateSignals } from "../signals";
import type { SignalMode } from "../signals";
import type { Gimmick, GimmickContext, GimmickDef, GimmickParams, SpawnContext } from "./types";

/** ゲート (SPEC §7.3)。listen チャンネルを mode で結合した結果で開閉する。 */
export interface GateParams extends GimmickParams {
  w?: number;
  h?: number;
  listen: string[];
  mode?: SignalMode;
  latch?: boolean;
}

class Gate implements Gimmick {
  readonly type = "gate";
  readonly aabb: AABB;
  private readonly listen: string[];
  private readonly mode: SignalMode;
  private readonly latch: boolean;
  private open = false;

  constructor(params: GateParams, ctx: SpawnContext) {
    const ts = ctx.tileSize;
    const w = params.w ?? 1;
    const h = params.h ?? 1;
    this.aabb = { x: params.x * ts, y: params.y * ts, w: w * ts, h: h * ts };
    this.listen = params.listen;
    this.mode = params.mode ?? "all";
    this.latch = params.latch ?? false;
  }

  update(_dt: number, ctx: GimmickContext): void {
    // SPEC §5.3 手順7: 受信側の開閉状態はここで、シグナルが立った同じステップ内で確定する。
    const on = evaluateSignals(ctx.signals, this.listen, this.mode);
    if (on) {
      this.open = true;
    } else if (!this.latch) {
      this.open = false;
    }
    // latch かつ一度 open した場合は、on が false に戻っても閉じない。reset() でのみ戻る。
  }

  draw(r: Renderer): void {
    const { x, y, w, h } = this.aabb;
    if (this.open) {
      // 開いている間は薄い残像として輪郭だけ見せる (SPEC §6.4)。
      r.setAlpha(0.3);
      r.strokeRect(x, y, w, h, PALETTE.gateOpen, 2);
      r.setAlpha(1);
    } else {
      r.rect(x, y, w, h, PALETTE.gateClosed);
      // 閂(かんぬき)のような横バーを描いて「塞がれている」印象を足す。
      const bars = Math.max(1, Math.round(h / 8));
      for (let i = 1; i < bars; i++) {
        const by = y + (h / bars) * i;
        r.line(x, by, x + w, by, PALETTE.tile, 1);
      }
    }
  }

  solidAABB(): AABB | null {
    return this.open ? null : this.aabb;
  }

  reset(): void {
    this.open = false;
  }
}

export const gateDef: GimmickDef<GateParams> = {
  type: "gate",
  create(params, ctx) {
    return new Gate(params, ctx);
  },
};
