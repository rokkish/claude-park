/**
 * PWA 用アイコンを Clawd の描画コードから生成する。
 * 画像を外から持ち込まず、キャラの見た目を変えたら作り直せる状態を保つ。
 *
 *   npx vite-node scripts/gen-icons.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { clawdSkin } from "../src/art/clawd";
import { P1_PALETTE, PALETTE } from "../src/art/palette";
import { Canvas, RecordingRenderer, encodePng, rasterize } from "./lib/recorder";

/** スプライトの論理サイズ。clawd.ts のグリッド前提（10列 x 12行ぶん）。 */
const SPRITE_W = 20;
const SPRITE_H = 24;

function renderIcon(size: number): Canvas {
  // 余白を取りつつ、腕のはみ出しぶん(左右1列=2px)も収まる倍率にする。
  const pad = size * 0.12;
  const zoom = Math.min((size - pad * 2) / (SPRITE_W + 4), (size - pad * 2) / SPRITE_H);

  const r = new RecordingRenderer(size, size);
  const x = (size / zoom - SPRITE_W) / 2;
  const y = (size / zoom - SPRITE_H) / 2;
  clawdSkin.draw(r, {
    x,
    y,
    w: SPRITE_W,
    h: SPRITE_H,
    facing: 1,
    vx: 0,
    vy: 0,
    grounded: true,
    squash: 1,
    carrying: false,
    color: P1_PALETTE,
    time: 0,
  });

  const canvas = new Canvas(size, size, PALETTE.background);
  rasterize(canvas, r.ops, zoom);
  return canvas;
}

mkdirSync("public", { recursive: true });
for (const size of [192, 512]) {
  const out = `public/icon-${size}.png`;
  writeFileSync(out, encodePng(renderIcon(size)));
  console.log(`${out} (${size}x${size})`);
}
