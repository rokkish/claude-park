/**
 * Clawd のスプライトを PNG に焼き出す開発用プレビュー。
 *
 * 実際の ClawdSkin.draw() を、矩形を記録するだけの Renderer 実装に対して
 * 走らせるので、描画ロジックを複製せずに見た目を確認できる。
 *
 *   npx vite-node scripts/preview-clawd.ts
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import type { Renderer, TextOptions } from "../src/engine/renderer";
import { clawdSkin } from "../src/art/clawd";
import type { CharacterState } from "../src/art/skin";
import { P1_PALETTE, P2_PALETTE, PALETTE } from "../src/art/palette";
import { PLAYER_H, PLAYER_W } from "../src/game/tuning";

const ZOOM = 10;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  alpha: number;
}

/** translate / scale だけを追う簡易アフィン変換（回転は Clawd では使っていない）。 */
interface Xform {
  a: number;
  d: number;
  e: number;
  f: number;
}

class RecordingRenderer implements Renderer {
  readonly ctx = null as unknown as CanvasRenderingContext2D;
  readonly width = 0;
  readonly height = 0;
  readonly rects: Rect[] = [];

  private t: Xform = { a: 1, d: 1, e: 0, f: 0 };
  private stack: Xform[] = [];
  private alpha = 1;
  private alphaStack: number[] = [];

  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.rects.push({
      x: x * this.t.a + this.t.e,
      y: y * this.t.d + this.t.f,
      w: w * this.t.a,
      h: h * this.t.d,
      color,
      alpha: this.alpha,
    });
  }

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

  setAlpha(a: number): void {
    this.alpha = a;
  }

  // Clawd は以下を使わない。使い始めたらここで気付けるよう明示的に落とす。
  clear(): void {}
  rotate(): void {
    throw new Error("preview: rotate は未対応");
  }
  strokeRect(): void {
    throw new Error("preview: strokeRect は未対応");
  }
  roundRect(): void {
    throw new Error("preview: roundRect は未対応");
  }
  circle(): void {
    throw new Error("preview: circle は未対応");
  }
  ellipse(): void {
    throw new Error("preview: ellipse は未対応");
  }
  line(): void {
    throw new Error("preview: line は未対応");
  }
  text(_s: string, _x: number, _y: number, _o?: TextOptions): void {}
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

function encodePng(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0; // filter: none
    Buffer.from(rgb.subarray(y * w * 3, (y + 1) * w * 3)).copy(
      raw,
      y * (w * 3 + 1) + 1,
    );
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

function parseColor(c: string): [number, number, number] {
  if (c.startsWith("rgba")) {
    const [r, g, b] = c.slice(5, -1).split(",").map((v) => parseFloat(v));
    return [r!, g!, b!];
  }
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---- ポーズを並べて焼き出す ----

function baseState(over: Partial<CharacterState>): CharacterState {
  return {
    x: 0,
    y: 0,
    w: PLAYER_W,
    h: PLAYER_H,
    facing: 1,
    vx: 0,
    vy: 0,
    grounded: true,
    squash: 1,
    carrying: false,
    color: P1_PALETTE,
    time: 0,
    ...over,
  };
}

const poses: { label: string; state: Partial<CharacterState> }[] = [
  { label: "idle-right", state: {} },
  { label: "idle-left", state: { facing: -1 } },
  { label: "walk", state: { vx: 140, x: 0 } },
  { label: "walk-b", state: { vx: 140, x: 5 } },
  { label: "airborne", state: { grounded: false, vy: -300 } },
  { label: "carrying", state: { carrying: true } },
  { label: "land-squash", state: { squash: 0.7 } },
  { label: "jump-stretch", state: { squash: 1.25, grounded: false } },
  { label: "p2", state: { color: P2_PALETTE } },
];

const CELL_W = 34;
const CELL_H = 34;
const cols = poses.length;
const W = CELL_W * cols * ZOOM;
const H = CELL_H * ZOOM;
const rgb = new Uint8Array(W * H * 3);

// 背景をゲーム内と同じ色で塗る（目が背景に溶けないか確認するため）。
const [br, bg, bb] = parseColor(PALETTE.background);
for (let i = 0; i < W * H; i++) {
  rgb[i * 3] = br;
  rgb[i * 3 + 1] = bg;
  rgb[i * 3 + 2] = bb;
}

poses.forEach((pose, i) => {
  const r = new RecordingRenderer();
  const originX = i * CELL_W + (CELL_W - PLAYER_W) / 2;
  const originY = (CELL_H - PLAYER_H) / 2;
  const s = baseState({
    ...pose.state,
    x: (pose.state.x ?? 0) + originX,
    y: originY,
  });
  clawdSkin.draw(r, s);

  for (const rect of r.rects) {
    const [cr, cg, cb] = parseColor(rect.color);
    const x0 = Math.round(rect.x * ZOOM);
    const y0 = Math.round(rect.y * ZOOM);
    const x1 = Math.round((rect.x + rect.w) * ZOOM);
    const y1 = Math.round((rect.y + rect.h) * ZOOM);
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
        const o = (y * W + x) * 3;
        rgb[o] = Math.round(rgb[o]! * (1 - rect.alpha) + cr! * rect.alpha);
        rgb[o + 1] = Math.round(rgb[o + 1]! * (1 - rect.alpha) + cg! * rect.alpha);
        rgb[o + 2] = Math.round(rgb[o + 2]! * (1 - rect.alpha) + cb! * rect.alpha);
      }
    }
  }
});

const out = process.argv[2] ?? "clawd-preview.png";
writeFileSync(out, encodePng(W, H, rgb));
console.log(`${out} (${W}x${H}) poses: ${poses.map((p) => p.label).join(", ")}`);
