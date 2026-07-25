import type { Renderer, TextOptions } from "./renderer";
import { VIEW_H, VIEW_W } from "../game/tuning";

const DEFAULT_FONT_STACK =
  "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/**
 * Canvas2D の薄いラッパ (SPEC §1.2)。
 * すべての描画メソッドは論理解像度 (960 x 432) の座標系で受け取る。
 * devicePixelRatio によるバッキングストアの拡大とプレスケールはここで一度だけ吸収する。
 */
export class Renderer2D implements Renderer {
  readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private dpr: number;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Renderer2D: 2D コンテキストを取得できません");
    this.ctx = ctx;
    this.dpr = 1;
    this.resize();
  }

  get width(): number {
    return VIEW_W;
  }

  get height(): number {
    return VIEW_H;
  }

  /** devicePixelRatio を読み直し、バッキングストアとプレスケールを更新する。 */
  resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(VIEW_W * this.dpr);
    this.canvas.height = Math.round(VIEW_H * this.dpr);
    // 以降すべての描画は論理 960x432 座標系で行える。
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  clear(color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }

  strokeRect(
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    lineWidth = 1,
  ): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.strokeRect(x, y, w, h);
  }

  roundRect(x: number, y: number, w: number, h: number, r: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, w, h, r);
    } else {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.moveTo(x + rr, y);
      ctx.lineTo(x + w - rr, y);
      ctx.arcTo(x + w, y, x + w, y + rr, rr);
      ctx.lineTo(x + w, y + h - rr);
      ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
      ctx.lineTo(x + rr, y + h);
      ctx.arcTo(x, y + h, x, y + h - rr, rr);
      ctx.lineTo(x, y + rr);
      ctx.arcTo(x, y, x + rr, y, rr);
      ctx.closePath();
    }
    ctx.fill();
  }

  circle(cx: number, cy: number, r: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
    this.ctx.fill();
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    this.ctx.fill();
  }

  line(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: string,
    lineWidth = 1,
  ): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.moveTo(x0, y0);
    this.ctx.lineTo(x1, y1);
    this.ctx.stroke();
  }

  text(s: string, x: number, y: number, opts: TextOptions = {}): void {
    const ctx = this.ctx;
    const size = opts.size ?? 16;
    ctx.font = opts.font ?? `${size}px ${DEFAULT_FONT_STACK}`;
    ctx.fillStyle = opts.color ?? "#ffffff";
    ctx.textAlign = opts.align ?? "left";
    ctx.textBaseline = opts.baseline ?? "alphabetic";
    ctx.fillText(s, x, y);
  }

  save(): void {
    this.ctx.save();
  }

  restore(): void {
    this.ctx.restore();
  }

  translate(x: number, y: number): void {
    this.ctx.translate(x, y);
  }

  scale(x: number, y: number): void {
    this.ctx.scale(x, y);
  }

  rotate(radians: number): void {
    this.ctx.rotate(radians);
  }

  setAlpha(a: number): void {
    this.ctx.globalAlpha = a;
  }
}
