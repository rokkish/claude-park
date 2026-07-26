import type { StageData } from "../game/stageData";

/**
 * ワールドのキーアイデア名。
 * Pico Park に倣い「1ワールド1キーアイデア」で、選択画面にはこれを出す。
 * ワールドを足すときは、ここに1行足してステージ JSON の world を合わせるだけ。
 */
export const WORLD_NAMES: Record<number, string> = {
  1: "スイッチ",
  2: "動く足場",
};

export interface WorldEntry {
  world: number;
  /** キーアイデア名。未登録なら "?" を出して気付けるようにする。 */
  name: string;
  /** STAGES 内での先頭ステージの位置。選択したらここから始める。 */
  firstIndex: number;
  stageCount: number;
}

/**
 * 登録済みステージからワールド一覧を組み立てる。
 * 一覧を別に持つと、ステージを足したときに更新し忘れて食い違う。
 */
export function listWorlds(stages: readonly StageData[]): WorldEntry[] {
  const out: WorldEntry[] = [];
  stages.forEach((stage, index) => {
    const found = out.find((w) => w.world === stage.world);
    if (found) {
      found.stageCount++;
      return;
    }
    out.push({
      world: stage.world,
      name: WORLD_NAMES[stage.world] ?? "?",
      firstIndex: index,
      stageCount: 1,
    });
  });
  return out.sort((a, b) => a.world - b.world);
}
