import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";
import { DT, TILE } from "../src/game/tuning";
import type { StageData } from "../src/game/stageData";
import type { GimmickParams } from "../src/game/gimmicks/types";

/**
 * 動く足場。ギミック単体ではなく Game 経由で確かめる。
 * gimmick が box を動かす → stage.solids() が拾う → moveSolids が乗員を運ぶ、
 * という経路全体が繋がっていないと意味がないため。
 */

/**
 *  20x10。床の上面は row8 = y192。足場は row6 (y144..168) に浮かせる。
 */
function stage(gimmicks: GimmickParams[]): StageData {
  const wall = "#".repeat(20);
  const room = `#${".".repeat(18)}#`;
  return {
    id: "test",
    world: 9,
    name: "test",
    tileSize: TILE,
    grid: [wall, room, room, room, room, room, room, room, wall, wall],
    // P1 は足場の上、P2 は地面の左端に置く
    spawns: [
      { x: 5, y: 5 },
      { x: 2, y: 7 },
    ],
    gimmicks,
  };
}

function idle(): PlayerInput {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false };
}

function run(data: StageData): { game: Game; step: (n?: number) => void } {
  const game = new Game(new ScriptedInput([idle(), idle()]), data);
  game.start();
  return {
    game,
    step: (n = 1) => {
      for (let i = 0; i < n; i++) game.step(DT);
    },
  };
}

const movingPlatform = (over: Partial<GimmickParams> = {}): GimmickParams => ({
  type: "platform",
  x: 5,
  y: 6,
  w: 3,
  h: 1,
  to: { x: 12, y: 6 },
  speed: 80,
  ...over,
});

describe("動く足場", () => {
  it("乗っているプレイヤーを一緒に運ぶ", () => {
    const { game, step } = run(stage([movingPlatform()]));
    const p1 = game.players[0]!;
    expect(p1.box.y + p1.box.h).toBe(6 * TILE); // 足場の上に立っている

    const startX = p1.box.x;
    step(60); // 1秒 = 80px

    expect(p1.box.x - startX).toBeGreaterThan(70);
    expect(p1.box.y + p1.box.h).toBe(game.stage.solids()[0]!.box.y); // 乗ったまま
  });

  it("地面にいるプレイヤーは運ばれない", () => {
    const { game, step } = run(stage([movingPlatform()]));
    const p2 = game.players[1]!;
    const startX = p2.box.x;

    step(60);

    expect(p2.box.x).toBe(startX);
  });

  it("終点に着くと折り返す", () => {
    const { game, step } = run(stage([movingPlatform()]));
    const solid = () => game.stage.solids()[0]!.box.x;

    // 終点を通り過ぎないこと（クランプ）と、折り返すことの両方を見る。
    let maxX = -Infinity;
    for (let i = 0; i < 150; i++) {
      step(1);
      maxX = Math.max(maxX, solid());
    }

    expect(maxX).toBe(12 * TILE); // 終点でぴたりと止まる
    expect(solid()).toBeLessThan(maxX); // その後戻っている
  });

  it("listen 指定時は信号が立っている間だけ終点へ進む", () => {
    const { game, step } = run(
      stage([
        movingPlatform({ listen: ["sw1"] }),
        { type: "plate", x: 2, y: 7, w: 2, emit: "sw1" },
      ]),
    );
    const solid = () => game.stage.solids()[0]!.box.x;
    const start = solid();

    // P2 は板の上に居るので信号が立ち、足場が動き出す
    step(60);
    const moved = solid();
    expect(moved).toBeGreaterThan(start);

    // 板から降ろすと始点へ戻る
    game.players[1]!.teleport(10 * TILE, 7 * TILE);
    step(60);
    expect(solid()).toBeLessThan(moved);
  });

  it("from と to を入れ替えるだけで逆位相になる", () => {
    const { game, step } = run(
      stage([
        // 同じ信号で、片方は上へ、片方は下へ
        { type: "platform", x: 5, y: 6, w: 2, h: 1, to: { x: 5, y: 3 }, speed: 80, listen: ["sw1"] },
        { type: "platform", x: 14, y: 3, w: 2, h: 1, to: { x: 14, y: 6 }, speed: 80, listen: ["sw1"] },
        { type: "plate", x: 2, y: 7, w: 2, emit: "sw1" },
      ]),
    );
    const a = () => game.stage.solids()[0]!.box.y;
    const b = () => game.stage.solids()[1]!.box.y;
    const a0 = a();
    const b0 = b();

    step(30);

    expect(a()).toBeLessThan(a0); // 上へ
    expect(b()).toBeGreaterThan(b0); // 下へ
  });

  it("リセットで始点に戻り、乗員を道連れにしない", () => {
    const { game, step } = run(stage([movingPlatform()]));
    const p1 = game.players[0]!;
    step(60);
    const carriedX = p1.box.x;
    expect(carriedX).toBeGreaterThan(5 * TILE);

    game.stage.reset();
    // reset は瞬間移動なので、この時点で始点に戻っている
    expect(game.stage.solids()[0]!.box.x).toBe(5 * TILE);

    // 次のステップで足場は再び動き出すが、離れた場所にいるプレイヤーを
    // 道連れにはしない（reset で dx/dy を 0 に戻しているため）
    step(1);
    expect(p1.box.x).toBe(carriedX);
  });
});
