/**
 * ステージ全体を PNG に焼き出す開発用プレビュー。
 * 実際の Game.render() をそのまま走らせるので、タイル・ギミック・Clawd の
 * 配置と配色を、ブラウザを開かずに確認できる。
 *
 *   npx vite-node scripts/preview-stage.ts out.png [stage] [options]
 *
 * ポーズ（誰をどこに置き、何ステップ進めるか）は引数で指定する。ステージを
 * 足してもこのスクリプトを編集する必要は無い。
 *
 *   # スポーン直後
 *   npx vite-node scripts/preview-stage.ts out.png 2-4
 *   # P1 の頭に P2 が乗った状態
 *   npx vite-node scripts/preview-stage.ts out.png 1-1 --place p1=12,15 --ride p2=p1
 *   # 板を踏み続け、足場が動き終わるまで待った状態
 *   npx vite-node scripts/preview-stage.ts out.png 2-4 --place p1=2.33,15 --place p2=9,14 --hold 150
 *   # 未登録の JSON
 *   npx vite-node scripts/preview-stage.ts out.png src/stages/stage-16.json
 *
 * オプションは必ず out.png より後ろに書く（前に書くと vite-node が自分の
 * オプションとして解釈する）。全オプションは `--help` か scripts/lib/pose.ts の USAGE。
 */
import { writeFileSync } from "node:fs";
import { ScriptedInput, idleInput } from "../src/engine/input";
import { Game } from "../src/game/game";
import { DT, VIEW_H, VIEW_W } from "../src/game/tuning";
import { PALETTE } from "../src/art/palette";
import { STAGES } from "../src/stages/index";
import { applyPose, describePlayers, parsePreviewArgs } from "./lib/pose";
import { Canvas, RecordingRenderer, encodePng, rasterize } from "./lib/recorder";
import { resolveStage } from "./lib/stageSpec";

/** 引数やステージ指定の誤りは、メッセージだけ出して終了コード 2。 */
function orDie<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(2);
  }
}

const args = orDie(() => parsePreviewArgs(process.argv.slice(2)));
const { data, label } = orDie(() => resolveStage(args.stage));

const input = new ScriptedInput(data.spawns.map(idleInput));
// select は全ワールドを並べるので、単一ステージではなく登録全体を渡す。
// 既定はステージ全体を1枚に収める fit。follow は実際の追従カメラ。
const game = new Game(input, args.select ? STAGES : data, {
  touchMode: args.touch,
  camera: args.camera,
});

if (!args.select) {
  game.start();
  orDie(() => applyPose(game, input, args.actions));
}
// ギミックの状態（ゲートの開閉など）を落ち着かせる。選択画面では何も起きない。
for (let i = 0; i < args.settle; i++) game.step(DT);

const r = new RecordingRenderer(VIEW_W, VIEW_H);
game.render(r);

const canvas = new Canvas(VIEW_W * args.zoom, VIEW_H * args.zoom, PALETTE.letterbox);
rasterize(canvas, r.ops, args.zoom);

writeFileSync(args.out, encodePng(canvas));
console.log(
  args.select
    ? `${args.out} (${canvas.w}x${canvas.h}) select`
    : `${args.out} (${canvas.w}x${canvas.h}) ${label} ${data.id} "${data.name}" phase=${game.phase} ${describePlayers(game, 2)}`,
);
