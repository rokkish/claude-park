/**
 * ステージ JSON の機械検査と、面どうしの隙間を到達力と突き合わせた表。
 *
 *   npx vite-node scripts/check-stage.ts                 登録済みの全ステージを検査（結果だけ）
 *   npx vite-node scripts/check-stage.ts 2-4             1ステージを検査し、表も出す
 *   npx vite-node scripts/check-stage.ts stage-11 3-1    複数指定
 *   npx vite-node scripts/check-stage.ts src/stages/stage-16.json   未登録の JSON を直接
 *
 * ステージの指定: ラベル (2-4) / id (stage-11) / 配列での順番 (8) / .json のパス
 *
 * オプション（vite-node に食われないよう、ステージ指定の後ろに書く）:
 *   --table     全ステージ検査でも表を出す
 *   --no-table  ステージを指定しても表を出さない
 *   --all       どの跳び方でも大きく届かない組も表に出す
 *
 * error が1件でもあれば終了コード 1。検査の中身は src/game/stageCheck.ts。
 */
import { readFileSync } from "node:fs";
import { checkStage, formatReport } from "../src/game/stageCheck";
import type { StageData } from "../src/game/stageData";
import { findStageIndex, stageLabel } from "../src/game/stageSelect";
import { STAGES } from "../src/stages/index";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const specs = args.filter((a) => !a.startsWith("--"));
for (const f of flags) {
  if (!["--table", "--no-table", "--all"].includes(f)) {
    console.error(`未知のオプション: ${f}`);
    process.exit(2);
  }
}

interface Target {
  label: string;
  data: StageData;
}

function resolve(spec: string): Target {
  if (spec.endsWith(".json")) {
    return { label: spec, data: JSON.parse(readFileSync(spec, "utf8")) as StageData };
  }
  const index = /^\d+$/.test(spec) ? Number(spec) - 1 : findStageIndex(STAGES, spec);
  const data = index === null ? undefined : STAGES[index];
  if (index === null || !data) {
    console.error(`ステージ "${spec}" が見つかりません（ラベル / id / 1..${STAGES.length} / .json のパス）`);
    process.exit(2);
  }
  return { label: stageLabel(STAGES, index), data };
}

const targets: Target[] =
  specs.length > 0
    ? specs.map(resolve)
    : STAGES.map((data, i) => ({ label: stageLabel(STAGES, i), data }));

const table = flags.has("--table") || (specs.length > 0 && !flags.has("--no-table"));
let errors = 0;
const out: string[] = [];
for (const t of targets) {
  const report = checkStage(t.data);
  errors += report.issues.filter((i) => i.level === "error").length;
  out.push(formatReport(t.data, report, t.label, { table, all: flags.has("--all") }));
}
console.log(out.join(table ? "\n\n" : "\n"));
if (errors > 0) {
  console.error(`\nerror ${errors} 件`);
  process.exit(1);
}
