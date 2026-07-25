/**
 * ステージ全体を論理解像度に収める変換 (SPEC §1.2)。
 * ステージ1は1画面固定なのでスクロールしない。
 * 将来スクロールが要る場合はここに follow モードを足す（他は無変更で済む）。
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

export function applyCamera(ctx: CanvasRenderingContext2D, view: CameraView): void {
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.scale, view.scale);
}
