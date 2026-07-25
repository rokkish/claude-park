import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";
import { DT, PLAYER_H, TILE } from "../src/game/tuning";
import type { StageData } from "../src/game/stageData";
import stage03 from "../src/stages/stage-03.json";

/**
 * ステージ3「Bridge」の検証 (docs/SPEC.md §7.10)。
 * `mode: "none"` の反転ゲートが、谷（タイル18〜23、幅6タイル=144px）を
 * 塞ぐ「橋」として使われている。橋は誰も板を踏んでいないと非Solidになり
 * 谷底へ落ちる（＝地上のプレイヤーは自力では渡れない）。2人のどちらかが
 * 常にどちらかの板を踏んでいなければならないため、役割の受け渡しが要る。
 */

/** 地面（橋のかかる高さ）の上面。谷の左右どちらの陸地もここが床面。 */
const GROUND_TOP = 13 * TILE; // 312
/** 谷の右端（タイル24）。対岸に着いたかどうかの判定に使う。 */
const CHASM_RIGHT_X = 24 * TILE; // 576
/** グリッド外は Solid 扱いなので、谷底はグリッドの下端 (SPEC §3, engine/tilegrid.ts)。 */
const CHASM_FLOOR = 18 * TILE; // 432 (グリッドは18行)

function idle(): PlayerInput {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false };
}

function newGame(): { game: Game; input: ScriptedInput } {
  const input = new ScriptedInput([idle(), idle()]);
  const game = new Game(input, stage03 as StageData);
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

describe("ステージ3のジオメトリ", () => {
  it("スポーンは2人ぶん、地面の上に立っている", () => {
    const { game } = newGame();
    expect(game.players).toHaveLength(2);
    for (const p of game.players) {
      expect(p.box.y + p.box.h).toBe(GROUND_TOP);
    }
  });
});

describe("反転ゲート（橋）の開閉", () => {
  it("誰も踏んでいないと橋は非Solid（谷が開いている）", () => {
    const { game, input } = newGame();
    run(game, input, 10);
    expect(game.stage.solids()).toHaveLength(0);
  });

  it("近い方の板を踏むと橋がSolidになる", () => {
    const { game, input } = newGame();
    const [p1] = game.players;
    p1!.teleport(12 * TILE, 12 * TILE);

    run(game, input, 10);

    expect(game.stage.solids()).toHaveLength(1);
  });

  it("遠い方の板を踏んでも同じチャンネルなので橋がSolidになる", () => {
    const { game, input } = newGame();
    const [p1] = game.players;
    p1!.teleport(26 * TILE, 12 * TILE);

    run(game, input, 10);

    expect(game.stage.solids()).toHaveLength(1);
  });
});

describe("谷は単独では渡れない", () => {
  it("最大ジャンプ距離(約3.6タイル)では谷(6タイル)を越えられず、谷底へ落ちる", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    // 相手を遠ざけ、橋を誰も踏んでいない＝非Solidの状態にする
    p2!.teleport(35 * TILE, 12 * TILE);
    p1!.teleport(14 * TILE, 12 * TILE);

    let maxX = -Infinity;
    run(game, input, 180, (i) => {
      input.inputs[0] = { left: false, right: true, jumpHeld: true, jumpPressed: i === 0 };
      input.inputs[1] = idle();
      maxX = Math.max(maxX, p1!.box.x);
    });

    // 谷の向こう岸（タイル24）には一度も到達しない
    expect(maxX).toBeLessThan(CHASM_RIGHT_X);
    // 最終的に谷底へ落ちている（地面の上面より下＝y値が大きい）
    expect(p1!.box.y + p1!.box.h).toBeGreaterThan(GROUND_TOP);
  });

  it("谷底に落ちた後は、単独ジャンプでは地上まで登り返せない", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    p2!.teleport(35 * TILE, 12 * TILE);
    // 谷底（グリッド最下段の上面）に直接置く
    p1!.teleport(20 * TILE, CHASM_FLOOR - PLAYER_H);

    let highestFeet = Infinity;
    run(game, input, 120, (i) => {
      input.inputs[0] = { left: false, right: false, jumpHeld: true, jumpPressed: i === 0 };
      input.inputs[1] = idle();
      highestFeet = Math.min(highestFeet, p1!.box.y + p1!.box.h);
    });

    // 谷底から地面(312)までは120px。単独ジャンプの到達は62.5pxなので届かない。
    expect(highestFeet).toBeGreaterThan(GROUND_TOP);
  });
});

describe("受け渡しで渡れる", () => {
  it("片方が近い板に留まっている間、もう片方は橋を渡って対岸に立てる", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    p1!.teleport(12 * TILE, 12 * TILE); // 近い板の上で待機
    p2!.teleport(14 * TILE, 12 * TILE); // 対岸へ向かう側

    run(game, input, 180, () => {
      input.inputs[0] = idle(); // 板の上で動かない
      input.inputs[1] = { left: false, right: true, jumpHeld: false, jumpPressed: false };
    });

    expect(p2!.box.x).toBeGreaterThanOrEqual(CHASM_RIGHT_X);
    expect(p2!.box.y + p2!.box.h).toBe(GROUND_TOP);
  });
});
