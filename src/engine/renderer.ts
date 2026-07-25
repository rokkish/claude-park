/**
 * 描画の抽象。ゲームロジックは Canvas2D を直接触らず、この面だけを使う。
 * 実装は engine/renderer2d.ts（Canvas2D）。
 *
 * 座標は全てワールド px。カメラ変換は Renderer の外側（camera.ts）で
 * ctx に掛かっているものとする。
 */
export interface TextOptions {
  color?: string;
  size?: number;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  font?: string;
}

export interface Renderer {
  /** 複雑な描画（Clawd の曲線など）のためのエスケープハッチ。 */
  readonly ctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;

  clear(color: string): void;

  rect(x: number, y: number, w: number, h: number, color: string): void;
  strokeRect(
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    lineWidth?: number,
  ): void;
  roundRect(x: number, y: number, w: number, h: number, r: number, color: string): void;
  circle(cx: number, cy: number, r: number, color: string): void;
  ellipse(cx: number, cy: number, rx: number, ry: number, color: string): void;
  line(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: string,
    lineWidth?: number,
  ): void;
  text(s: string, x: number, y: number, opts?: TextOptions): void;

  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  rotate(radians: number): void;
  setAlpha(a: number): void;
}
