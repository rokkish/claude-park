import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";
import { DT, TILE } from "../src/game/tuning";
import type { StageData } from "../src/game/stageData";
import stage06 from "../src/stages/stage-06.json";

/**
 * ステージ2-3「Tandem」の検証 (docs/SPEC.md §7.x)。
 * 常時往復する足場（信号なし）が192pxの谷を渡す唯一の手段。
 * 対岸の高い棚(72px)は単独ジャンプ(62.5px)では届かず、頭に乗ってからの
 * ジャンプ(86.5px)なら届く。もう1人をそこへ運ぶのが、信号駆動のリフト。
 */

/** 両岸の地面の上面。 */
const GROUND_TOP = 13 * TILE; // 312
/** 高い棚（対岸のゴール手前）の上面。 */
const LEDGE_TOP = 10 * TILE; // 240
/** 常時往復する足場の可動範囲（左端 x）。 */
const CYCLER_MIN_X = 12 * TILE; // 288
const CYCLER_MAX_X = 17 * TILE; // 408

function idle(): PlayerInput {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false };
}

function newGame(): { game: Game; input: ScriptedInput } {
  const input = new ScriptedInput([idle(), idle()]);
  const game = new Game(input, stage06 as StageData);
  game.start();
  return { game, input };
}

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

describe("ステージ2-3のジオメトリ", () => {
  it("スポーンは2人ぶん、地面の上に立っている", () => {
    const { game } = newGame();
    expect(game.players).toHaveLength(2);
    for (const p of game.players) {
      expect(p.box.y + p.box.h).toBe(GROUND_TOP);
    }
  });

  it("高い棚は対岸の地面から72px。単独ジャンプ(62.5)は届かず、頭に乗れば(86.5)届く", () => {
    expect(GROUND_TOP - LEDGE_TOP).toBe(72);
  });
});

describe("高い棚は単独では登れない", () => {
  it("対岸の地面から跳び続けても、頭に乗らない限り棚(72px)には届かない", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    // 相方を隔離
    p2!.teleport(3 * TILE, 12 * TILE);
    // 対岸の地面、棚の真下 (x 26-33) に置く
    p1!.teleport(28 * TILE, GROUND_TOP - 24);

    let highestFeet = Infinity;
    run(game, input, 180, (i) => {
      input.inputs[0] = { left: false, right: false, jumpHeld: true, jumpPressed: i === 0 };
      input.inputs[1] = idle();
      highestFeet = Math.min(highestFeet, p1!.box.y + p1!.box.h);
    });

    // 単独到達は 312 - 62.5 ≒ 249.5。棚の上面 240 には届かない。
    expect(highestFeet).toBeGreaterThan(LEDGE_TOP);
  });
});

describe("常時往復する足場（信号なし）", () => {
  it("乗っているプレイヤーを一緒に運ぶ", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    p2!.teleport(3 * TILE, 12 * TILE); // 隔離
    // 足場（リセット直後は始点 x=288）の上に乗せる
    p1!.teleport(13 * TILE, GROUND_TOP - 24);
    expect(p1!.box.y + p1!.box.h).toBe(game.stage.solids()[0]!.box.y);

    const startX = p1!.box.x;
    run(game, input, 30, () => {
      input.inputs[0] = idle();
      input.inputs[1] = idle();
    });

    expect(p1!.box.x).not.toBe(startX);
    expect(p1!.box.y + p1!.box.h).toBe(game.stage.solids()[0]!.box.y);
  });

  it("信号を送らなくても、往復し続けて両端で折り返す。可動範囲を外れない", () => {
    const { game, input } = newGame();
    const solidX = () => game.stage.solids()[0]!.box.x;

    let minX = Infinity;
    let maxX = -Infinity;
    run(game, input, 400, () => {
      minX = Math.min(minX, solidX());
      maxX = Math.max(maxX, solidX());
    });

    // 宣言した可動範囲を外れない
    expect(minX).toBeGreaterThanOrEqual(CYCLER_MIN_X);
    expect(maxX).toBeLessThanOrEqual(CYCLER_MAX_X);
    // 両端に実際に到達し、折り返している（往復していることの証拠）
    expect(minX).toBe(CYCLER_MIN_X);
    expect(maxX).toBe(CYCLER_MAX_X);
    void input;
  });
});

describe("信号駆動のリフト", () => {
  it("誰も棚の板を踏んでいなければ、リフトは棚の隣（高い位置）で待機する", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    p1!.teleport(3 * TILE, 12 * TILE);
    p2!.teleport(6 * TILE, 12 * TILE);

    run(game, input, 60);

    const lift = game.stage.solids()[1]!.box;
    expect(lift.x).toBe(23 * TILE);
    expect(lift.y).toBe(10 * TILE);
  });

  it("棚の板を踏むとリフトは谷の切り欠きまで降りる", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    p1!.teleport(3 * TILE, 12 * TILE);
    // p2 を棚の板 (27,9) の上に置く
    p2!.teleport(27 * TILE, 9 * TILE);

    run(game, input, 90, () => {
      input.inputs[0] = idle();
      input.inputs[1] = idle();
    });

    const lift = game.stage.solids()[1]!.box;
    expect(lift.y).toBe(13 * TILE); // 谷底の切り欠きの高さまで降りる
  });
});
