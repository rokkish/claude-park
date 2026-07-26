import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";
import { DT, TILE } from "../src/game/tuning";
import type { StageData } from "../src/game/stageData";
import stage08 from "../src/stages/stage-08.json";

/**
 * ステージ3-2「Stepstool」の検証 (docs/SPEC.md §7.x, World 3)。
 *
 * 棚 (x=22〜27, y=12) は地面から4タイル=96px。頭に乗っただけ（boosted-only）
 * では feet=297.5 までしか届かず (288 に届かない)、箱の上に立ってから
 * 頭に乗る（box+boost）と feet=273.5 まで届く。この14.5pxの差が
 * このステージの核。
 */

const GROUND_TOP = 16 * TILE; // 384
const LEDGE_TOP = 12 * TILE; // 288

function idle(): PlayerInput {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false };
}

function newGame(): { game: Game; input: ScriptedInput } {
  const input = new ScriptedInput([idle(), idle()]);
  const game = new Game(input, stage08 as StageData);
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

describe("ステージ3-2のジオメトリ", () => {
  it("スポーンは2人ぶん、地面の上に立っている", () => {
    const { game } = newGame();
    expect(game.players).toHaveLength(2);
    for (const p of game.players) {
      expect(p.box.y + p.box.h).toBe(GROUND_TOP);
    }
  });

  it("棚は地面から96px（4タイル）", () => {
    expect(GROUND_TOP - LEDGE_TOP).toBe(96);
  });

  it("箱は地面に置かれている", () => {
    const { game } = newGame();
    const box = crateBox(game);
    expect(box.y + box.h).toBe(GROUND_TOP);
  });
});

describe("頭に乗っただけ（箱なし）では棚に届かない", () => {
  it("相方の頭からジャンプしても feet は 288 に届かない（297.5 止まり）", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    // p1 が土台、p2 が頭に乗ってからジャンプする。棚の真下あたりに位置取る。
    p1!.teleport(20 * TILE, 15 * TILE);
    p2!.teleport(20 * TILE, 15 * TILE - 24);
    run(game, 10);
    expect(p2!.box.y + p2!.box.h).toBe(p1!.box.y); // 頭の上に乗っている

    let lowestFeet = Infinity;
    run(game, 90, (i) => {
      input.inputs[1] = { left: false, right: false, jumpHeld: true, jumpPressed: i === 0 };
      input.inputs[0] = idle();
      lowestFeet = Math.min(lowestFeet, p2!.box.y + p2!.box.h);
    });

    // 単独+頭乗り = 24 + 62.5 = 86.5。384 - 86.5 = 297.5 で頭打ち
    // （離散シミュレーションなので数px の誤差は許容する）。
    expect(lowestFeet).toBeGreaterThan(LEDGE_TOP);
    expect(lowestFeet).toBeLessThan(310);
    expect(lowestFeet).toBeGreaterThan(290);
  });
});

describe("箱の上に立ってからのブースト（box+boost）なら棚に届く", () => {
  it("箱の上 → 頭 → ジャンプで feet が 288 以下になる", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    const box = crateBox(game);

    // p1 が箱の上に立ち、p2 が p1 の頭に乗ってからジャンプする。
    p1!.teleport(box.x, box.y - 24);
    run(game, 10);
    expect(p1!.box.y + p1!.box.h).toBe(box.y); // 箱の上に乗っている

    p2!.teleport(box.x, p1!.box.y - 24);
    run(game, 10);
    expect(p2!.box.y + p2!.box.h).toBe(p1!.box.y); // p1 の頭の上

    let lowestFeet = Infinity;
    run(game, 90, (i) => {
      input.inputs[1] = { left: false, right: false, jumpHeld: true, jumpPressed: i === 0 };
      input.inputs[0] = idle();
      lowestFeet = Math.min(lowestFeet, p2!.box.y + p2!.box.h);
    });

    expect(lowestFeet).toBeLessThanOrEqual(LEDGE_TOP);
  });
});

describe("想定手順で2人ともゴールに到達できる", () => {
  it("箱を棚の真下まで押し、踏み台にして鍵を取り、両者でゴールする", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    const step = (n: number, each?: (i: number) => void): void => run(game, n, each);

    // 1. 箱をスポーンから棚の左（x=21あたり）まで押す。
    p1!.teleport(9 * TILE, 15 * TILE);
    step(5);
    for (let i = 0; i < 400 && crateBox(game).x < 20 * TILE; i++) {
      input.inputs[0] = { ...idle(), right: true };
      game.step(DT);
    }
    input.inputs[0] = idle();
    step(5);

    const parked = crateBox(game);
    expect(parked.x).toBeLessThan(22 * TILE); // 棚 (22〜27) の左に隣接して止まっている
    expect(parked.y + parked.h).toBe(GROUND_TOP); // 地面の上（箱は登れていない）

    // 2. P1 が箱の上に立つ。
    p1!.teleport(parked.x, parked.y - 24);
    step(10);
    expect(p1!.box.y + p1!.box.h).toBe(parked.y);

    // 3. P2 が P1 の頭に乗ってからジャンプし、棚へ届く。
    p2!.teleport(parked.x, p1!.box.y - 24);
    step(10);
    expect(p2!.box.y + p2!.box.h).toBe(p1!.box.y);

    step(1, () => {
      input.inputs[1] = { left: false, right: true, jumpHeld: true, jumpPressed: true };
    });
    step(50, () => {
      input.inputs[1] = { left: false, right: true, jumpHeld: true, jumpPressed: false };
    });
    input.inputs[1] = idle();
    step(20);

    expect(p2!.box.y + p2!.box.h).toBeLessThanOrEqual(LEDGE_TOP); // 棚に到達

    // 4. 鍵を回収し、地面へ戻ってゴールへ。
    p2!.teleport(24 * TILE, 11 * TILE);
    step(10);
    p2!.teleport(35 * TILE, 15 * TILE);
    p1!.teleport(34 * TILE, 15 * TILE);
    step(10);

    expect(game.phase).toBe("cleared");
  });
});
