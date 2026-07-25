import type { Renderer } from "../engine/renderer";
import type { PlayerState } from "../game/entities";
import type { PlayerPalette } from "./palette";
import { paletteForPlayer } from "./palette";

/**
 * キャラクター描画に必要な情報の全て。
 * これ以外はスキンに渡さない＝スキンはゲームロジックに依存しない。
 */
export interface CharacterState {
  x: number;
  y: number;
  w: number;
  h: number;
  facing: 1 | -1;
  vx: number;
  vy: number;
  grounded: boolean;
  squash: number;
  carrying: boolean;
  color: PlayerPalette;
  /** 呼吸などの周期アニメ用。秒。 */
  time: number;
}

/**
 * 見た目の差し替え点 (SPEC §6.1)。
 * 公式アセットが入手できたら SpriteSkin を実装して差し替えるだけでよい。
 */
export interface CharacterSkin {
  draw(r: Renderer, s: CharacterState): void;
}

export function characterStateOf(p: PlayerState, time: number): CharacterState {
  return {
    x: p.box.x,
    y: p.box.y,
    w: p.box.w,
    h: p.box.h,
    facing: p.facing,
    vx: p.vx,
    vy: p.vy,
    grounded: p.grounded,
    squash: p.squash,
    carrying: p.carrying,
    color: paletteForPlayer(p.index),
    time,
  };
}
