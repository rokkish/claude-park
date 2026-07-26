import type { Actor, SolidBody } from "../engine/physics";
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
  /** このフレームのギミック由来 Solid（閉じたゲート、動く床など）。 */
  solids(): SolidBody[];
  /** ギミックが持つ Actor（箱など）。ステージ内で不変なので毎フレーム作らない。 */
  readonly gimmickActors: readonly Actor[];
  reset(): void;
}

const ZERO_DELTA = { dx: 0, dy: 0 } as const;

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

  // 戻り値の配列を毎フレーム使い回し、GC 圧を避ける。
  const solids: SolidBody[] = [];

  // Actor はステージの寿命中ずっと同じインスタンス。毎フレーム集め直すと
  // 物理が同一性を追えなくなる（乗員判定は参照の一致で見ている）。
  const gimmickActors: Actor[] = [];
  for (const g of gimmicks) {
    const a = g.actor?.();
    if (a) gimmickActors.push(a);
  }

  return {
    data,
    grid,
    gimmicks,
    spawnsPx,
    gimmickActors,

    solids(): SolidBody[] {
      solids.length = 0;
      for (const g of gimmicks) {
        const box = g.solidAABB?.();
        if (!box) continue;
        // 動いた量の申告が無いギミックは静止扱い。搬送も押し出しも起きない。
        const d = g.solidDelta?.() ?? ZERO_DELTA;
        solids.push({ box, dx: d.dx, dy: d.dy });
      }
      return solids;
    },

    reset(): void {
      for (const g of gimmicks) g.reset?.();
    },
  };
}
