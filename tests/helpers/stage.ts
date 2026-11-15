import { expect } from "vitest";
import { bottom, type AABB } from "../../src/engine/aabb";
import { ScriptedInput, idleInput } from "../../src/engine/input";
import { Game } from "../../src/game/game";
import type { Player } from "../../src/game/player";
import type { StageData } from "../../src/game/stageData";
import { DT } from "../../src/game/tuning";
import {
  describePlayers,
  nthGimmick,
  placeOnTile,
  pressKeys,
  rideOnBox,
} from "../../scripts/lib/pose";

/**
 * ステージテストの土台。
 *
 * 各ステージのテストが毎回書き直していた「Game を作る・ステップを回す・
 * テレポートで配置する」をまとめる。通しクリアテストが 20 行程度で書けるので、
 * ステージ追加の受け入れ条件として必須にできる。
 *
 *   const s = newStage(stage05);
 *   standOn(s.p1, 4, 15);            // 板を踏む
 *   s.step(120);
 *   rideOn(s.p2, platform(s, 1));    // 降りてきた足場に乗る
 *   ...
 *   expectCleared(s);
 *
 * 座標はステージ JSON と同じタイル座標（床が行16なら、立つのは行15）。
 */

/** 何も押していない入力。 */
export const idle = idleInput;

export interface StageRig {
  readonly game: Game;
  readonly input: ScriptedInput;
  readonly data: StageData;
  readonly players: readonly Player[];
  readonly p1: Player;
  readonly p2: Player;
  /** n ステップ進める（既定 1）。入力は直前に設定したものが続く。 */
  step(n?: number): void;
}

/** ステージを読み込み、選択画面を飛ばして開始する。JSON の import をそのまま渡せる。 */
export function newStage(data: unknown): StageRig {
  const stage = data as StageData;
  const input = new ScriptedInput(stage.spawns.map(idle));
  const game = new Game(input, stage);
  game.start();
  return {
    game,
    input,
    data: stage,
    players: game.players,
    p1: game.players[0]!,
    p2: game.players[1]!,
    step(n = 1) {
      for (let i = 0; i < n; i++) game.step(DT);
    },
  };
}

/**
 * タイル (tx, ty) に立たせる。ty は立つ行（床の1つ上）。
 * dx は px のずらし。2人を同じタイルの近くに並べるときに使う。
 */
export const standOn: (player: Player, tx: number, ty: number, dx?: number) => void = placeOnTile;

/** 矩形の上の中央に乗せる。足場・箱（矩形そのもの）でも、相方（box を持つもの）でもよい。 */
export function rideOn(player: Player, target: AABB | { readonly box: AABB }): void {
  rideOnBox(player, "box" in target ? target.box : target);
}

/** type が一致する n 番目（0始まり）のギミックの矩形。位置は毎フレーム変わり得るので都度呼ぶ。 */
export function gimmickBox(s: StageRig, type: string, n = 0): AABB {
  return nthGimmick(s.game, type, n).aabb;
}

/** n 番目の足場の、いまの矩形。 */
export function platform(s: StageRig, n = 0): AABB {
  return gimmickBox(s, "platform", n);
}

/** n 番目の箱の、いまの矩形。 */
export function crate(s: StageRig, n = 0): AABB {
  return gimmickBox(s, "crate", n);
}

/** n 番目のゲートが閉じている（＝通れない）か。 */
export function gateClosed(s: StageRig, n = 0): boolean {
  return nthGimmick(s.game, "gate", n).solidAABB?.() != null;
}

/** 足元の y (px)。「床の上面に立っている」の確認に使う。 */
export function feet(player: Player): number {
  return bottom(player.box);
}

export interface WalkOptions {
  /** 真になったら止まる。毎ステップの後に評価する。 */
  until?: () => boolean;
  /** 歩いている間ジャンプを押し続けるか（最初のステップで踏み切る）。 */
  jump?: boolean;
}

function walk(s: StageRig, player: Player, dir: -1 | 1, frames: number, opts: WalkOptions): number {
  const keys = { left: dir < 0, right: dir > 0, jump: opts.jump };
  return pressKeys(s.game, s.input, player.index, keys, frames, opts.until);
}

/**
 * 実際の入力で右へ歩かせる（テレポートではなく物理を通す）。壁・ゲート・押し合いが効く。
 * frames ステップ歩くか、until が真になったら止まって入力を離す。歩いたステップ数を返す。
 */
export function walkRight(s: StageRig, player: Player, frames: number, opts: WalkOptions = {}): number {
  return walk(s, player, 1, frames, opts);
}

/** walkRight の左向き。箱を押し込むときなど。 */
export function walkLeft(s: StageRig, player: Player, frames: number, opts: WalkOptions = {}): number {
  return walk(s, player, -1, frames, opts);
}

/**
 * クリアに至ったことを確かめる。ゴールの判定は次のステップで走るので、少し進めてから見る。
 * 落ちたときは、どこで止まっているかをメッセージに出す。
 */
export function expectCleared(s: StageRig): void {
  for (let i = 0; i < 10 && s.game.phase !== "cleared"; i++) s.step();
  const goals = s.data.gimmicks
    .filter((g) => g.type === "goal")
    .map((g) => `goal(${g.x},${g.y}) requires=${JSON.stringify(g.requires ?? [])}`)
    .join(" ");
  expect(
    s.game.phase,
    `${s.data.id}: クリアしていない。${describePlayers(s.game)} / ${goals}`,
  ).toBe("cleared");
}
