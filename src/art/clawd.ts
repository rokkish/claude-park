import type { Renderer } from "../engine/renderer";
import type { CharacterSkin, CharacterState } from "./skin";

/**
 * Clawd の手描き風ベクタ描画 (SPEC §6.1, §6.2)。
 * ドット絵ではなく ctx.arc / quadraticCurveTo による曲線で構成する。
 * P1 / P2 は完全に同じ形で s.color だけが違う (SPEC §6.3)。
 */

/** 胴体の角丸半径。丸みのあるずんぐり体型のかなめ。 */
const BODY_RADIUS = 8;

/** 呼吸バウンスの周期(rad/s)と振幅(px)。s.time 駆動なので2体が完全に独立して呼吸できる。 */
const BREATH_SPEED = 2.4;
const BREATH_AMPLITUDE = 1.1;
/** これ未満の速度なら「ほぼ静止」とみなして呼吸を出す。 */
const STILL_VX = 8;
const STILL_VY = 8;

const EYE_R = 2.6;
const EYE_R_AIRBORNE = 3.4;

export class ClawdSkin implements CharacterSkin {
  draw(r: Renderer, s: CharacterState): void {
    r.save();

    const centerX = s.x + s.w / 2;
    const groundY = s.y + s.h;

    // 影は地面に固定。スカッシュで潰れているときは接地面積が広がって見えるよう少し広げる。
    const shadowSpread = Math.max(0.7, Math.min(1.4, 2 - s.squash));
    const shadowAlpha = s.grounded ? 1 : 0.55;
    r.setAlpha(shadowAlpha);
    r.ellipse(centerX, groundY + 1, s.w * 0.42 * shadowSpread, 3.5, s.color.shadow);
    r.setAlpha(1);

    // 接地してほぼ静止しているときだけ、わずかな呼吸バウンスを足す。
    // s.time 駆動＝モジュール外に可変状態を持たないので2体が独立に呼吸できる。
    const isNearlyStill =
      s.grounded && Math.abs(s.vx) < STILL_VX && Math.abs(s.vy) < STILL_VY;
    const breathBob = isNearlyStill ? Math.sin(s.time * BREATH_SPEED) * BREATH_AMPLITUDE : 0;
    r.translate(0, -breathBob);

    // スカッシュ&ストレッチ: 胴体下端中央を不動点にして縦だけ scale する。
    // ここを胴体の中心アンカーにすると足が地面から浮いて見えてしまうため、必ず下端で行う。
    r.translate(centerX, groundY);
    r.scale(1 / s.squash, s.squash);
    r.translate(-centerX, -groundY);

    this.drawAntenna(r, s, centerX);
    this.drawBody(r, s);
    this.drawFace(r, s, centerX);

    r.restore();
  }

  private drawBody(r: Renderer, s: CharacterState): void {
    r.roundRect(s.x, s.y, s.w, s.h, BODY_RADIUS, s.color.body);

    // 下寄りの陰影で丸みのボリュームを出す。
    r.ellipse(
      s.x + s.w / 2,
      s.y + s.h * 0.82,
      s.w * 0.4,
      s.h * 0.2,
      s.color.bodyDark,
    );

    // 進行方向寄りのハイライトで光源感を出す。
    r.ellipse(
      s.x + s.w / 2 + s.facing * 2.5,
      s.y + s.h * 0.4,
      s.w * 0.26,
      s.h * 0.28,
      s.color.bodyLight,
    );
  }

  private drawAntenna(r: Renderer, s: CharacterState, centerX: number): void {
    const baseX = centerX + s.facing * 1;
    const baseY = s.y + 3;
    const tipX = centerX + s.facing * 5;
    const tipY = s.y - 7;
    const ctrlX = centerX + s.facing * 2;
    const ctrlY = s.y - 3;

    const ctx = r.ctx;
    ctx.save();
    ctx.strokeStyle = s.color.bodyDark;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
    ctx.stroke();
    ctx.restore();

    r.circle(tipX, tipY, 2.2, s.color.bodyLight);
  }

  private drawFace(r: Renderer, s: CharacterState, centerX: number): void {
    const eyeY = s.y + s.h * 0.42;
    const eyeCenterX = centerX + s.facing * 2;
    const eyeSpacing = s.w * 0.22;
    const leftX = eyeCenterX - eyeSpacing;
    const rightX = eyeCenterX + eyeSpacing;

    if (s.carrying) {
      // 誰かを頭に乗せている: 踏ん張った・強張った表情にする（協力の核となる読み取り）。
      const eyeRx = EYE_R;
      const eyeRy = 1.3;
      r.ellipse(leftX, eyeY, eyeRx, eyeRy, s.color.eye);
      r.ellipse(rightX, eyeY, eyeRx, eyeRy, s.color.eye);

      // 眉間を寄せた眉でさらに「踏ん張り」感を強調する。
      const browY = eyeY - 4.5;
      r.line(leftX - 3, browY - 1, leftX + 3, browY + 1.5, s.color.bodyDark, 1.6);
      r.line(rightX + 3, browY - 1, rightX - 3, browY + 1.5, s.color.bodyDark, 1.6);
    } else {
      const eyeR = s.grounded ? EYE_R : EYE_R_AIRBORNE;
      r.circle(leftX, eyeY, eyeR, s.color.eye);
      r.circle(rightX, eyeY, eyeR, s.color.eye);
    }
  }
}

export const clawdSkin = new ClawdSkin();
