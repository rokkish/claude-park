import type { StageData } from "../game/stageData";
import stage01 from "./stage-01.json";
import stage02 from "./stage-02.json";
import stage03 from "./stage-03.json";
import stage04 from "./stage-04.json";
import stage05 from "./stage-05.json";
import stage06 from "./stage-06.json";

// 全ステージのインポートを集約するモジュール (SPEC §1.1, §8.2)。
// ステージを追加する場合は、import を1行足して配列にエントリを1つ追加するだけでよい。
export const STAGES: StageData[] = [
  stage01 as StageData,
  stage02 as StageData,
  stage03 as StageData,
  stage04 as StageData,
  stage05 as StageData,
  stage06 as StageData,
];
