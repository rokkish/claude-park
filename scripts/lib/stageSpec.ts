import { readFileSync } from "node:fs";
import type { StageData } from "../../src/game/stageData";
import { findStageIndex, stageLabel } from "../../src/game/stageSelect";
import { STAGES } from "../../src/stages/index";

/**
 * コマンドラインのステージ指定を解決する。
 * ラベル (2-4) / id (stage-11) / 配列での順番 (8) / .json のパス（未登録のステージ）。
 * 見つからなければ throw する。
 */
export function resolveStage(spec: string): { data: StageData; label: string } {
  if (spec.endsWith(".json")) {
    return { data: JSON.parse(readFileSync(spec, "utf8")) as StageData, label: spec };
  }
  const index = /^\d+$/.test(spec) ? Number(spec) - 1 : findStageIndex(STAGES, spec);
  const data = index === null ? undefined : STAGES[index];
  if (index === null || !data) {
    throw new Error(
      `ステージ "${spec}" が見つかりません（ラベル / id / 1..${STAGES.length} / .json のパス）`,
    );
  }
  return { data, label: stageLabel(STAGES, index) };
}
