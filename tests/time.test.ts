import { describe, expect, it } from "vitest";
import { formatTime } from "../src/engine/time";
import { Game } from "../src/game/game";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";
import { DT, TILE } from "../src/game/tuning";
import { STAGES } from "../src/stages/index";

function idle(): PlayerInput {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false };
}

describe("formatTime", () => {
  it("00:00:00.000 の形で出す", () => {
    expect(formatTime(0)).toBe("00:00:00.000");
    expect(formatTime(1.5)).toBe("00:00:01.500");
    expect(formatTime(83.456)).toBe("00:01:23.456");
    expect(formatTime(3661.007)).toBe("01:01:01.007");
  });

  it("ミリ秒は切り捨てではなく四捨五入する", () => {
    expect(formatTime(0.0004)).toBe("00:00:00.000");
    expect(formatTime(0.0006)).toBe("00:00:00.001");
  });

  it("負の値でも壊れない", () => {
    expect(formatTime(-5)).toBe("00:00:00.000");
  });
});

describe("計測", () => {
  function newGame(): { game: Game; input: ScriptedInput; step: (n?: number) => void } {
    const input = new ScriptedInput([idle(), idle()]);
    const game = new Game(input, STAGES);
    game.start();
    const step = (n = 1): void => {
      for (let i = 0; i < n; i++) game.step(DT);
    };
    return { game, input, step };
  }

  it("プレイ中だけ進み、タイトルでは進まない", () => {
    const input = new ScriptedInput([idle(), idle()]);
    const game = new Game(input, STAGES);

    for (let i = 0; i < 60; i++) game.step(DT); // タイトル画面のまま
    expect(game.stageSecondsElapsed).toBe(0);

    game.start();
    for (let i = 0; i < 60; i++) game.step(DT);
    expect(game.stageSecondsElapsed).toBeCloseTo(1, 5);
  });

  it("R でやり直すとステージ計測は 0 に戻るが、通し計測は戻らない", () => {
    const { game, input, step } = newGame();
    step(120); // 2秒

    input.press("KeyR");
    step();

    expect(game.stageSecondsElapsed).toBeCloseTo(DT, 5); // リセット直後の1ステップぶん
    expect(game.runSecondsElapsed).toBeGreaterThan(1.9);
  });

  it("ステージが変わるとステージ計測は 0 に、通し計測は積み上がる", () => {
    const { game, input, step } = newGame();
    step(60); // 1秒

    // 1-1 をクリアさせて次へ
    game.players[0]!.teleport(25 * TILE, 15 * TILE);
    step(5);
    game.players[0]!.teleport(35 * TILE, 15 * TILE);
    game.players[1]!.teleport(35 * TILE + 30, 15 * TILE);
    step(10);
    const runBefore = game.runSecondsElapsed;

    input.press("Enter");
    step(30);

    expect(game.stage.data.id).toBe("stage-02");
    // Enter を消費するステップは phase がまだ "cleared" なので計測は進まない。
    // 遷移そのものは新ステージのタイムに含めない、が正しい挙動。
    expect(game.stageSecondsElapsed).toBeCloseTo(29 * DT, 5);
    expect(game.runSecondsElapsed).toBeGreaterThan(runBefore);
  });

  it("クリア画面では時間が止まる", () => {
    const { game, step } = newGame();
    game.players[0]!.teleport(25 * TILE, 15 * TILE);
    step(5);
    game.players[0]!.teleport(35 * TILE, 15 * TILE);
    game.players[1]!.teleport(35 * TILE + 30, 15 * TILE);
    step(10);
    expect(game.phase).toBe("cleared");

    const frozen = game.runSecondsElapsed;
    step(60);
    expect(game.runSecondsElapsed).toBe(frozen);
  });
});
