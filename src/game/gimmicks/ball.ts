import { PALETTE } from "../../art/palette";
import { overlaps, type AABB } from "../../engine/aabb";
import type { Renderer } from "../../engine/renderer";
import { Tile } from "../../engine/tilegrid";
import type { OverlapSource } from "../entities";
import type { Gimmick, GimmickContext, GimmickDef, GimmickParams, SpawnContext } from "./types";

/**
 * ボール (World 4 のキーアイデア「ブロック崩し」)。
 *
 * 人が触れると、その人から離れる向きに打ち出される。向きは3種類:
 * 立って横から当てれば水平、跳んで横から当てれば 45° 斜め上、真下から当てれば真上。
 * 床に置いたボールは立ったままなら横にしか打てず、浮かせたボールは真下から
 * 跳んで触れれば真上に打てる（4-2）。飛んでいる間は
 * - ブロック (`B`) に当たると、そのブロックを壊して跳ね返る
 * - 人に当たると跳ね返る（人が板の役をする）
 * - 壁 (`#`)、閉じたゲートや足場（ギミックの Solid）、箱に当たると消えて、
 *   少し置いてから元の位置に戻る
 *
 * 壁で跳ね返らせないのは意図的で、跳ね返り続けるボールは放っておくだけで
 * 全部のブロックを壊してしまい「壊しすぎるとゴールに届かない」を作れない。
 * 消える壁があるから、ボールを止めたい側は「返さない」だけでよい。
 */
export interface BallParams extends GimmickParams {
  /** 移動速度 (px/s)。走る速さ 160 より少し速いと打ち返しに緊張感が出る。 */
  speed?: number;
}

/** 当たり判定の一辺 (px)。円として描く。 */
const SIZE = 10;
const DEFAULT_SPEED = 220;
/** 壁に当たって消えてから元の位置に戻るまでの間 (秒)。「消えた」と分かる長さ。 */
const RESPAWN_DELAY = 0.4;
/**
 * 「真下から」とみなす比率。中心の横のずれが縦のずれのこの割合未満なら、真上（真下）に飛ぶ。
 * それ以外は横からの接触で、地上なら水平、空中なら 45° 斜め上に飛ぶ (4-4)。
 * 向きを中心のずれの比で決めると、接触した瞬間の高さで角度がぶれて狙えない。
 * 状態で決めれば「立って返せば水平、跳んで返せば 45°」と幾何が固定され、
 * 立つ位置で狙える（45° なら 1.5 タイル先の天井に当たる、など）。
 */
const VERTICAL_RATIO = 0.5;
/** 空中で横から当てたときの斜めの向き。45° なので x と y の成分が等しい。 */
const DIAGONAL = Math.SQRT1_2;

class Ball implements Gimmick {
  readonly type = "ball";
  readonly aabb: AABB;
  private readonly restX: number;
  private readonly restY: number;
  private readonly speed: number;
  private vx = 0;
  private vy = 0;
  /** 0 より大きい間は消えている。0 になった時点で元の位置に戻る。 */
  private respawnIn = 0;

  constructor(params: BallParams, ctx: SpawnContext) {
    const ts = ctx.tileSize;
    this.restX = params.x * ts + (ts - SIZE) / 2;
    this.restY = params.y * ts + (ts - SIZE) / 2;
    this.aabb = { x: this.restX, y: this.restY, w: SIZE, h: SIZE };
    this.speed = params.speed ?? DEFAULT_SPEED;
  }

  private get moving(): boolean {
    return this.vx !== 0 || this.vy !== 0;
  }

  update(dt: number, ctx: GimmickContext): void {
    if (this.respawnIn > 0) {
      this.respawnIn -= dt;
      if (this.respawnIn <= 0) this.rest();
      return;
    }
    if (!this.moving) return;

    const prevX = this.aabb.x;
    const prevY = this.aabb.y;
    this.aabb.x += this.vx * dt;
    this.aabb.y += this.vy * dt;

    // 重なったタイルを調べる。ブロックを優先し、1フレームに壊すのは1個まで。
    const grid = ctx.grid;
    const ts = grid.tileSize;
    const x0 = Math.floor(this.aabb.x / ts);
    const y0 = Math.floor(this.aabb.y / ts);
    const x1 = Math.floor((this.aabb.x + SIZE - 1) / ts);
    const y1 = Math.floor((this.aabb.y + SIZE - 1) / ts);
    let hitWall = false;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const tile = grid.at(tx, ty);
        if (tile === Tile.Brick) {
          grid.set(tx, ty, Tile.Empty);
          // 食い込みの浅い軸から入ったとみなし、その成分だけを反転する。
          // 「前の位置がブロックの外側か」で判定すると、位置の浮動小数の誤差
          // （220/60 を積んだ 374.00000000000006 など）で境界ちょうどの比較が
          // 裏返り、反転せずに次のブロックまで突き抜けることがある。
          // 位置は1フレーム前に戻す（1フレームの移動量はボールより小さいので
          // これで重なりが解消する）。
          const bx = tx * ts;
          const by = ty * ts;
          const depthX = Math.min(this.aabb.x + SIZE - bx, bx + ts - this.aabb.x);
          const depthY = Math.min(this.aabb.y + SIZE - by, by + ts - this.aabb.y);
          if (depthX < depthY) this.vx = -this.vx;
          else this.vy = -this.vy;
          this.aabb.x = prevX;
          this.aabb.y = prevY;
          return;
        }
        if (tile === Tile.Solid) hitWall = true;
      }
    }
    if (hitWall) {
      this.vanish();
      return;
    }
    // 閉じたゲートは壁と同じ。人は跳び越えられてもボールは通れない (4-3)。
    for (const s of ctx.solids) {
      if (overlaps(this.aabb, s.box)) {
        this.vanish();
        return;
      }
    }
  }

  /** 飛んでいる間はカメラに映す。打った球が先の地形を偵察する形になる。 */
  cameraTarget(): AABB | null {
    return this.moving && this.respawnIn <= 0 ? this.aabb : null;
  }

  onOverlap(source: OverlapSource, ctx: GimmickContext): void {
    if (this.respawnIn > 0) return;
    // 箱は壁と同じ。打てないし、飛んでいる球が当たれば消える。
    if (!source.isPlayer) {
      if (this.moving) this.vanish();
      return;
    }

    const dx = this.aabb.x + SIZE / 2 - (source.box.x + source.box.w / 2);
    const dy = this.aabb.y + SIZE / 2 - (source.box.y + source.box.h / 2);
    // 既に離れる向きに飛んでいるなら、重なりが残っていても二度打ちしない。
    if (this.moving && this.vx * dx + this.vy * dy > 0) return;

    if (Math.abs(dx) < Math.abs(dy) * VERTICAL_RATIO) {
      // 真下（真上）から: 縦に飛ぶ
      this.vx = 0;
      this.vy = Math.sign(dy) * this.speed;
      return;
    }
    // 横から。中心が完全に重なっていたら来た向きへ押し返す。
    const dirX = dx !== 0 ? Math.sign(dx) : this.vx < 0 ? -1 : 1;
    const player = ctx.players.find((p) => p.box === source.box);
    if (player && !player.grounded) {
      // 空中で当てた: 45° 斜め上
      this.vx = dirX * DIAGONAL * this.speed;
      this.vy = -DIAGONAL * this.speed;
    } else {
      this.vx = dirX * this.speed;
      this.vy = 0;
    }
  }

  private vanish(): void {
    this.vx = 0;
    this.vy = 0;
    this.respawnIn = RESPAWN_DELAY;
  }

  private rest(): void {
    this.aabb.x = this.restX;
    this.aabb.y = this.restY;
    this.vx = 0;
    this.vy = 0;
    this.respawnIn = 0;
  }

  draw(r: Renderer): void {
    if (this.respawnIn > 0) return;
    const cx = this.aabb.x + SIZE / 2;
    const cy = this.aabb.y + SIZE / 2;
    if (!this.moving) {
      // 止まっている間は薄い輪を足して「触れば動く」ことを示す。
      r.setAlpha(0.3);
      r.circle(cx, cy, SIZE / 2 + 4, PALETTE.ball);
      r.setAlpha(1);
    }
    r.circle(cx, cy, SIZE / 2, PALETTE.ball);
  }

  reset(): void {
    this.rest();
  }
}

export const ballDef: GimmickDef<BallParams> = {
  type: "ball",
  create(params, ctx) {
    return new Ball(params, ctx);
  },
};
