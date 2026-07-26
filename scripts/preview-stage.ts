/**
 * ステージ全体を PNG に焼き出す開発用プレビュー。
 * 実際の Game.render() をそのまま走らせるので、タイル・ギミック・Clawd の
 * 配置と配色を、ブラウザを開かずに確認できる。
 *
 *   npx vite-node scripts/preview-stage.ts out.png [stage] [pose] [touch]
 *
 * stage: 1..N（既定 1）
 * pose:
 *   start   スポーン直後（全ステージ共通・既定）
 *   select  ワールド選択画面
 *   1-1: boost  P1 の頭に P2 が乗った状態
 *        open   P2 が感圧板を踏み、ゲートが開いた状態
 *        clear  鍵を取って2人がゴールに入った状態
 *   1-2: both   2枚の板を同時に踏み、ゲートがラッチで開いた状態
 *   1-3: bridge 板を踏んで橋が架かった状態
 */
import { writeFileSync } from "node:fs";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";
import { Game } from "../src/game/game";
import { DT, TILE, VIEW_H, VIEW_W } from "../src/game/tuning";
import { PALETTE } from "../src/art/palette";
import { STAGES } from "../src/stages/index";
import { Canvas, RecordingRenderer, encodePng, rasterize } from "./lib/recorder";

const ZOOM = 2;

function idle(): PlayerInput {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false };
}

const out = process.argv[2] ?? "stage-preview.png";
const stageNo = Number(process.argv[3] ?? 1);
const pose = process.argv[4] ?? "start";
const touchMode = process.argv[5] === "touch";

const data = STAGES[stageNo - 1];
if (!data) throw new Error(`ステージ ${stageNo} は存在しません (1..${STAGES.length})`);

const input = new ScriptedInput([idle(), idle()]);
// select は全ワールドを並べるので、単一ステージではなく登録全体を渡す。
const game = new Game(input, pose === "select" ? STAGES : data, { touchMode });
// pose=select のときだけワールド選択画面のまま焼く
if (pose !== "select") game.start();

const step = (n: number): void => {
  for (let i = 0; i < n; i++) game.step(DT);
};
const [p1, p2] = game.players;

switch (pose) {
  // --- 1-1 Boost & Hold ---
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
    step(5);
    p1!.teleport(35 * TILE, 15 * TILE);
    p2!.teleport(35 * TILE + 30, 15 * TILE);
    break;

  // --- 1-2 Both at Once: 2枚同時 ---
  case "both":
    p1!.teleport(4 * TILE, 15 * TILE); // 地上の板A
    p2!.teleport(19 * TILE, 12 * TILE); // 棚の上の板B
    break;

  // --- 1-3 Bridge: 踏むと橋が架かる ---
  case "bridge":
    p1!.teleport(12 * TILE, 12 * TILE); // 手前の板
    p2!.teleport(16 * TILE, 12 * TILE); // 渡ろうとしている側
    break;

  // --- 2-4 Tower: 中段で A から B へ乗り継ぐ瞬間 ---
  case "transfer":
    p1!.teleport(2 * TILE + 8, 15 * TILE); // 地上の板を踏み続ける
    p2!.teleport(9 * TILE, 14 * TILE); // 足場Aの上
    step(150); // A が中段へ、B が中段へ降りてくるまで
    break;

  // --- 2-4 Tower: 上の板を踏み、島に取り残されている状態 ---
  case "island":
    p1!.teleport(9 * TILE, 14 * TILE); // 足場Aの上（下から呼ばれて上がる側）
    p2!.teleport(8 * TILE + 8, 3 * TILE); // 島の板
    step(150);
    break;

  default:
    break;
}

// ギミックの状態（ゲートの開閉など）を落ち着かせる
step(10);

const r = new RecordingRenderer(VIEW_W, VIEW_H);
game.render(r);

const canvas = new Canvas(VIEW_W * ZOOM, VIEW_H * ZOOM, PALETTE.letterbox);
rasterize(canvas, r.ops, ZOOM);

writeFileSync(out, encodePng(canvas));
console.log(
  `${out} (${canvas.w}x${canvas.h}) stage=${stageNo} "${data.name}" pose=${pose} phase=${game.phase} solids=${game.stage.solids().length}`,
);
