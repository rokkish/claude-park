import type { AABB } from "../engine/aabb";
import { TileGrid } from "../engine/tilegrid";
import { createGimmick } from "./gimmicks/registry";
import type { Gimmick } from "./gimmicks/types";
import type { StageData } from "./stageData";

/**
 * ロード済みステージ。JSON から生成した静的地形とギミックのインスタンスをまとめる。
 * ギミックの type 解決は registry (createGimmick) に委ねるので、ここは
 * 「JSON → TileGrid + Gimmick[] の組み立て」以外の責務を持たない。
 */
export interface Stage {
  readonly data: StageData;
  readonly grid: TileGrid;
  readonly gimmicks: Gimmick[];
  /** spawn positions converted from tile coords to world px */
  readonly spawnsPx: readonly { x: number; y: number }[];
  /** gimmick-derived solids for this frame (gate closed => its box; open => nothing) */
  solidBoxes(): AABB[];
  reset(): void;
}

export function loadStage(data: StageData): Stage {
  const grid = TileGrid.fromRows(data.grid, data.tileSize);
  const spawnCtx = { tileSize: data.tileSize, grid };
  const gimmicks: Gimmick[] = data.gimmicks.map((params) => createGimmick(params, spawnCtx));

  // プレイヤーの当たり判定は 20x24px、高さがちょうど1タイルなので
  // タイル座標 (x,y) をそのまま px 化するだけで「タイル行 y の上面に立つ」形になる。
  const spawnsPx = data.spawns.map((s) => ({
    x: s.x * data.tileSize,
    y: s.y * data.tileSize,
  }));

  // solidBoxes() の戻り値を毎フレーム使い回し、GC 圧を避ける。
  const solids: AABB[] = [];

  return {
    data,
    grid,
    gimmicks,
    spawnsPx,

    solidBoxes(): AABB[] {
      solids.length = 0;
      for (const g of gimmicks) {
        const box = g.solidAABB?.();
        if (box) solids.push(box);
      }
      return solids;
    },

    reset(): void {
      for (const g of gimmicks) g.reset?.();
    },
  };
}
