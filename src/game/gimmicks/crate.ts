import { PALETTE } from "../../art/palette";
import type { AABB } from "../../engine/aabb";
import { Actor } from "../../engine/physics";
import type { Renderer } from "../../engine/renderer";
import type { Gimmick, GimmickDef, GimmickParams, SpawnContext } from "./types";

/**
 * 押せる箱 (World 3 のキーアイデア「道具が人の代わりをする」)。
 *
 * 自前の挙動はほとんど持たない。押し合いも「上に乗る」も、プレイヤー同士の
 * ために書いた Actor の経路がそのまま効く（SPEC §3.3, §3.4）。ここがやるのは
 * Actor を1つ用意して物理に差し出すことと、リセットで元の位置へ戻すことだけ。
 *
 * 感圧板は重さしか見ないので、箱を載せれば人の代わりになる。これが
 * ワールド1の「誰かが板に残らねばならない」への解答になる。
 */
export interface CrateParams extends GimmickParams {
  w?: number;
  h?: number;
}

class Crate implements Gimmick {
  readonly type = "crate";

  private readonly body: Actor;
  private readonly homeX: number;
  private readonly homeY: number;

  constructor(params: CrateParams, ctx: SpawnContext) {
    const ts = ctx.tileSize;
    this.homeX = params.x * ts;
    this.homeY = params.y * ts;
    this.body = new Actor(this.homeX, this.homeY, (params.w ?? 1) * ts, (params.h ?? 1) * ts);
  }

  /** 判定・描画の基準は Actor の箱そのもの。物理が動かした結果がそのまま出る。 */
  get aabb(): AABB {
    return this.body.box;
  }

  actor(): Actor {
    return this.body;
  }

  /** 移動は物理側（重力と押し合い）が行うので、ここですることは無い。 */
  update(): void {}

  draw(r: Renderer): void {
    const { x, y, w, h } = this.body.box;
    r.rect(x, y, w, h, PALETTE.crate);
    // 縁を明るくして「持ち上がっている物体」に見せる。地形との区別にもなる。
    r.rect(x, y, w, 3, PALETTE.crateEdge);
    r.strokeRect(x + 1, y + 1, w - 2, h - 2, PALETTE.crateEdge, 2);
  }

  reset(): void {
    this.body.teleport(this.homeX, this.homeY);
  }
}

export const crateDef: GimmickDef<CrateParams> = {
  type: "crate",
  create(params, ctx) {
    return new Crate(params, ctx);
  },
};
