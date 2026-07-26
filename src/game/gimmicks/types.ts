import type { AABB } from "../../engine/aabb";
import type { Actor } from "../../engine/physics";
import type { Renderer } from "../../engine/renderer";
import type { TileGrid } from "../../engine/tilegrid";
import type { OverlapSource, PlayerState } from "../entities";
import type { Inventory, SignalBus } from "../signals";

/** ギミックが update / onOverlap 中に触れてよいもの。 */
export interface GimmickContext {
  signals: SignalBus;
  inventory: Inventory;
  grid: TileGrid;
  players: readonly PlayerState[];
  /** ゴールが呼ぶ。以降のクリア演出はゲーム側の責務。 */
  requestClear(): void;
}

/** 生成時に渡される環境。ステージ本体には依存させない（循環を避けるため）。 */
export interface SpawnContext {
  tileSize: number;
  grid: TileGrid;
}

/**
 * ギミックの共通面 (SPEC §5.1)。
 * 必須は update / draw のみ。能力はオプショナルメソッドの有無で表明する。
 * 実装しなければそのコストは一切かからない。
 */
export interface Gimmick {
  readonly type: string;
  /** 判定・描画の基準矩形（ワールド px）。 */
  readonly aabb: AABB;

  update(dt: number, ctx: GimmickContext): void;
  draw(r: Renderer): void;

  /** 実装すると Solid になる。null を返す間はすり抜けられる（開いたゲート）。 */
  solidAABB?(): AABB | null;
  /**
   * この1ステップで Solid が動いた量。実装すると、乗っている Actor が
   * 同じだけ運ばれ、進路上の Actor が押し出される (SPEC §3.4)。
   * 動かないギミックは実装しなくてよい。
   */
  solidDelta?(): { dx: number; dy: number };
  /**
   * 実装すると重なり通知が来る（感圧板・鍵）。プレイヤーだけでなく
   * 箱なども渡ってくるので、人限定にしたいものは isPlayer を見ること。
   */
  onOverlap?(source: OverlapSource, ctx: GimmickContext): void;

  /**
   * 実装すると、このギミックが持つ Actor が物理世界に参加する（箱など）。
   * 押し合いと「上に乗る」は Actor 同士の既存経路がそのまま効く。
   */
  actor?(): Actor | null;
  /** ステージリセット時に初期状態へ戻す。 */
  reset?(): void;
}

/** ステージ JSON の 1 エントリ。x/y はタイル座標。 */
export interface GimmickParams {
  type: string;
  x: number;
  y: number;
  [key: string]: unknown;
}

export interface GimmickDef<P extends GimmickParams = GimmickParams> {
  readonly type: string;
  create(params: P, ctx: SpawnContext): Gimmick;
}
