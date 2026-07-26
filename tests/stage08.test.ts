import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";
import { DT, TILE } from "../src/game/tuning";
import type { StageData } from "../src/game/stageData";
import stage08 from "../src/stages/stage-08.json";

/**
 * 3-2「Double Lock」。
 *
 * 初版は「箱を踏み台にして高さを稼ぐ」設計だったが、二段ジャンプ
 * （相方の頭に乗り、下が跳んだ頂点で上が跳ぶ）で地面から 149px 届いてしまい、
 * 箱＋ブーストの 110.5px を常に上回るため、箱が不要になっていた。
 * 高さで箱を必須にすることはこのエンジンでは不可能なので、箱にしかできない
 * 「人がいなくても居座り続ける」性質を使う設計に置き換えてある。
 *
 * ゲートは swA と swB の両方を要求する。箱が swA を、人が swB を押さえる。
 * 人が2枚とも押さえると誰も通れないので、箱が無いと成立しない。
 */

const GROUND = 16 * TILE;
const GATE_X = 21 * TILE;

function idle(): PlayerInput {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false };
}

function newGame(): {
  game: Game;
  input: ScriptedInput;
  step: (n?: number) => void;
} {
  const input = new ScriptedInput([idle(), idle()]);
  const game = new Game(input, stage08 as StageData);
  game.start();
  return {
    game,
    input,
    step: (n = 1) => {
      for (let i = 0; i < n; i++) game.step(DT);
    },
  };
}

function crateBox(game: Game): { x: number; y: number } {
  return game.stage.gimmicks.find((it) => it.type === "crate")!.aabb;
}

/**
 * 箱を左の壁際まで押す。板Aは壁際にあるので、押し切れば必ず載る
 * （行き過ぎて壁に詰まり、押し戻せなくなる事故が起きない配置）。
 */
function pushLeft(input: ScriptedInput, step: (n?: number) => void, frames = 240): void {
  for (let i = 0; i < frames; i++) {
    input.inputs[0] = { ...idle(), left: true };
    step(1);
  }
  input.inputs[0] = idle();
}

const gateClosed = (game: Game): boolean => game.stage.solids().length > 0;

describe("3-2 Double Lock", () => {
  it("2人とも地面の上にスポーンする", () => {
    const { game } = newGame();
    for (const p of game.players) {
      expect(p.box.y + p.box.h).toBe(GROUND);
    }
  });

  it("何も押さえていなければゲートは閉じている", () => {
    const { game, step } = newGame();
    step(10);
    expect(gateClosed(game)).toBe(true);
  });

  it("片方のチャンネルだけではゲートは開かない", () => {
    const { game, step } = newGame();

    // swB だけ（人が板Bに乗る。箱は初期位置でどの板にも載っていない）
    game.players[0]!.teleport(12 * TILE, 15 * TILE);
    game.players[1]!.teleport(30 * TILE, 15 * TILE);
    step(10);
    expect(gateClosed(game)).toBe(true);

    // swA だけ（箱を板Aへ、人はどの板にも乗らない）
    game.players[0]!.teleport(18 * TILE, 15 * TILE);
    crateBox(game).x = 1 * TILE;
    step(10);
    expect(gateClosed(game)).toBe(true);
  });

  it("箱が板Aに、人が板Bに乗るとゲートが開く", () => {
    const { game, step } = newGame();
    crateBox(game).x = 1 * TILE;
    game.players[0]!.teleport(12 * TILE, 15 * TILE);
    game.players[1]!.teleport(18 * TILE, 15 * TILE);
    step(10);

    expect(gateClosed(game)).toBe(false);
  });

  it("箱を左へ押して板Aに載せられる", () => {
    const { game, input, step } = newGame();
    game.players[0]!.teleport(11 * TILE, 15 * TILE); // 箱の右側に立つ
    game.players[1]!.teleport(30 * TILE, 15 * TILE);
    step(5);

    pushLeft(input, step);

    // 板A は x=24..72。箱は壁(x=24)まで押されて板の上に載る
    expect(crateBox(game).x).toBe(TILE);
  });

  it("人が2枚とも押さえても、押さえた本人はゲートを通れない（箱が必須）", () => {
    const { game, input, step } = newGame();
    game.players[0]!.teleport(1 * TILE, 15 * TILE); // 板A
    game.players[1]!.teleport(12 * TILE, 15 * TILE); // 板B
    step(10);
    expect(gateClosed(game)).toBe(false);

    // 板Bを離れた瞬間に swB が落ちてゲートが閉じるので、通り抜けられない
    for (let i = 0; i < 240; i++) {
      input.inputs[1] = { ...idle(), right: true };
      step(1);
    }
    expect(game.players[1]!.box.x + game.players[1]!.box.w).toBeLessThanOrEqual(GATE_X);
  });

  /**
   * 通しでクリアできることの証明。2-2 で詰み盤面を出しているので、
   * 各ステージにこれを必ず置く。
   */
  it("想定手順で2人ともゴールに到達できる", () => {
    const { game, input, step } = newGame();
    const [p1, p2] = game.players;

    // 1. P1 が箱を左へ押して板Aに載せる
    p1!.teleport(11 * TILE, 15 * TILE);
    p2!.teleport(16 * TILE, 15 * TILE);
    step(5);
    pushLeft(input, step);
    expect(crateBox(game).x).toBe(TILE);

    // 2. P1 が板Bに乗る -> swA(箱) と swB(人) が揃ってゲートが開く
    p1!.teleport(12 * TILE, 15 * TILE);
    step(10);
    expect(gateClosed(game)).toBe(false);

    // 3. P2 がゲートを抜け、向こう側の板Cに乗って swB を引き継ぐ
    p2!.teleport(27 * TILE, 15 * TILE);
    step(10);
    expect(gateClosed(game)).toBe(false);

    // 4. P1 が板Bを離れてもゲートは開いたまま。P1 も通り抜けられる
    p1!.teleport(25 * TILE, 15 * TILE);
    step(10);
    expect(gateClosed(game)).toBe(false);

    // 5. 2人ともゴールへ
    p1!.teleport(33 * TILE, 15 * TILE);
    p2!.teleport(33 * TILE + 30, 15 * TILE);
    step(10);

    expect(game.phase).toBe("cleared");
  });
});
