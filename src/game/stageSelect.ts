import type { StageData } from "./stageData";

/**
 * ステージの表示ラベル（Pico Park 風の "1-2"）。
 * ワールド内の通し番号は配列から数えるので、World 2 を足しても
 * JSON 側に番号を書き足す必要がない。
 */
export function stageLabel(stages: readonly StageData[], index: number): string {
  const stage = stages[index];
  if (!stage) return "?";
  let n = 0;
  for (let i = 0; i <= index; i++) {
    if (stages[i]!.world === stage.world) n++;
  }
  return `${stage.world}-${n}`;
}

/**
 * URL の ?stage= を解決する。
 *
 * 値は URL 由来の未検証入力なので、既知のステージと完全一致した場合だけ
 * 採用し、それ以外は黙って先頭に落とす。配列の添字として使う前に必ず
 * ここを通すこと（範囲外の添字や、DOM への流し込みを起こさないため）。
 *
 * "1-2" のようなラベルと "stage-02" のような id の両方を受け付ける。
 */
export function resolveStartIndex(
  stages: readonly StageData[],
  raw: string | null | undefined,
): number {
  if (!raw) return 0;
  const q = raw.trim().toLowerCase();
  if (!q) return 0;

  for (let i = 0; i < stages.length; i++) {
    if (stageLabel(stages, i).toLowerCase() === q) return i;
  }
  for (let i = 0; i < stages.length; i++) {
    if (stages[i]!.id.toLowerCase() === q) return i;
  }
  return 0;
}
