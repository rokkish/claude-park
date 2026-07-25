import { beforeEach, describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";
import { DT, TILE } from "../src/game/tuning";
import type { StageData } from "../src/game/stageData";
import stage01 from "../src/stages/stage-01.json";

/**
 * ステージ1が「単独では不可能・2人なら可能」になっているかの検証 (SPEC §7.5)。
 * ここが PoC の証明対象なので、数値の検算をテストとして固定しておく。
 */

/** 地面の上面 と 棚の上面（SPEC §7.2 のグリッドから導かれる値）。 */
const GROUND_TOP = 16 * TILE; // 384
const SHELF_TOP = 13 * TILE; // 312

function idle(): PlayerInput {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false };
}

function newGame(): { game: Game; input: ScriptedInput } {
  const input = new ScriptedInput([idle(), idle()]);
  const game = new Game(input, stage01 as StageData);
  game.start();
  return { game, input };
}

/** steps ステップ進める。each で毎ステップ入力を組み立てられる。 */
function run(
  game: Game,
  input: ScriptedInput,
  steps: number,
  each?: (i: number) => void,
): void {
  for (let i = 0; i < steps; i++) {
    each?.(i);
    game.step(DT);
  }
  void input;
}

describe("ステージ1のジオメトリ", () => {
  let game: Game;
  let input: ScriptedInput;

  beforeEach(() => {
    ({ game, input } = newGame());
  });

  it("スポーンは2人ぶん、地面の上に立っている", () => {
    expect(game.players).toHaveLength(2);
    for (const p of game.players) {
      expect(p.box.y + p.box.h).toBe(GROUND_TOP);
    }
  });

  it("単独ジャンプでは棚(3タイル)に足が届かない", () => {
    const [p1, p2] = game.players;
    // 相手を遠ざけて、完全に単独の条件にする
    p2!.teleport(30 * TILE, 15 * TILE);
    // 棚の左隣（タイル12）から真上に跳ぶ
    p1!.teleport(12 * TILE, 15 * TILE);

    let highestFeet = Infinity;
    run(game, input, 120, (i) => {
      input.inputs[0] = { left: false, right: false, jumpHeld: true, jumpPressed: i === 0 };
      input.inputs[1] = idle();
      highestFeet = Math.min(highestFeet, p1!.box.y + p1!.box.h);
    });

    // 到達点は 384 - 62.5 ≒ 321。棚の上面 312 には届かない。
    expect(highestFeet).toBeGreaterThan(SHELF_TOP);
    expect(highestFeet).toBeLessThan(GROUND_TOP - 55); // 跳べてはいる
  });

  it("相手の頭に乗ってから跳べば棚に上がれる", () => {
    const [p1, p2] = game.players;
    p1!.teleport(12 * TILE, 15 * TILE); // 土台
    p2!.teleport(12 * TILE, 14 * TILE); // その頭の上

    // 「棚に立てたか」で判定する。押しっぱなしだと棚の右端から
    // エリアBへ降りてしまうが、それは想定解法どおりの動きなので
    // 最終位置ではなく到達したことを見る。
    let reachedShelf = false;
    run(game, input, 90, (i) => {
      input.inputs[0] = idle(); // 土台は動かない
      input.inputs[1] = { left: false, right: true, jumpHeld: true, jumpPressed: i === 0 };
      if (p2!.grounded && p2!.box.y + p2!.box.h === SHELF_TOP && p2!.box.x >= 13 * TILE) {
        reachedShelf = true;
      }
    });

    expect(reachedShelf).toBe(true);
  });
});

describe("感圧板 → ゲート", () => {
  it("板に乗るとゲートの Solid が消え、降りると戻る", () => {
    const { game, input } = newGame();
    const [p1] = game.players;

    // 閉じている間、ゲートは Solid を1つ提供している
    run(game, input, 5);
    expect(game.stage.solidBoxes()).toHaveLength(1);

    // 棚の上の感圧板（タイル15〜16）に立たせる
    p1!.teleport(15 * TILE, 12 * TILE);
    run(game, input, 10);
    expect(game.stage.solidBoxes()).toHaveLength(0);

    // 板から降ろすと再び塞がる
    p1!.teleport(2 * TILE, 15 * TILE);
    run(game, input, 10);
    expect(game.stage.solidBoxes()).toHaveLength(1);
  });

  it("閉じたゲートは地上の通路を実際に塞ぐ", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    p2!.teleport(2 * TILE, 15 * TILE);
    p1!.teleport(10 * TILE, 15 * TILE);

    // 右へ走り続けてもエリアBへは行けない
    run(game, input, 240, () => {
      input.inputs[0] = { left: false, right: true, jumpHeld: false, jumpPressed: false };
      input.inputs[1] = idle();
    });

    // ゲートはタイル18（px432）。その手前で止まっているはず。
    expect(p1!.box.x + p1!.box.w).toBeLessThanOrEqual(18 * TILE);
  });

  it("相方が板を踏んでいる間だけ、地上のプレイヤーはエリアBへ抜けられる", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    p1!.teleport(10 * TILE, 15 * TILE);
    p2!.teleport(15 * TILE, 12 * TILE); // 棚の上の感圧板に乗せる

    run(game, input, 240, () => {
      input.inputs[0] = { left: false, right: true, jumpHeld: false, jumpPressed: false };
      input.inputs[1] = idle();
    });

    // 仕切り壁（タイル18）を越えてエリアBに入れている
    expect(p1!.box.x).toBeGreaterThan(19 * TILE);
  });
});

describe("クリア条件", () => {
  const GOAL_X = 35 * TILE;

  function collectKey(game: Game, input: ScriptedInput): void {
    game.players[0]!.teleport(25 * TILE, 15 * TILE);
    run(game, input, 5);
  }

  it("鍵が無ければ、2人が揃ってもクリアにならない", () => {
    const { game, input } = newGame();
    game.players[0]!.teleport(GOAL_X, 15 * TILE);
    game.players[1]!.teleport(GOAL_X + 30, 15 * TILE);

    run(game, input, 20);

    expect(game.phase).toBe("playing");
  });

  it("鍵を取っても1人だけではクリアにならない", () => {
    const { game, input } = newGame();
    collectKey(game, input);

    game.players[0]!.teleport(GOAL_X, 15 * TILE);
    game.players[1]!.teleport(2 * TILE, 15 * TILE);
    run(game, input, 20);

    expect(game.phase).toBe("playing");
  });

  it("鍵を取って2人が揃うとクリアになる", () => {
    const { game, input } = newGame();
    collectKey(game, input);

    game.players[0]!.teleport(GOAL_X, 15 * TILE);
    game.players[1]!.teleport(GOAL_X + 30, 15 * TILE);
    run(game, input, 20);

    expect(game.phase).toBe("cleared");
  });
});
