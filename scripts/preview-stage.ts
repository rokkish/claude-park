/**
 * ステージ全体を PNG に焼き出す開発用プレビュー。
 * 実際の Game.render() をそのまま走らせるので、タイル・ギミック・Clawd の
 * 配置と配色を、ブラウザを開かずに確認できる。
 *
 *   npx vite-node scripts/preview-stage.ts out.png [pose]
 *
 * pose:
 *   start  スポーン直後（既定）
 *   boost  P1 の頭に P2 が乗った状態
 *   open   P2 が感圧板を踏み、ゲートが開いた状態
 *   clear  鍵を取って2人がゴールに入った状態
 */
import { writeFileSync } from "node:fs";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";
import { Game } from "../src/game/game";
import { DT, TILE, VIEW_H, VIEW_W } from "../src/game/tuning";
import type { StageData } from "../src/game/stageData";
import { PALETTE } from "../src/art/palette";
import stage01 from "../src/stages/stage-01.json";
import { Canvas, RecordingRenderer, encodePng, rasterize } from "./lib/recorder";

const ZOOM = 2;

function idle(): PlayerInput {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false };
}

const input = new ScriptedInput([idle(), idle()]);
const game = new Game(input, stage01 as StageData);
game.start();

const pose = process.argv[3] ?? "start";
const [p1, p2] = game.players;

switch (pose) {
  case "boost":
    p1!.teleport(12 * TILE, 15 * TILE);
    p2!.teleport(12 * TILE, 14 * TILE);
    break;
  case "open":
    p1!.teleport(10 * TILE, 15 * TILE);
    p2!.teleport(15 * TILE, 12 * TILE);
    break;
  case "clear":
    p1!.teleport(25 * TILE, 15 * TILE); // 鍵の上
    for (let i = 0; i < 5; i++) game.step(DT);
    p1!.teleport(35 * TILE, 15 * TILE);
    p2!.teleport(35 * TILE + 30, 15 * TILE);
    break;
  default:
    break;
}

// ギミックの状態（ゲートの開閉など）を落ち着かせる
for (let i = 0; i < 10; i++) game.step(DT);

const r = new RecordingRenderer(VIEW_W, VIEW_H);
game.render(r);

const canvas = new Canvas(VIEW_W * ZOOM, VIEW_H * ZOOM, PALETTE.letterbox);
rasterize(canvas, r.ops, ZOOM);

const out = process.argv[2] ?? "stage-preview.png";
writeFileSync(out, encodePng(canvas));
console.log(`${out} (${canvas.w}x${canvas.h}) pose=${pose} phase=${game.phase}`);
