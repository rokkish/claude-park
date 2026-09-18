import type { AABB } from "./aabb";

/**
 * カメラ (SPEC §1.2)。
 * - fitCamera: ステージ全体を論理解像度に収める（1画面ステージとプレビュー用）
 * - followCamera: 画面より大きいステージで、2人を囲む範囲を映す追従カメラ
 * どちらも「平行移動と拡大縮小」だけを返し、描画の先頭で1回かける。
 */
export interface CameraView {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function fitCamera(
  stageW: number,
  stageH: number,
  viewW: number,
  viewH: number,
): CameraView {
  const scale = Math.min(viewW / stageW, viewH / stageH);
  return {
    scale,
    offsetX: (viewW - stageW * scale) / 2,
    offsetY: (viewH - stageH * scale) / 2,
  };
}

/** 追従カメラが対象の周りに空ける余白 (px)。先の地形が少し見える程度。 */
export const FOLLOW_MARGIN = 96;
/** 追従の速さ。1秒あたりこの割合ずつ目標に寄る（dt を掛けて使う）。 */
export const FOLLOW_RATE = 8;

/**
 * 追従カメラ。対象（プレイヤー全員）の矩形を全部囲む範囲を映す。
 * - ステージが画面に収まるなら fitCamera と同じ。既存の 40×18 ステージは
 *   見た目が変わらない
 * - 収まらなければ、対象の周りに余白を取った範囲が画面に入る最大の倍率
 *   （上限 1 = 等倍）で、その中心を画面の中心に置く。2人が離れるほど引きになる
 * - ステージの端より外側は映さない（端では中心を諦めて端に寄せる）
 * 画面の端を当たり判定にはしないので、物理はカメラを知らないままでよい。
 */
export function followCamera(
  targets: readonly AABB[],
  stageW: number,
  stageH: number,
  viewW: number,
  viewH: number,
  margin = FOLLOW_MARGIN,
): CameraView {
  if ((stageW <= viewW && stageH <= viewH) || targets.length === 0) {
    return fitCamera(stageW, stageH, viewW, viewH);
  }
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const t of targets) {
    x0 = Math.min(x0, t.x);
    y0 = Math.min(y0, t.y);
    x1 = Math.max(x1, t.x + t.w);
    y1 = Math.max(y1, t.y + t.h);
  }
  const boxW = x1 - x0 + margin * 2;
  const boxH = y1 - y0 + margin * 2;
  const scale = Math.min(1, viewW / boxW, viewH / boxH);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return {
    scale,
    offsetX: clampOffset(viewW / 2 - cx * scale, stageW * scale, viewW),
    offsetY: clampOffset(viewH / 2 - cy * scale, stageH * scale, viewH),
  };
}

/** ステージが画面より大きい軸では端で止め、小さい軸では中央に置く。 */
function clampOffset(offset: number, stageSize: number, viewSize: number): number {
  if (stageSize <= viewSize) return (viewSize - stageSize) / 2;
  return Math.min(0, Math.max(viewSize - stageSize, offset));
}

/** 現在のカメラを目標へ寄せる。dt が大きくても目標を追い越さない。 */
export function approachCamera(current: CameraView, target: CameraView, dt: number): CameraView {
  const t = Math.min(1, dt * FOLLOW_RATE);
  return {
    scale: current.scale + (target.scale - current.scale) * t,
    offsetX: current.offsetX + (target.offsetX - current.offsetX) * t,
    offsetY: current.offsetY + (target.offsetY - current.offsetY) * t,
  };
}

export function applyCamera(ctx: CanvasRenderingContext2D, view: CameraView): void {
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.scale, view.scale);
}
