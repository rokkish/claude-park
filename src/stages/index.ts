import type { StageData } from "../game/stageData";
import stage01 from "./stage-01.json";

// 全ステージのインポートを集約するモジュール (SPEC §1.1, §8.2)。
// ステージを追加する場合は、import を1行足して配列にエントリを1つ追加するだけでよい。
export const STAGES: StageData[] = [stage01 as StageData];
