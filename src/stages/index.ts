import type { StageData } from "../game/stageData";
import stage01 from "./stage-01.json";
import stage02 from "./stage-02.json";
import stage03 from "./stage-03.json";
import stage10 from "./stage-10.json";
import stage04 from "./stage-04.json";
import stage05 from "./stage-05.json";
import stage06 from "./stage-06.json";
import stage11 from "./stage-11.json";
import stage99 from "./stage-99.json";
import stage07 from "./stage-07.json";
import stage08 from "./stage-08.json";
import stage09 from "./stage-09.json";
import stage12 from "./stage-12.json";
import stage13 from "./stage-13.json";
import stage14 from "./stage-14.json";

// 全ステージのインポートを集約するモジュール (SPEC §1.1, §8.2)。
// ステージを追加する場合は、import を1行足して配列にエントリを1つ追加するだけでよい。
// stage-10 は World 1 の4本目 (1-4)、stage-11 は World 2 の4本目 (2-4)、
// stage-99 は World 2 の5本目 (2-5)、stage-12 は World 4 の1本目 (4-1)、
// stage-13 は 4-2、stage-14 は 4-3（80×18 のスクロールステージ）。
// id の番号は配列順とは無関係（SPEC §7.11）で、表示ラベルは world フィールドと
// この配列順だけが決める。既存 id の空き番号を使い、配列上は所属ワールドの
// 末尾に挿入する。
export const STAGES: StageData[] = [
  stage01 as StageData,
  stage02 as StageData,
  stage03 as StageData,
  stage10 as StageData,
  stage04 as StageData,
  stage05 as StageData,
  stage06 as StageData,
  stage11 as StageData,
  stage99 as StageData,
  stage07 as StageData,
  stage08 as StageData,
  stage09 as StageData,
  stage12 as StageData,
  stage13 as StageData,
  stage14 as StageData,
];
