import { beforeEach, describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";
import { DT, TILE } from "../src/game/tuning";
import type { StageData } from "../src/game/stageData";
import stage02 from "../src/stages/stage-02.json";

/**
 * ステージ2「Both at Once」の検証 (docs/SPEC.md §7.9)。
 * ゲートが `mode: "all"` で2つの板を listen しているため、片方だけでは開かず、
 * 2人が同時に別々の場所（地上と棚の上）を踏まないと通れないことが証明対象。
 * 同時に踏んだ瞬間しか両者は自由に動けないので、`latch: true` が必須になる
 * こともあわせて固定する。
 */

/** 地面の上面 と 棚の上面（stage-02.json のグリッドから導かれる値）。 */
const GROUND_TOP = 16 * TILE; // 384
const SHELF_TOP = 13 * TILE; // 312

function idle(): PlayerInput {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false };
}

function newGame(): { game: Game; input: ScriptedInput } {
  const input = new ScriptedInput([idle(), idle()]);
  const game = new Game(input, stage02 as StageData);
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

describe("ステージ2のジオメトリ", () => {
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
    // 棚の左隣（タイル16、棚はタイル17から）から真上に跳ぶ
    p1!.teleport(16 * TILE, 15 * TILE);

    let highestFeet = Infinity;
    run(game, input, 120, (i) => {
      input.inputs[0] = { left: false, right: false, jumpHeld: true, jumpPressed: i === 0 };
      input.inputs[1] = idle();
      highestFeet = Math.min(highestFeet, p1!.box.y + p1!.box.h);
    });

    // 到達点は 384 - 62.5 ≒ 321。棚の上面 312 には届かない (SPEC §3.6)。
    expect(highestFeet).toBeGreaterThan(SHELF_TOP);
    expect(highestFeet).toBeLessThan(GROUND_TOP - 55); // 跳べてはいる
  });
});

describe("感圧板2枚 → ゲート（同時押し必須 + ラッチ）", () => {
  it("板A（地上）だけ踏んでもゲートは閉じたまま", () => {
    const { game, input } = newGame();
    const [p1] = game.players;
    p1!.teleport(4 * TILE, 15 * TILE);

    run(game, input, 10);

    expect(game.stage.solidBoxes()).toHaveLength(1);
  });

  it("板B（棚の上）だけ踏んでもゲートは閉じたまま", () => {
    const { game, input } = newGame();
    const [p1] = game.players;
    p1!.teleport(19 * TILE, 12 * TILE);

    run(game, input, 10);

    expect(game.stage.solidBoxes()).toHaveLength(1);
  });

  it("2人が同時に両方の板を踏むとゲートが開く", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    p1!.teleport(4 * TILE, 15 * TILE); // 板A（地上）
    p2!.teleport(19 * TILE, 12 * TILE); // 板B（棚の上）

    run(game, input, 10);

    expect(game.stage.solidBoxes()).toHaveLength(0);
  });

  it("ラッチ: 一度両方踏めば板から離れても開いたまま。reset() で再び閉じる", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    p1!.teleport(4 * TILE, 15 * TILE);
    p2!.teleport(19 * TILE, 12 * TILE);
    run(game, input, 10);
    expect(game.stage.solidBoxes()).toHaveLength(0);

    // 2人とも板から離れる。latch が無ければここで閉じてしまい、
    // 「同時に踏んだ後、それぞれ別行動で合流する」という想定解法が壊れる。
    p1!.teleport(2 * TILE, 15 * TILE);
    p2!.teleport(30 * TILE, 15 * TILE);
    run(game, input, 10);
    expect(game.stage.solidBoxes()).toHaveLength(0);

    // ステージリセットでラッチ状態も初期化され、再び塞がる
    game.stage.reset();
    run(game, input, 5);
    expect(game.stage.solidBoxes()).toHaveLength(1);
  });
});
