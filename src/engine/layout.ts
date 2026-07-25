/**
 * 画面レイアウトの寸法計算。
 *
 * この計算は CSS の calc() の中にあったが、そこにあるとテストできない。
 * 実際にリグレッションを2回出している（canvas が画面をはみ出す / 縦画面で
 * 操作帯が見切れる）。どちらも実機を見なくても、代表的な端末幅で検算すれば
 * 機械的に検出できたもの。
 *
 * そこで式はここだけに置き、CSS には結果をカスタムプロパティで渡す。
 * 式を CSS と TypeScript の両方に持つと必ずずれるので、ミラーはしない。
 */

/** ステージの論理解像度 960x432 の比。canvas の高さはこれで決まる。 */
const ASPECT_W = 20;
const ASPECT_H = 9;

/** デスクトップで canvas を拡大する上限。 */
const MAX_CANVAS_W = 960;

/** ボタン間の隙間と、操作帯の左右パディング合計。 */
const BUTTON_GAP = 10;
const BAR_PADDING_X = 28;
/** 操作帯の高さ = ジャンプボタン径 + この余白。 */
const BAR_EXTRA_H = 24;

/** ジャンプはタイミングが要求されるので一回り大きい。 */
const JUMP_RATIO = 1.15;

/** タップ標的の下限。これを割ると押しにくくて操作にならない。 */
export const MIN_TOUCH_TARGET = 44;

export interface Viewport {
  width: number;
  height: number;
}

export interface Layout {
  /** 左右ボタンの一辺 (px)。 */
  buttonSize: number;
  /** ジャンプボタンの直径 (px)。 */
  jumpSize: number;
  /** 操作帯の高さ (px)。非表示なら 0。 */
  barHeight: number;
  /** canvas の表示幅と高さ (px)。 */
  canvasWidth: number;
  canvasHeight: number;
  /** 操作帯を描くのに必要な幅 (px)。 */
  controlsRequiredWidth: number;
  /** 操作帯を表示するか。収まらないなら出さず、横向きを促す。 */
  showControls: boolean;
}

function clamp(lo: number, v: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** 端末の向き。縦横でボタンの大きさと中央の空きが変わる。 */
function isLandscape(vp: Viewport): boolean {
  return vp.width >= vp.height;
}

/**
 * ボタン径。vmin 基準にして端末サイズへ追従させつつ、上下限を px で挟む。
 * 挟まないとタブレットで巨大化し、小型機では潰れる。
 * 横画面は縦の余裕が無いので一回り小さくする。
 */
function buttonSize(vp: Viewport): number {
  const vmin = Math.min(vp.width, vp.height);
  return isLandscape(vp)
    ? clamp(52, 0.17 * vmin, 84)
    : clamp(56, 0.19 * vmin, 92);
}

/** 2人ぶんの操作帯に必要な幅。中央は手がぶつからないよう広めに空ける。 */
function requiredWidth(vp: Viewport, btn: number, jump: number): number {
  const pad = btn * 2 + jump + BUTTON_GAP * 2;
  const midGap = (isLandscape(vp) ? 0.04 : 0.08) * vp.width;
  return pad * 2 + midGap + BAR_PADDING_X;
}

export function computeLayout(vp: Viewport, touchMode: boolean): Layout {
  const btn = buttonSize(vp);
  const jump = btn * JUMP_RATIO;
  const required = requiredWidth(vp, btn, jump);

  // 「収まるかどうか」で判定する。向きで切ると、幅の足りるタブレットの
  // 縦持ちまで締め出してしまう。
  const showControls = touchMode && required <= vp.width;
  const barHeight = showControls ? jump + BAR_EXTRA_H : 0;

  // 幅を viewport から直接求め、高さは比から決める。
  // width:100%/height:100% + object-fit には頼れない。親の高さが内容依存だと
  // パーセントが解決されず、canvas が固有サイズ（バッキングストアの
  // 960*dpr）で表示されて画面をはみ出す。実際にそれで下部が隠れた。
  const availableH = vp.height - barHeight;
  const byHeight = (availableH * ASPECT_W) / ASPECT_H;
  const canvasWidth = touchMode
    ? Math.min(vp.width, byHeight)
    : Math.min(MAX_CANVAS_W, vp.width, byHeight);

  return {
    buttonSize: btn,
    jumpSize: jump,
    barHeight,
    canvasWidth,
    canvasHeight: (canvasWidth * ASPECT_H) / ASPECT_W,
    controlsRequiredWidth: required,
    showControls,
  };
}

/** 計算結果を CSS に渡す。CSS 側は式を持たず、この値を使うだけ。 */
export function applyLayout(layout: Layout, root: HTMLElement, body: HTMLElement): void {
  const s = root.style;
  s.setProperty("--btn-size", `${layout.buttonSize}px`);
  s.setProperty("--jump-size", `${layout.jumpSize}px`);
  s.setProperty("--bar-h", `${layout.barHeight}px`);
  s.setProperty("--canvas-w", `${layout.canvasWidth}px`);
  // 操作帯が収まらない端末では出さず、横向きを促す表示に切り替える。
  body.classList.toggle("controls-hidden", !layout.showControls);
}

/** 現在の viewport を読む。dvh 相当として visualViewport を優先する。 */
export function currentViewport(): Viewport {
  return {
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  };
}
