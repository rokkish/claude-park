import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";
import { DT } from "../src/game/tuning";
import { STAGES } from "../src/stages/index";
import { listWorlds } from "../src/stages/worlds";
import type { StageData } from "../src/game/stageData";

function idle(): PlayerInput {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false };
}

function newGame(opts: { skipSelect?: boolean } = {}): {
  game: Game;
  input: ScriptedInput;
  step: (n?: number) => void;
} {
  const input = new ScriptedInput([idle(), idle()]);
  const game = new Game(input, STAGES, opts);
  return {
    game,
    input,
    step: (n = 1) => {
      for (let i = 0; i < n; i++) game.step(DT);
    },
  };
}

/** 選択画面での操作。押しっぱなしにならないよう1ステップで戻す。 */
function tap(input: ScriptedInput, over: Partial<PlayerInput>): void {
  input.inputs[0] = { ...idle(), ...over };
}

function stub(id: string, world: number): StageData {
  return { id, world, name: id, tileSize: 24, grid: [], spawns: [], gimmicks: [] };
}

describe("listWorlds", () => {
  it("登録ステージからワールド一覧を組み立てる", () => {
    expect(listWorlds(STAGES)).toEqual([
      { world: 1, name: "スイッチ", firstIndex: 0, stageCount: 3 },
      { world: 2, name: "動く足場", firstIndex: 3, stageCount: 3 },
      { world: 3, name: "運べる箱", firstIndex: 6, stageCount: 3 },
    ]);
  });

  it("名前が未登録のワールドは ? を出して気付けるようにする", () => {
    const worlds = listWorlds([stub("a", 9)]);
    expect(worlds[0]!.name).toBe("?");
  });

  it("ワールド番号順に並べる", () => {
    const worlds = listWorlds([stub("a", 2), stub("b", 1)]);
    expect(worlds.map((w) => w.world)).toEqual([1, 2]);
  });
});

describe("ワールド選択画面", () => {
  it("初回はワールド選択から始まる", () => {
    const { game } = newGame();
    expect(game.phase).toBe("select");
  });

  it("決定するとワールド1の先頭ステージが始まる", () => {
    const { game, input, step } = newGame();
    tap(input, { jumpPressed: true });
    step();

    expect(game.phase).toBe("playing");
    expect(game.stage.data.id).toBe("stage-01");
  });

  it("右で選ぶとワールド2の先頭ステージが始まる", () => {
    const { game, input, step } = newGame();
    tap(input, { right: true });
    step();
    tap(input, { jumpPressed: true });
    step();

    expect(game.stage.data.id).toBe("stage-04"); // 2-1
  });

  it("Enter でも決定できる", () => {
    const { game, input, step } = newGame();
    input.press("Enter");
    step();

    expect(game.phase).toBe("playing");
  });

  it("押しっぱなしでは選択が流れない", () => {
    const { game, input, step } = newGame();
    // 右を押したまま何ステップ回しても 1つぶんしか動かない
    tap(input, { right: true });
    step(30);
    tap(input, { jumpPressed: true, right: true });
    step();

    expect(game.stage.data.id).toBe("stage-04"); // 2-1 のまま（一周していない）
  });

  it("端で押すと反対側へ回り込む", () => {
    const { game, input, step } = newGame();
    // 左に1つ = 末尾のワールドへ
    tap(input, { left: true });
    step();
    tap(input, { jumpPressed: true });
    step();

    expect(game.stage.data.id).toBe("stage-07"); // ワールド3（末尾）
  });

  it("P2 の入力でも選べる", () => {
    const { game, input, step } = newGame();
    input.inputs[1] = { ...idle(), right: true };
    step();
    input.inputs[1] = { ...idle(), jumpPressed: true };
    step();

    expect(game.stage.data.id).toBe("stage-04");
  });

  it("skipSelect 指定時は選択画面を飛ばす（?stage= 用）", () => {
    const { game } = newGame({ skipSelect: true });
    expect(game.phase).toBe("playing");
  });
});
