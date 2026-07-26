import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";
import { DT, TILE } from "../src/game/tuning";
import type { StageData } from "../src/game/stageData";
import type { GimmickParams } from "../src/game/gimmicks/types";

/**
 * 押せる箱。
 *
 * 箱そのものはほとんどコードを持たず、押し合いと「上に乗る」は
 * プレイヤー同士のために書いた Actor の経路を流用している。
 * つまりここで確かめているのは「既存の物理が人以外にも効くか」。
 */

/** 20x10。床の上面は row8 = y192。 */
function stage(gimmicks: GimmickParams[], spawns = [{ x: 3, y: 7 }, { x: 16, y: 7 }]): StageData {
  const wall = "#".repeat(20);
  const room = `#${".".repeat(18)}#`;
  return {
    id: "test",
    world: 9,
    name: "test",
    tileSize: TILE,
    grid: [wall, room, room, room, room, room, room, room, wall, wall],
    spawns,
    gimmicks,
  };
}

function idle(): PlayerInput {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false };
}

function run(data: StageData): {
  game: Game;
  input: ScriptedInput;
  step: (n?: number) => void;
} {
  const input = new ScriptedInput([idle(), idle()]);
  const game = new Game(input, data);
  game.start();
  return {
    game,
    input,
    step: (n = 1) => {
      for (let i = 0; i < n; i++) game.step(DT);
    },
  };
}

const crate = (x: number, y: number): GimmickParams => ({ type: "crate", x, y });

/** 箱の現在位置。Actor が動かした結果がそのまま aabb に出る。 */
function crateBox(game: Game): { x: number; y: number } {
  const g = game.stage.gimmicks.find((it) => it.type === "crate")!;
  return { x: g.aabb.x, y: g.aabb.y };
}

describe("押せる箱", () => {
  it("宙に置くと落ちて床に乗る", () => {
    const { game, step } = run(stage([crate(8, 2)]));
    step(60);
    expect(crateBox(game).y + TILE).toBe(8 * TILE);
  });

  it("プレイヤーが横から押すと動く", () => {
    const { game, input, step } = run(stage([crate(6, 7)], [{ x: 4, y: 7 }, { x: 16, y: 7 }]));
    const before = crateBox(game).x;

    for (let i = 0; i < 90; i++) {
      input.inputs[0] = { ...idle(), right: true };
      step(1);
    }

    expect(crateBox(game).x).toBeGreaterThan(before);
  });

  it("押すのをやめるとその場で止まる（慣性を持たない）", () => {
    const { game, input, step } = run(stage([crate(6, 7)], [{ x: 4, y: 7 }, { x: 16, y: 7 }]));
    for (let i = 0; i < 60; i++) {
      input.inputs[0] = { ...idle(), right: true };
      step(1);
    }
    input.inputs[0] = idle();
    // 押している側は摩擦で減速するので、入力を切った直後は数フレームぶん
    // 押し続ける。それが収まってから箱が自走しないことを見る。
    step(30);
    const settled = crateBox(game).x;

    step(90);

    expect(crateBox(game).x).toBe(settled);
  });

  it("箱の上に立てる", () => {
    // 箱の真上にスポーンさせ、落ちて箱に着地することを見る
    const { game, step } = run(stage([crate(8, 7)], [{ x: 8, y: 4 }, { x: 16, y: 7 }]));
    step(60);

    const p1 = game.players[0]!;
    expect(p1.box.y + p1.box.h).toBe(crateBox(game).y);
  });

  it("箱は感圧板を踏める（人の代わりになる）", () => {
    const { game, step } = run(
      stage([
        crate(8, 6), // 板の真上。落ちて乗る
        { type: "plate", x: 8, y: 7, w: 2, emit: "sw1" },
        { type: "gate", x: 12, y: 6, h: 2, listen: ["sw1"], mode: "all" },
      ]),
    );

    // ゲートは閉じている状態から始まる
    expect(game.stage.solids()).toHaveLength(1);

    step(60);

    expect(game.stage.solids()).toHaveLength(0); // 箱の重さで開いた
  });

  it("箱は鍵を拾えない（人限定）", () => {
    const { game, step } = run(
      stage([
        crate(8, 6),
        { type: "key", x: 8, y: 7, id: "key1" },
        { type: "goal", x: 15, y: 7, w: 2, requires: ["key1"], needAllPlayers: false },
      ]),
    );

    step(60);
    // 箱が鍵の上に乗っても回収されないので、ゴールは解錠されないまま
    game.players[0]!.teleport(15 * TILE, 7 * TILE);
    step(10);

    expect(game.phase).toBe("playing");
  });

  it("リセットで元の位置に戻る", () => {
    const { game, input, step } = run(stage([crate(6, 7)], [{ x: 4, y: 7 }, { x: 16, y: 7 }]));
    for (let i = 0; i < 60; i++) {
      input.inputs[0] = { ...idle(), right: true };
      step(1);
    }
    expect(crateBox(game).x).toBeGreaterThan(6 * TILE);

    game.stage.reset();
    expect(crateBox(game).x).toBe(6 * TILE);
  });

  it("箱の上に乗った相手を、箱を押すと一緒に運べる", () => {
    // P2 を箱の上に置き、P1 が箱を押す
    const { game, input, step } = run(
      stage([crate(8, 7)], [{ x: 6, y: 7 }, { x: 8, y: 6 }]),
    );
    step(10);
    const p2 = game.players[1]!;
    const before = p2.box.x;

    for (let i = 0; i < 90; i++) {
      input.inputs[0] = { ...idle(), right: true };
      step(1);
    }

    expect(p2.box.x).toBeGreaterThan(before);
  });
});
