import type { AABB } from "../engine/aabb";

/**
 * ギミックと描画層に公開するプレイヤーの面。
 * Player クラス（engine 物理を持つ本体）がこれを implements する。
 *
 * ギミックが物理内部を直接いじると衝突解決が壊れるため、
 * 触ってよいものをここに限定する。
 */
export interface PlayerState {
  readonly index: number;
  /** 当たり判定。位置の書き換えは respawn() 経由でのみ行う。 */
  readonly box: AABB;

  facing: 1 | -1;
  vx: number;
  vy: number;
  grounded: boolean;

  /** 1 = 通常, <1 = 潰れ, >1 = 伸び (SPEC §6.2)。 */
  squash: number;
  /** 頭に他プレイヤーが乗っているか。表情に反映する。 */
  carrying: boolean;

  /** スポーン地点へ戻す（圧殺・落下などの復帰）。 */
  respawn(): void;
}
