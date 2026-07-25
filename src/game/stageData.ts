import type { GimmickParams } from "./gimmicks/types";

/** ステージ JSON のスキーマ (SPEC §7.7)。 */
export interface StageData {
  id: string;
  name: string;
  /** 所属ワールド。1ワールド1キーアイデアで、HUD の "1-2" 表記に使う。 */
  world: number;
  tileSize: number;
  /** ASCII 行。文字は engine/tilegrid.ts の TILE_LEGEND に従う。 */
  grid: string[];
  /** プレイヤーのスポーン位置（タイル座標）。配列長 = プレイヤー数。 */
  spawns: { x: number; y: number }[];
  gimmicks: GimmickParams[];
}
