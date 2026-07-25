import { PALETTE } from "../../art/palette";
import { overlaps } from "../../engine/aabb";
import type { AABB } from "../../engine/aabb";
import type { Renderer } from "../../engine/renderer";
import type { PlayerState } from "../entities";
import type { Gimmick, GimmickContext, GimmickDef, GimmickParams, SpawnContext } from "./types";

/** ゴールゾーン (SPEC §7.3)。requires を全部持っていれば解錠され、全員が入るとクリア。 */
export interface GoalParams extends GimmickParams {
  w?: number;
  h?: number;
  requires?: string[];
  needAllPlayers?: boolean;
}

class Goal implements Gimmick {
  readonly type = "goal";
  readonly aabb: AABB;
  private readonly requires: string[];
  private readonly needAllPlayers: boolean;
  private unlocked = false;
  private cleared = false;

  constructor(params: GoalParams, ctx: SpawnContext) {
    const ts = ctx.tileSize;
    const w = params.w ?? 1;
    const h = params.h ?? 1;
    this.aabb = { x: params.x * ts, y: params.y * ts, w: w * ts, h: h * ts };
    this.requires = params.requires ?? [];
    this.needAllPlayers = params.needAllPlayers ?? true;
  }

  update(_dt: number, ctx: GimmickContext): void {
    this.unlocked = ctx.inventory.hasAll(this.requires);
    if (this.cleared || !this.unlocked || ctx.players.length === 0) return;

    // クリア判定は「全プレイヤーが同時にゴール矩形に重なっているか」を要求できる。
    // onOverlap は1人ずつしか通知されないので、この全員同時判定は表現できず、
    // ここで ctx.players を直接ループして判定する必要がある。
    const inGoal = (p: PlayerState): boolean => overlaps(p.box, this.aabb);
    const satisfied = this.needAllPlayers
      ? ctx.players.every(inGoal)
      : ctx.players.some(inGoal);

    if (satisfied) {
      this.cleared = true;
      ctx.requestClear();
    }
  }

  draw(r: Renderer): void {
    const { x, y, w, h } = this.aabb;
    if (this.unlocked) {
      r.rect(x, y, w, h, PALETTE.accent);
    } else {
      r.setAlpha(0.35);
      r.rect(x, y, w, h, PALETTE.tile);
      r.setAlpha(1);
      // 施錠中を示すバツ印。
      r.line(x, y, x + w, y + h, PALETTE.textDim, 2);
      r.line(x + w, y, x, y + h, PALETTE.textDim, 2);
    }
  }

  reset(): void {
    this.unlocked = false;
    this.cleared = false;
  }
}

export const goalDef: GimmickDef<GoalParams> = {
  type: "goal",
  create(params, ctx) {
    return new Goal(params, ctx);
  },
};
