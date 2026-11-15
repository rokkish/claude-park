import { PALETTE } from "../../art/palette";
import { overlaps, type AABB } from "../../engine/aabb";
import type { Renderer } from "../../engine/renderer";
import { Tile } from "../../engine/tilegrid";
import type { OverlapSource, PlayerState } from "../entities";
import { evaluateSignals, type SignalMode } from "../signals";
import type { Gimmick, GimmickContext, GimmickDef, GimmickParams, SpawnContext } from "./types";

/**
 * 爆弾 (World 5 のキーアイデア)。
 *
 * - 人が触れると、その人の頭に載る。**降ろせない**（運び役は手が塞がる）。
 * - `listen` の信号が立った瞬間に爆発する。起爆するのは必ず別の誰か、という
 *   役割の非対称がここから生まれる（運び役は現場を離れられない）。
 * - 爆発は爆弾を中心とした 3 タイル四方 (72px)。掛かったブロック (`B`) を壊し、
 *   中に居た人をスポーンへ戻す。運び役は必ず巻き込まれる。
 * - 爆発後は少し置いて元の位置に戻る。置き場所を間違えてもやり直せる。
 *
 * 物理には参加しない（Actor も Solid も持たない）。頭に載せた箱は跳ぶと落ちるので、
 * 「運ぶ」を物理の押し合いに任せると運搬そのものが難所になってしまう。爆弾は
 * 運び役の位置から毎回引き直すだけにして、落とす心配を無くしてある。
 */
export interface BombParams extends GimmickParams {
  listen: string[];
  mode?: SignalMode;
}

/** 見た目と当たり判定の一辺 (px)。 */
const SIZE = 18;
/** 爆発の一辺 (px)。3 タイル四方。 */
export const BLAST_SIZE = 72;
/** 爆発してから元の位置に戻るまで (秒)。 */
const RESPAWN_DELAY = 0.8;
/** 爆風を描いている時間 (秒)。 */
const FLASH_TIME = 0.3;

class Bomb implements Gimmick {
  readonly type = "bomb";
  readonly aabb: AABB;
  private readonly home: { x: number; y: number };
  private readonly listen: string[];
  private readonly mode: SignalMode;

  private carrier: PlayerState | null = null;
  /** 前のステップで信号が立っていたか。立ち上がりだけで起爆する。 */
  private wasOn = false;
  /** 0 より大きい間は消えている。 */
  private respawnIn = 0;
  /** 直近の爆風。描画のためだけに持つ。 */
  private blast: AABB | null = null;
  private flash = 0;

  constructor(params: BombParams, ctx: SpawnContext) {
    if (!Array.isArray(params.listen) || params.listen.length === 0) {
      // 起爆できない爆弾は拾った人を永久に塞ぐだけなので、ロード時に落とす。
      throw new Error(`bomb(${params.x},${params.y}): listen は1つ以上のチャンネルが必須です`);
    }
    const ts = ctx.tileSize;
    // タイルの床に置く（下端をタイルの下端に合わせる）
    this.home = { x: params.x * ts + (ts - SIZE) / 2, y: params.y * ts + ts - SIZE };
    this.aabb = { x: this.home.x, y: this.home.y, w: SIZE, h: SIZE };
    this.listen = params.listen;
    this.mode = params.mode ?? "all";
  }

  /** 運ばれている間は、運び役の頭の上に引き直す。 */
  private follow(): void {
    const c = this.carrier;
    if (!c) return;
    this.aabb.x = c.box.x + (c.box.w - SIZE) / 2;
    this.aabb.y = c.box.y - SIZE;
  }

  update(dt: number, ctx: GimmickContext): void {
    this.flash = Math.max(0, this.flash - dt);
    const on = evaluateSignals(ctx.signals, this.listen, this.mode);
    const trigger = on && !this.wasOn;
    this.wasOn = on;

    if (this.respawnIn > 0) {
      this.respawnIn -= dt;
      if (this.respawnIn <= 0) this.rest();
      return;
    }
    this.follow();
    if (trigger) this.explode(ctx);
  }

  private explode(ctx: GimmickContext): void {
    const blast: AABB = {
      x: this.aabb.x + SIZE / 2 - BLAST_SIZE / 2,
      y: this.aabb.y + SIZE / 2 - BLAST_SIZE / 2,
      w: BLAST_SIZE,
      h: BLAST_SIZE,
    };
    const grid = ctx.grid;
    const ts = grid.tileSize;
    for (let ty = Math.floor(blast.y / ts); ty <= Math.floor((blast.y + blast.h - 1) / ts); ty++) {
      for (let tx = Math.floor(blast.x / ts); tx <= Math.floor((blast.x + blast.w - 1) / ts); tx++) {
        if (grid.at(tx, ty) === Tile.Brick) grid.set(tx, ty, Tile.Empty);
      }
    }
    for (const p of ctx.players) {
      if (overlaps(p.box, blast)) p.respawn();
    }
    this.blast = blast;
    this.flash = FLASH_TIME;
    this.carrier = null;
    this.respawnIn = RESPAWN_DELAY;
  }

  onOverlap(source: OverlapSource, ctx: GimmickContext): void {
    // 拾えるのは置いてある間だけ。運ばれている爆弾は横取りできない。
    if (this.respawnIn > 0 || this.carrier || !source.isPlayer) return;
    this.carrier = ctx.players.find((p) => p.box === source.box) ?? null;
    this.follow();
  }

  /** 誰かの頭に載っているか（テストとプレビューから読む）。 */
  get carriedBy(): number | null {
    return this.carrier?.index ?? null;
  }

  private rest(): void {
    this.carrier = null;
    this.respawnIn = 0;
    this.aabb.x = this.home.x;
    this.aabb.y = this.home.y;
  }

  draw(r: Renderer): void {
    if (this.blast && this.flash > 0) {
      // 爆風: 範囲そのものを光らせる。どこまで届いたかが見える。
      const { x, y, w, h } = this.blast;
      r.setAlpha(this.flash / FLASH_TIME);
      r.rect(x, y, w, h, PALETTE.blast);
      r.setAlpha(1);
    }
    if (this.respawnIn > 0) return;
    // update は移動の前に走るので、描く直前にもう一度頭の上へ合わせる
    this.follow();
    const cx = this.aabb.x + SIZE / 2;
    const cy = this.aabb.y + SIZE / 2 + 1;
    r.circle(cx, cy, SIZE / 2 - 1, PALETTE.bomb);
    // 導火線と火
    r.line(cx + 3, cy - 6, cx + 6, cy - 10, PALETTE.textDim, 2);
    r.circle(cx + 6, cy - 10, 2, PALETTE.accent);
  }

  reset(): void {
    this.rest();
    this.wasOn = false;
    this.blast = null;
    this.flash = 0;
  }
}

export const bombDef: GimmickDef<BombParams> = {
  type: "bomb",
  create(params, ctx) {
    return new Bomb(params, ctx);
  },
};
