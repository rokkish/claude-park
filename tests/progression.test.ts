import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";
import { DT, TILE } from "../src/game/tuning";
import type { StageData } from "../src/game/stageData";
import { STAGES } from "../src/stages/index";

/**
 * ステージ進行。ここが壊れると追加したステージに到達できなくなるが、
 * 各ステージ単体のテストは全て通ってしまうため気付けない。
 */

function idle(): PlayerInput {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false };
}

/** ステージごとの「クリアさせるための置き方」（タイル座標）。 */
const CLEAR_SETUP: Record<string, { goal: { x: number; y: number }; key?: { x: number; y: number } }> = {
  "stage-01": { goal: { x: 35, y: 15 }, key: { x: 25, y: 15 } },
  "stage-02": { goal: { x: 34, y: 15 } },
  "stage-03": { goal: { x: 34, y: 12 } },
  "stage-04": { goal: { x: 34, y: 12 } },
  "stage-05": { goal: { x: 33, y: 9 } },
  "stage-06": { goal: { x: 29, y: 9 } },
};

function newGame(stages: StageData | StageData[] = STAGES): {
  game: Game;
  input: ScriptedInput;
  step: (n?: number) => void;
} {
  const input = new ScriptedInput([idle(), idle()]);
  const game = new Game(input, stages);
  game.start();
  const step = (n = 1): void => {
    for (let i = 0; i < n; i++) game.step(DT);
  };
  return { game, input, step };
}

/** 現在のステージを、テレポートでクリア状態まで持っていく。 */
function forceClear(game: Game, step: (n?: number) => void): void {
  const setup = CLEAR_SETUP[game.stage.data.id];
  if (!setup) throw new Error(`クリア手順が未定義: ${game.stage.data.id}`);
  if (setup.key) {
    game.players[0]!.teleport(setup.key.x * TILE, setup.key.y * TILE);
    step(5);
  }
  game.players[0]!.teleport(setup.goal.x * TILE, setup.goal.y * TILE);
  game.players[1]!.teleport(setup.goal.x * TILE + 30, setup.goal.y * TILE);
  step(10);
}

describe("ステージ進行", () => {
  it("6ステージ（ワールド1・2 各3本）が登録されている", () => {
    expect(STAGES.map((s) => s.id)).toEqual([
      "stage-01",
      "stage-02",
      "stage-03",
      "stage-04",
      "stage-05",
      "stage-06",
    ]);
  });

  it("クリア後の Enter で次のステージへ進み、最後は先頭に戻る", () => {
    const { game, input, step } = newGame();
    const visited: string[] = [];

    for (let i = 0; i < 7; i++) {
      visited.push(game.stage.data.id);
      forceClear(game, step);
      expect(game.phase).toBe("cleared");
      input.press("Enter");
      step();
    }

    expect(visited).toEqual([
      "stage-01",
      "stage-02",
      "stage-03",
      "stage-04",
      "stage-05",
      "stage-06",
      "stage-01",
    ]);
  });

  it("進行後はタイトルに戻らず、そのまま遊べる状態になる", () => {
    const { game, input, step } = newGame();
    forceClear(game, step);
    input.press("Enter");
    step();

    expect(game.phase).toBe("playing");
    expect(game.stage.data.id).toBe("stage-02");
    // スポーン位置がステージ2のものに入れ替わっている
    expect(game.players).toHaveLength(2);
    for (const p of game.players) {
      expect(p.box.y + p.box.h).toBe(16 * TILE);
    }
  });

  it("切り替え後は新しいステージの地形で当たり判定される", () => {
    const { game, input, step } = newGame();
    forceClear(game, step);
    input.press("Enter");
    step();

    // ステージ3へさらに進めると地面の高さが変わる
    forceClear(game, step);
    input.press("Enter");
    step(5);

    expect(game.stage.data.id).toBe("stage-03");
    for (const p of game.players) {
      expect(p.box.y + p.box.h).toBe(13 * TILE); // 地面が 1タイル上がる
    }
  });

  it("R は次へ進めず、今のステージをやり直す", () => {
    const { game, input, step } = newGame();
    forceClear(game, step);
    input.press("KeyR");
    step();

    expect(game.stage.data.id).toBe("stage-01");
    expect(game.phase).toBe("playing");
  });

  it("isAllCleared は最終ステージ(2-3)をクリアした瞬間だけ真になる", () => {
    const { game, input, step } = newGame();
    const nonFinalIds = ["stage-01", "stage-02", "stage-03", "stage-04", "stage-05"];

    // 途中の5ステージは、クリアしても isAllCleared はまだ立たない
    for (const id of nonFinalIds) {
      expect(game.stage.data.id).toBe(id);
      forceClear(game, step);
      expect(game.phase).toBe("cleared");
      expect(game.isAllCleared).toBe(false);

      input.press("Enter");
      step();
      expect(game.isAllCleared).toBe(false); // プレイ中
    }

    // 最終ステージ (stage-06 = 2-3) クリアで全踏破
    forceClear(game, step);
    expect(game.stage.data.id).toBe("stage-06");
    expect(game.isAllCleared).toBe(true);

    // 先頭に戻ったら降りる
    input.press("Enter");
    step();
    expect(game.isAllCleared).toBe(false);
    expect(game.stage.data.id).toBe("stage-01");
  });

  it("単一ステージを渡した場合も動く（既存の呼び出しを壊さない）", () => {
    const { game, input, step } = newGame(STAGES[0]!);
    forceClear(game, step);
    input.press("Enter");
    step();

    // 進む先が無いので同じステージに留まる
    expect(game.stage.data.id).toBe("stage-01");
  });
});
