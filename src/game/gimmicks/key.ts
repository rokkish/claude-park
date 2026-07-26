import { PALETTE } from "../../art/palette";
import type { AABB } from "../../engine/aabb";
import type { Renderer } from "../../engine/renderer";
import type { OverlapSource } from "../entities";
import type { Gimmick, GimmickContext, GimmickDef, GimmickParams, SpawnContext } from "./types";

/** 鍵 (SPEC §7.3)。取ると inventory に id が追加される収集物。 */
export interface KeyParams extends GimmickParams {
  id: string;
}

/** 見た目の一辺(px)。タイル中央に浮かせる小さな菱形っぽい四角として描く。 */
const KEY_SIZE = 14;
const BOB_AMPLITUDE = 3;
const BOB_SPEED = 4;

class Key implements Gimmick {
  readonly type = "key";
  readonly aabb: AABB;
  private readonly id: string;
  private readonly baseY: number;
  private collected = false;
  private t = 0;

  constructor(params: KeyParams, ctx: SpawnContext) {
    const ts = ctx.tileSize;
    this.baseY = params.y * ts + (ts - KEY_SIZE) / 2;
    this.aabb = {
      x: params.x * ts + (ts - KEY_SIZE) / 2,
      y: this.baseY,
      w: KEY_SIZE,
      h: KEY_SIZE,
    };
    this.id = params.id;
  }

  update(dt: number, _ctx: GimmickContext): void {
    if (this.collected) return;
    // 自身のインスタンス状態としてだけ dt を積算する（他ギミックと共有しない）。
    this.t += dt;
    this.aabb.y = this.baseY + Math.sin(this.t * BOB_SPEED) * BOB_AMPLITUDE;
  }

  onOverlap(source: OverlapSource, ctx: GimmickContext): void {
    // 箱が転がってきて鍵を回収してしまわないよう、人限定にする。
    if (this.collected || !source.isPlayer) return;
    ctx.inventory.add(this.id);
    this.collected = true;
  }

  draw(r: Renderer): void {
    if (this.collected) return;
    const { x, y, w, h } = this.aabb;
    r.roundRect(x, y, w, h, 3, PALETTE.accent);
  }

  reset(): void {
    this.collected = false;
    this.t = 0;
    this.aabb.y = this.baseY;
  }
}

export const keyDef: GimmickDef<KeyParams> = {
  type: "key",
  create(params, ctx) {
    return new Key(params, ctx);
  },
};
