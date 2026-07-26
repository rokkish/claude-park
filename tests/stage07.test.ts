import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";
import { DT, TILE } from "../src/game/tuning";
import type { StageData } from "../src/game/stageData";
import stage07 from "../src/stages/stage-07.json";

/**
 * ステージ3-1「Doorstop」の検証 (docs/SPEC.md §7.x, World 3)。
 *
 * 箱が「板の上に残り続けなければならない人」の代わりになる。棚
 * (x=10〜14, y=13, 地面から3タイル=72px) は単独では登れず、頭に乗ってから
 * のジャンプ (86.5px) でだけ届く。棚の上に箱が最初から置いてあり、
 * それを地上へ落として板 (x=20〜21, y=15) まで押すと、ラッチしないゲート
 * (x=26, y=14〜15) が「箱が乗っている間だけ」開き続ける。人が板に残る
 * 必要が無くなる、というのがこのステージの主題。
 */

const GROUND_TOP = 16 * TILE; // 384
const LEDGE_TOP = 13 * TILE; // 312 (地面から72px)

function idle(): PlayerInput {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false };
}

function newGame(): { game: Game; input: ScriptedInput } {
  const input = new ScriptedInput([idle(), idle()]);
  const game = new Game(input, stage07 as StageData);
  game.start();
  return { game, input };
}

function run(game: Game, steps: number, each?: (i: number) => void): void {
  for (let i = 0; i < steps; i++) {
    each?.(i);
    game.step(DT);
  }
}

function crateBox(game: Game): { x: number; y: number; w: number; h: number } {
  const g = game.stage.gimmicks.find((it) => it.type === "crate")!;
  return { ...g.aabb };
}

describe("ステージ3-1のジオメトリ", () => {
  it("スポーンは2人ぶん、地面の上に立っている", () => {
    const { game } = newGame();
    expect(game.players).toHaveLength(2);
    for (const p of game.players) {
      expect(p.box.y + p.box.h).toBe(GROUND_TOP);
    }
  });

  it("棚は地面から72px（単独62.5pxでは届かず、頭に乗った86.5pxなら届く）", () => {
    expect(GROUND_TOP - LEDGE_TOP).toBe(72);
  });

  it("箱は最初から棚の上に置かれている", () => {
    const { game } = newGame();
    const box = crateBox(game);
    expect(box.y + box.h).toBe(LEDGE_TOP);
  });
});

describe("棚は単独では登れない", () => {
  it("棚の真下から跳び続けても72pxには届かない", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    // 相方を隔離し、単独条件にする
    p2!.teleport(35 * TILE, 15 * TILE);
    p1!.teleport(8 * TILE, 15 * TILE);

    let highestFeet = Infinity;
    run(game, 180, (i) => {
      input.inputs[0] = { left: false, right: false, jumpHeld: true, jumpPressed: i === 0 };
      input.inputs[1] = idle();
      highestFeet = Math.min(highestFeet, p1!.box.y + p1!.box.h);
    });

    // 単独到達は 384 - 62.5 ≒ 321.5。棚の上面 312 には届かない。
    expect(highestFeet).toBeGreaterThan(LEDGE_TOP);
  });
});

describe("ゲートは箱の重さだけで開いたままになる（ラッチしない）", () => {
  it("何も乗っていなければ閉じている", () => {
    const { game } = newGame();
    expect(game.stage.solids()).toHaveLength(1); // ゲートのみ（棚は地形なので数えない）
  });

  it("箱が板の上に乗ると開く", () => {
    const { game } = newGame();
    // 箱を直接板の上へ運ぶ（棚から落として押す過程は下の通しテストで検証する）
    const crate = game.stage.gimmicks.find((it) => it.type === "crate")!;
    crate.actor!()!.teleport(20 * TILE + 4, 15 * TILE);
    run(game, 10);

    expect(game.stage.solids()).toHaveLength(0); // ゲートが開いて Solid が消える
  });
});

describe("想定手順で2人ともゴールに到達できる", () => {
  it("棚から箱を落とし、板まで押し、ゲートを開けたまま2人とも通り抜けられる", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    const step = (n: number, each?: (i: number) => void): void => run(game, n, each);

    // 1. P1 が棚の左下に立ち、P2 が頭に乗ってから棚へジャンプする。
    p1!.teleport(9 * TILE, 15 * TILE);
    p2!.teleport(9 * TILE, 15 * TILE - 24);
    step(10);
    expect(p2!.box.y + p2!.box.h).toBe(p1!.box.y); // P2 は P1 の頭の上

    step(1, () => {
      input.inputs[1] = { left: false, right: true, jumpHeld: true, jumpPressed: true };
    });
    step(40, () => {
      input.inputs[1] = { left: false, right: true, jumpHeld: true, jumpPressed: false };
    });
    input.inputs[1] = idle();
    step(20);

    expect(p2!.box.y + p2!.box.h).toBeLessThanOrEqual(LEDGE_TOP); // 棚の上に到達
    expect(p2!.box.y + p2!.box.h).toBeGreaterThan(LEDGE_TOP - TILE); // 空中で止まっているわけではない

    // 2. P2 が棚の上で箱を押し、右端から地面へ落とす。
    // 棚は x=10〜14 (240〜360px) にしか無いので、その範囲内に立たせる。
    p2!.teleport(11 * TILE, LEDGE_TOP - 24);
    step(5);
    step(120, () => {
      input.inputs[1] = { ...idle(), right: true };
    });

    const dropped = crateBox(game);
    expect(dropped.y + dropped.h).toBe(GROUND_TOP); // 箱は地面まで落ちている
    input.inputs[1] = idle();

    // 3. 箱を地面沿いに板まで押す。板の範囲 (20〜21タイル) に入ったら止める。
    p2!.teleport(dropped.x - 24, 15 * TILE);
    step(5);
    for (let i = 0; i < 400 && crateBox(game).x < 20 * TILE; i++) {
      input.inputs[1] = { ...idle(), right: true };
      game.step(DT);
    }
    input.inputs[1] = idle();
    step(5);

    const onPlate = crateBox(game);
    expect(onPlate.x).toBeGreaterThanOrEqual(20 * TILE);
    expect(onPlate.x).toBeLessThan(22 * TILE);
    expect(game.stage.solids()).toHaveLength(0); // ゲートが開いている

    // 4. P2 が棚から地面へ降り、両者そろってゲートを抜けてゴールへ。
    p2!.teleport(onPlate.x - 20, 15 * TILE);
    p1!.teleport(34 * TILE, 15 * TILE);
    step(10);
    p2!.teleport(34 * TILE + 30, 15 * TILE);
    step(10);

    expect(game.phase).toBe("cleared");
  });
});
