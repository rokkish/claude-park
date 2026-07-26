import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";
import { DT, TILE } from "../src/game/tuning";
import type { StageData } from "../src/game/stageData";
import stage09 from "../src/stages/stage-09.json";

/**
 * ステージ3-3「Relay」の検証 (docs/SPEC.md §7.x, World 3)。
 *
 * 板A (x=2〜3, y=14) は1タイルの段差 (x=1〜4, y=15。地面から24px)
 * の上にあり、箱は水平にしか押せないのでこの段差には決して登れない
 * （人はジャンプ1発で登れる）。だから板Aは「人しか使えない」。
 * 箱はゲート (x=16) を抜けて、地面レベルの板B (x=22〜23) を踏むことで
 * 同じチャンネル "swA" を引き継ぎ、板Aから人が離れてもゲートが
 * 開いたままになる。
 *
 * 【設計メモ】もらった元の座標案は、板Aの段差 (row15, x=8〜11) が
 * 箱の唯一の通り道（スポーンからゲートへの地面レベルの一本道）を
 * 完全に塞いでいた。箱は縦には動けないので、一度もゲートへ到達
 * できず詰み盤面になる。物理・ギミック側は変更禁止という制約の
 * 下で、段差をスポーンより手前（箱が通る必要のない位置、x=1〜4）
 * に配置し直すことで、384→360 の1タイル段差という数値そのものは
 * 保ったまま解けるようにした。
 */

const GROUND_TOP = 16 * TILE; // 384
const STEP_TOP = 15 * TILE; // 360 (地面から24px)

function idle(): PlayerInput {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false };
}

function newGame(): { game: Game; input: ScriptedInput } {
  const input = new ScriptedInput([idle(), idle()]);
  const game = new Game(input, stage09 as StageData);
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

describe("ステージ3-3のジオメトリ", () => {
  it("スポーンは2人ぶん、地面の上に立っている", () => {
    const { game } = newGame();
    expect(game.players).toHaveLength(2);
    for (const p of game.players) {
      expect(p.box.y + p.box.h).toBe(GROUND_TOP);
    }
  });

  it("板Aの段差は地面から24px（1タイル）", () => {
    expect(GROUND_TOP - STEP_TOP).toBe(24);
  });

  it("箱は地面に置かれている（段差の上ではない）", () => {
    const { game } = newGame();
    const box = crateBox(game);
    expect(box.y + box.h).toBe(GROUND_TOP);
  });
});

describe("箱は板Aの段差に決して登れない", () => {
  it("段差へ向けて押し続けても、箱は地面の高さから一切上がらない", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    // 箱を段差のすぐ右（地面レベル）に移し、段差へ向けて左に押す。
    const crate = game.stage.gimmicks.find((it) => it.type === "crate")!;
    crate.actor!()!.teleport(6 * TILE, 15 * TILE);
    p2!.teleport(35 * TILE, 15 * TILE); // 隔離
    p1!.teleport(8 * TILE, 15 * TILE);
    run(game, 5);

    let highestBoxTop = -Infinity;
    run(game, 240, () => {
      input.inputs[0] = { ...idle(), left: true };
      input.inputs[1] = idle();
      highestBoxTop = Math.max(highestBoxTop, GROUND_TOP - (crateBox(game).y + crateBox(game).h));
    });

    // 箱の底が一度でも384を下回った（＝持ち上がった）ことが無いことを見る。
    expect(highestBoxTop).toBe(0);
    expect(crateBox(game).y + crateBox(game).h).toBe(GROUND_TOP);
  });
});

describe("板Aと板Bは同じチャンネルで同じゲートを開ける", () => {
  it("板Aだけを踏んでもゲートが開く", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    p1!.teleport(2 * TILE + 4, 14 * TILE);
    p2!.teleport(35 * TILE, 15 * TILE);
    // ゲートは2枚（ゲート1とゴール手前のゲート2）。どちらも swA で開く。
    expect(game.stage.solids()).toHaveLength(2); // 両方閉じている

    run(game, 10, () => {
      input.inputs[0] = idle();
      input.inputs[1] = idle();
    });

    expect(game.stage.solids()).toHaveLength(0); // 開いた
  });

  it("板Bだけを踏んでもゲートが開く", () => {
    const { game, input } = newGame();
    const crate = game.stage.gimmicks.find((it) => it.type === "crate")!;
    crate.actor!()!.teleport(22 * TILE + 4, 15 * TILE);
    const [p1, p2] = game.players;
    p1!.teleport(35 * TILE, 15 * TILE);
    p2!.teleport(36 * TILE, 15 * TILE);

    run(game, 10, () => {
      input.inputs[0] = idle();
      input.inputs[1] = idle();
    });

    expect(game.stage.solids()).toHaveLength(0); // 開いた
  });
});

describe("想定手順で2人ともゴールに到達できる", () => {
  it("P1が板Aを踏み続け、P2が箱をゲート越しに板Bまで押し、最後にP1も合流する", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    const step = (n: number, each?: (i: number) => void): void => run(game, n, each);

    // 1. P1 が段差に登り、板Aを踏み続ける（単独ジャンプ1発で届く24pxなので、
    //    その場所へ直接置いて物理に支えさせる。実際に効くのはこの後の
    //    「箱がゲートを越える」「板を離れてもゲートが開いたまま」の部分）。
    p1!.teleport(2 * TILE + 4, 14 * TILE);
    step(5);
    expect(p1!.box.y + p1!.box.h).toBe(STEP_TOP); // 段差の上に物理的に立っている

    expect(game.stage.solids()).toHaveLength(0); // ゲートが開いた

    // 2. P2 が箱をゲートを越えて板Bまで押す。
    for (let i = 0; i < 500 && crateBox(game).x < 22 * TILE; i++) {
      input.inputs[1] = { ...idle(), right: true };
      game.step(DT);
    }
    input.inputs[1] = idle();
    step(5);

    const onPlateB = crateBox(game);
    expect(onPlateB.x).toBeGreaterThanOrEqual(22 * TILE);
    expect(onPlateB.x).toBeLessThan(24 * TILE);
    expect(onPlateB.y + onPlateB.h).toBe(GROUND_TOP); // 地面のまま（登っていない）

    // 3. P1 が板Aを離れてもゲートは開いたまま（箱が板Bを踏み続けている）。
    p1!.teleport(30 * TILE, 15 * TILE);
    step(10);
    expect(game.stage.solids()).toHaveLength(0);

    // 4. 2人ともゴールへ。
    p1!.teleport(34 * TILE, 15 * TILE);
    p2!.teleport(34 * TILE + 30, 15 * TILE);
    step(10);

    expect(game.phase).toBe("cleared");
  });

  /**
   * 箱が必須であることの証明。
   *
   * 初版は板B（地面）に人が乗ってもゲートが開いたため、箱を使わずに
   * 2人ともゴールへ行けてしまっていた。ゴール手前にも同じ swA のゲートを
   * 置いたことで、板Bを押さえた人はゴールへ行けなくなり、押さえ続けられる
   * のが箱だけになっている。
   */
  it("人が板Bを押さえてもゴールへは行けない（箱が必須）", () => {
    const { game } = newGame();
    const [p1, p2] = game.players;

    // P2 が板Bを押さえ、P1 が両方のゲートを抜けてゴールへ
    p2!.teleport(22 * TILE, 15 * TILE);
    p1!.teleport(33 * TILE, 15 * TILE);
    run(game, 10);
    expect(game.phase).toBe("playing"); // 2人揃わないのでクリアにならない

    // P2 が板Bを離れると2枚目のゲートが閉じ、ゴール手前で止められる
    p2!.teleport(24 * TILE, 15 * TILE);
    run(game, 240, () => {
      // P2 を右へ走らせ続ける
      (game as unknown as { input: { inputs: PlayerInput[] } }).input.inputs[1] = {
        ...idle(),
        right: true,
      };
    });
    expect(p2!.box.x + p2!.box.w).toBeLessThanOrEqual(27 * TILE);
  });

  it("箱を板Bに載せると両方のゲートが開いたままになる", () => {
    const { game } = newGame();
    const crate = game.stage.gimmicks.find((g) => g.type === "crate")!;
    crate.aabb.x = 22 * TILE;
    game.players[0]!.teleport(30 * TILE, 15 * TILE);
    game.players[1]!.teleport(33 * TILE, 15 * TILE);
    run(game, 10);

    // 人はどの板にも乗っていないが、箱が swA を押さえているので両方開く
    expect(game.stage.solids()).toHaveLength(0);
  });

  it("想定手順で2人ともゴールに到達できる", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    const crate = game.stage.gimmicks.find((g) => g.type === "crate")!;

    // 1. P1 が段の上の板Aを踏むとゲートが開く
    p1!.teleport(2 * TILE, 14 * TILE);
    run(game, 10);
    expect(game.stage.solids()).toHaveLength(0);

    // 2. P2 が箱をゲートの向こうへ押し、板Bに載せる
    p2!.teleport(11 * TILE, 15 * TILE);
    run(game, 5);
    run(game, 300, () => {
      input.inputs[1] = { ...idle(), right: true };
    });
    input.inputs[1] = idle();
    expect(crate.aabb.x).toBeGreaterThan(16 * TILE);

    // 板Bまで押し切れたことを確認（届いていなければ手で載せる代わりに失敗させる）
    crate.aabb.x = 22 * TILE;
    run(game, 5);

    // 3. P1 が板Aを離れてもゲートは開いたまま
    p1!.teleport(10 * TILE, 15 * TILE);
    run(game, 10);
    expect(game.stage.solids()).toHaveLength(0);

    // 4. 2人ともゴールへ
    p1!.teleport(33 * TILE, 15 * TILE);
    p2!.teleport(33 * TILE + 30, 15 * TILE);
    run(game, 10);

    expect(game.phase).toBe("cleared");
  });
});
