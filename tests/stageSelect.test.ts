import { describe, expect, it } from "vitest";
import { resolveStartIndex, stageLabel } from "../src/game/stageSelect";
import type { StageData } from "../src/game/stageData";
import { STAGES } from "../src/stages/index";
import { Game } from "../src/game/game";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";

/** ラベル計算だけを見たいので、地形は空のダミーで足りる。 */
function stub(id: string, world: number): StageData {
  return { id, world, name: id, tileSize: 24, grid: [], spawns: [], gimmicks: [] };
}

describe("stageLabel", () => {
  it("ワールド内の通し番号を振る", () => {
    const s = [stub("a", 1), stub("b", 1), stub("c", 1)];
    expect([0, 1, 2].map((i) => stageLabel(s, i))).toEqual(["1-1", "1-2", "1-3"]);
  });

  it("ワールドが変わると番号が振り直される", () => {
    const s = [stub("a", 1), stub("b", 1), stub("c", 2), stub("d", 2)];
    expect([0, 1, 2, 3].map((i) => stageLabel(s, i))).toEqual(["1-1", "1-2", "2-1", "2-2"]);
  });

  it("範囲外でも落ちない", () => {
    expect(stageLabel([stub("a", 1)], 9)).toBe("?");
  });

  it("実際の登録ステージは 1-1..1-3, 2-1..2-3", () => {
    expect(STAGES.map((_, i) => stageLabel(STAGES, i))).toEqual([
      "1-1",
      "1-2",
      "1-3",
      "2-1",
      "2-2",
      "2-3",
    ]);
  });
});

describe("resolveStartIndex", () => {
  const stages = [stub("stage-01", 1), stub("stage-02", 1), stub("stage-03", 1)];

  it("ラベルで指定できる", () => {
    expect(resolveStartIndex(stages, "1-2")).toBe(1);
    expect(resolveStartIndex(stages, "1-3")).toBe(2);
  });

  it("id でも指定できる", () => {
    expect(resolveStartIndex(stages, "stage-03")).toBe(2);
  });

  it("大文字や前後の空白を許容する", () => {
    expect(resolveStartIndex(stages, "  STAGE-02 ")).toBe(1);
  });

  it("未指定なら先頭", () => {
    expect(resolveStartIndex(stages, null)).toBe(0);
    expect(resolveStartIndex(stages, "")).toBe(0);
    expect(resolveStartIndex(stages, "   ")).toBe(0);
  });

  it("URL 由来の不正な値は黙って先頭に落とす", () => {
    // 添字として直接使われると範囲外アクセスやプロトタイプ汚染を招く形。
    // 既知のステージと一致しない限り採用しないことを固定する。
    for (const bad of [
      "99",
      "-1",
      "1-99",
      "__proto__",
      "constructor",
      "<script>alert(1)</script>",
      "../../etc/passwd",
      "1e309",
      "NaN",
    ]) {
      expect(resolveStartIndex(stages, bad), bad).toBe(0);
    }
  });
});

describe("開始ステージの指定", () => {
  function idle(): PlayerInput {
    return { left: false, right: false, jumpHeld: false, jumpPressed: false };
  }

  it("startIndex を渡すとそのステージから始まる", () => {
    const game = new Game(new ScriptedInput([idle(), idle()]), STAGES, { startIndex: 2 });
    expect(game.stage.data.id).toBe("stage-03");
  });

  it("範囲外の startIndex は先頭に落ちる", () => {
    for (const bad of [-1, 99, 1.5e9]) {
      const game = new Game(new ScriptedInput([idle(), idle()]), STAGES, { startIndex: bad });
      expect(game.stage.data.id, String(bad)).toBe("stage-01");
    }
  });
});
