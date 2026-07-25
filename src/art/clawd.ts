import type { Renderer } from "../engine/renderer";
import type { CharacterSkin, CharacterState } from "./skin";

/**
 * Clawd のピクセルアート描画 (SPEC §6.1, §6.2)。
 * リファレンス src/art/claudecode.webp に合わせた、陰影の無いフラットな単色スプライト。
 *
 * スプライトは「1スプライトピクセル = ux × uy」のグリッドで組む。
 * 目と脚の列位置はリファレンスと同一（12列の胴体に対して 目=2,9 / 脚=1,3,8,10）。
 *
 *   列: 0 1 2 3 4 5 6 7 8 91011     行:  0 ┌────────────┐
 *                                         3 │  ■      ■  │ 目
 *                                         5 ◀│            │▶ 腕
 *                                        10 └─┬─┬────┬─┬─┘
 *                                        12   ┘ └    ┘ └   脚
 *
 * 胴体は当たり判定(20px)より広い 24px = 12列で描き、左右に 2px ずつはみ出させる。
 * リファレンスの横長シルエットに寄せるための措置で、当たり判定は変えていない
 * （PLAYER_W を広げると 24px 幅のゲートを通れなくなり、ステージ1が壊れる）。
 *
 * 縦は当たり判定いっぱいの 12行を使う。頭の上端＝当たり判定の上端が一致しないと、
 * 「頭に乗る」ゲームで着地位置が見た目と食い違ってしまうため、ここは詰められない。
 * 結果としてリファレンス(胴体 12列 x 8行)より胴体が縦長になっている。
 */

/** スプライトのグリッド定義。単位はスプライトピクセル。 */
const BODY_COLS = 12;
const BODY_ROWS = 10;
const LEG_ROWS = 2;
const TOTAL_ROWS = BODY_ROWS + LEG_ROWS; // 12

/** 胴体が当たり判定から左右にはみ出す量（列）。 */
const BODY_OVERHANG = 1;

/** 脚の左端の列。リファレンスと同じ 1,3 / 8,10。 */
const LEG_COLS = [1, 3, 8, 10] as const;

/** 目の左端の列（正面向き）。facing に応じて 1 列ずらす。 */
const EYE_COLS = [2, 9] as const;
const EYE_ROW = 3;
const EYE_ROWS_NORMAL = 2;
const EYE_ROWS_AIRBORNE = 3;
const EYE_ROWS_STRAINING = 1;

/** 左右に突き出た腕。 */
const ARM_ROW = 5;
const ARM_ROWS = 2;

/** 歩行アニメの切り替え距離(px)。位置駆動なので足が滑らない。 */
const STRIDE_PX = 5;
/** これを超える速度で接地していれば歩行中とみなす。 */
const WALK_VX = 12;
/** 呼吸とみなす静止しきい値。 */
const STILL_V = 8;

export class ClawdSkin implements CharacterSkin {
  draw(r: Renderer, s: CharacterState): void {
    r.save();

    // 当たり判定 20px の左右に BODY_OVERHANG 列ずつはみ出して胴体 12列ぶんになる。
    const ux = s.w / (BODY_COLS - BODY_OVERHANG * 2);
    const uy = s.h / TOTAL_ROWS;
    const bodyX = s.x - BODY_OVERHANG * ux;
    const bodyW = BODY_COLS * ux;
    const groundY = s.y + s.h;
    const centerX = s.x + s.w / 2;

    // 接地影は描かない。4本脚の隙間を横一直線に埋めてしまい、
    // 脚が板の上に載っているように見えてシルエットが濁るため
    // （リファレンスも陰影なしのフラットな一枚絵）。

    // 接地してほぼ静止しているときだけ、1px 単位の呼吸バウンス。
    // s.time 駆動なのでモジュール外に可変状態を持たず、2体が独立に動く。
    const still = s.grounded && Math.abs(s.vx) < STILL_V && Math.abs(s.vy) < STILL_V;
    const breath = still ? Math.round(Math.sin(s.time * 2.2)) : 0;
    r.translate(0, -breath);

    // スカッシュ&ストレッチ: 足元中央を不動点にする。
    // 胴体中央を軸にすると足が地面から浮いて見えるため、必ず下端で行う。
    // 横方向は 1/squash（完全な体積保存）だと胴体が元々 24px 幅あるぶん
    // 着地時に潰れすぎて別物に見えるので、平方根で効きを弱めている。
    r.translate(centerX, groundY);
    r.scale(1 / Math.sqrt(s.squash), s.squash);
    r.translate(-centerX, -groundY);

    this.drawArms(r, s, bodyX, bodyW, ux, uy);
    this.drawLegs(r, s, bodyX, ux, uy);
    // 胴体は腕と脚の付け根を隠すように後から重ねる（フラットな一枚のシルエットに見せる）。
    r.rect(bodyX, s.y, bodyW, BODY_ROWS * uy, s.color.body);
    this.drawEyes(r, s, bodyX, ux, uy);

    r.restore();
  }

  private drawArms(
    r: Renderer,
    s: CharacterState,
    bodyX: number,
    bodyW: number,
    ux: number,
    uy: number,
  ): void {
    const y = s.y + ARM_ROW * uy;
    const h = ARM_ROWS * uy;
    r.rect(bodyX - ux, y, ux, h, s.color.body);
    r.rect(bodyX + bodyW, y, ux, h, s.color.body);
  }

  private drawLegs(
    r: Renderer,
    s: CharacterState,
    bodyX: number,
    ux: number,
    uy: number,
  ): void {
    const top = s.y + BODY_ROWS * uy;
    const full = LEG_ROWS * uy;

    // 歩行は位置で駆動する。時間駆動だと移動速度と歩幅がずれて足が滑る。
    const walking = s.grounded && Math.abs(s.vx) > WALK_VX;
    const phase = walking ? Math.floor(Math.abs(s.x) / STRIDE_PX) & 1 : -1;

    LEG_COLS.forEach((col, i) => {
      // 外側の脚(0,3)と内側の脚(1,2)を交互に持ち上げる2コマアニメ。
      const isInner = i === 1 || i === 2;
      const lifted = phase === 0 ? isInner : phase === 1 ? !isInner : false;
      const h = lifted ? full - uy : full;
      r.rect(bodyX + col * ux, top, ux, h, s.color.body);
    });
  }

  private drawEyes(
    r: Renderer,
    s: CharacterState,
    bodyX: number,
    ux: number,
    uy: number,
  ): void {
    // 表情は目の高さだけで表現する。フラットな単色スプライトなので
    // 眉やハイライトを足すとリファレンスの質感から外れてしまう。
    const rows = s.carrying
      ? EYE_ROWS_STRAINING // 誰かを頭に乗せて踏ん張っている
      : s.grounded
        ? EYE_ROWS_NORMAL
        : EYE_ROWS_AIRBORNE; // 空中では見開く

    // 目線を進行方向へ1列寄せる。胴体の縁(列0と11)には食い込ませない。
    const shift = s.facing > 0 ? 1 : -1;
    const y = s.y + EYE_ROW * uy;
    for (const col of EYE_COLS) {
      const c = Math.min(BODY_COLS - 2, Math.max(1, col + shift));
      r.rect(bodyX + c * ux, y, ux, rows * uy, s.color.eye);
    }
  }
}

export const clawdSkin = new ClawdSkin();
