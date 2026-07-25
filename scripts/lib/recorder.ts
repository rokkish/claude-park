/**
 * 開発用: Renderer の描画呼び出しを記録して PNG に焼くための共通実装。
 *
 * ヘッドレスブラウザが使えない環境でも、実際の描画コード
 * （ClawdSkin / drawTiles / 各ギミックの draw / Game.render）を
 * そのまま走らせて見た目を確認するためのもの。
 * ゲーム本体からは参照されない。
 */
import { deflateSync } from "node:zlib";
import type { Renderer, TextOptions } from "../../src/engine/renderer";

type Op =
  | { kind: "rect"; x: number; y: number; w: number; h: number; color: string; alpha: number }
  | {
      kind: "line";
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      color: string;
      width: number;
      alpha: number;
    };

interface Xform {
  a: number;
  d: number;
  e: number;
  f: number;
}

export class RecordingRenderer implements Renderer {
  readonly ops: Op[] = [];
  readonly width: number;
  readonly height: number;

  private t: Xform = { a: 1, d: 1, e: 0, f: 0 };
  private stack: Xform[] = [];
  private alpha = 1;
  private alphaStack: number[] = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  /**
   * camera.ts の applyCamera が生の ctx を触るので、
   * translate / scale だけを同じ変換行列へ流す偽の ctx を渡す。
   */
  get ctx(): CanvasRenderingContext2D {
    return {
      translate: (x: number, y: number) => this.translate(x, y),
      scale: (x: number, y: number) => this.scale(x, y),
      save: () => this.save(),
      restore: () => this.restore(),
    } as unknown as CanvasRenderingContext2D;
  }

  private px(x: number): number {
    return x * this.t.a + this.t.e;
  }

  private py(y: number): number {
    return y * this.t.d + this.t.f;
  }

  clear(color: string): void {
    this.ops.push({
      kind: "rect",
      x: 0,
      y: 0,
      w: this.width,
      h: this.height,
      color,
      alpha: 1,
    });
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.ops.push({
      kind: "rect",
      x: this.px(x),
      y: this.py(y),
      w: w * this.t.a,
      h: h * this.t.d,
      color,
      alpha: this.alpha,
    });
  }

  strokeRect(x: number, y: number, w: number, h: number, color: string, lineWidth = 1): void {
    this.line(x, y, x + w, y, color, lineWidth);
    this.line(x + w, y, x + w, y + h, color, lineWidth);
    this.line(x + w, y + h, x, y + h, color, lineWidth);
    this.line(x, y + h, x, y, color, lineWidth);
  }

  /** 角丸は焼き出しでは矩形で近似する（形の確認が目的なので十分）。 */
  roundRect(x: number, y: number, w: number, h: number, _r: number, color: string): void {
    this.rect(x, y, w, h, color);
  }

  circle(cx: number, cy: number, r: number, color: string): void {
    this.ellipse(cx, cy, r, r, color);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, color: string): void {
    this.rect(cx - rx, cy - ry, rx * 2, ry * 2, color);
  }

  line(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: string,
    lineWidth = 1,
  ): void {
    this.ops.push({
      kind: "line",
      x0: this.px(x0),
      y0: this.py(y0),
      x1: this.px(x1),
      y1: this.py(y1),
      color,
      width: Math.max(1, lineWidth * this.t.a),
      alpha: this.alpha,
    });
  }

  /** 文字は焼かない。レイアウト確認が目的で、字形は本物の canvas でしか出ない。 */
  text(_s: string, _x: number, _y: number, _o?: TextOptions): void {}

  save(): void {
    this.stack.push({ ...this.t });
    this.alphaStack.push(this.alpha);
  }

  restore(): void {
    this.t = this.stack.pop() ?? this.t;
    this.alpha = this.alphaStack.pop() ?? this.alpha;
  }

  translate(x: number, y: number): void {
    this.t.e += x * this.t.a;
    this.t.f += y * this.t.d;
  }

  scale(x: number, y: number): void {
    this.t.a *= x;
    this.t.d *= y;
  }

  rotate(): void {
    throw new Error("recorder: rotate は未対応（使い始めたら実装すること）");
  }

  setAlpha(a: number): void {
    this.alpha = a;
  }
}

// ---- ラスタライズ ----

export function parseColor(c: string): [number, number, number, number] {
  if (c.startsWith("rgba")) {
    const p = c.slice(5, -1).split(",").map((v) => parseFloat(v));
    return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
  }
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
}

export class Canvas {
  readonly w: number;
  readonly h: number;
  readonly rgb: Uint8Array;

  constructor(w: number, h: number, fill: string) {
    this.w = w;
    this.h = h;
    this.rgb = new Uint8Array(w * h * 3);
    const [r, g, b] = parseColor(fill);
    for (let i = 0; i < w * h; i++) {
      this.rgb[i * 3] = r;
      this.rgb[i * 3 + 1] = g;
      this.rgb[i * 3 + 2] = b;
    }
  }

  blend(x: number, y: number, r: number, g: number, b: number, a: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const o = (y * this.w + x) * 3;
    this.rgb[o] = Math.round(this.rgb[o]! * (1 - a) + r * a);
    this.rgb[o + 1] = Math.round(this.rgb[o + 1]! * (1 - a) + g * a);
    this.rgb[o + 2] = Math.round(this.rgb[o + 2]! * (1 - a) + b * a);
  }

  fillRect(x: number, y: number, w: number, h: number, color: string, alpha: number): void {
    const [r, g, b, ca] = parseColor(color);
    const a = ca * alpha;
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const x1 = Math.round(x + w);
    const y1 = Math.round(y + h);
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) this.blend(px, py, r, g, b, a);
    }
  }
}

/** 記録した描画命令を zoom 倍で焼き付ける。 */
export function rasterize(canvas: Canvas, ops: RecordingRenderer["ops"], zoom: number): void {
  for (const op of ops) {
    if (op.kind === "rect") {
      canvas.fillRect(op.x * zoom, op.y * zoom, op.w * zoom, op.h * zoom, op.color, op.alpha);
      continue;
    }
    // 線は太さぶんの矩形をブレゼンハムで敷き詰める
    const [r, g, b, ca] = parseColor(op.color);
    const a = ca * op.alpha;
    const x0 = op.x0 * zoom;
    const y0 = op.y0 * zoom;
    const x1 = op.x1 * zoom;
    const y1 = op.y1 * zoom;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    const t = Math.max(1, Math.round(op.width * zoom));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / steps);
      const y = Math.round(y0 + ((y1 - y0) * i) / steps);
      for (let dy = 0; dy < t; dy++) {
        for (let dx = 0; dx < t; dx++) canvas.blend(x + dx, y + dy, r, g, b, a);
      }
    }
  }
}

// ---- 極小 PNG エンコーダ ----

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function encodePng(canvas: Canvas): Buffer {
  const { w, h, rgb } = canvas;
  const stride = w * 3 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0; // filter: none
    Buffer.from(rgb.subarray(y * w * 3, (y + 1) * w * 3)).copy(raw, y * stride + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
