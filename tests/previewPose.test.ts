import { describe, expect, it } from "vitest";
import type { Game } from "../src/game/game";
import { TILE } from "../src/game/tuning";
import stage01 from "../src/stages/stage-01.json";
import stage05 from "../src/stages/stage-05.json";
import stage08 from "../src/stages/stage-08.json";
import { applyPose, parsePreviewArgs } from "../scripts/lib/pose";
import { feet, newStage } from "./helpers/stage";

/**
 * scripts/preview-stage.ts の引数とポーズ。
 * スクリプト本体は PNG を書くだけなので、解釈と適用をここで固定する。
 */

function pose(data: unknown, argv: string[]): Game {
  const args = parsePreviewArgs(["out.png", "1", ...argv]);
  const s = newStage(data);
  applyPose(s.game, s.input, args.actions);
  return s.game;
}

describe("parsePreviewArgs", () => {
  it("引数なしなら 1 番目のステージのスポーン直後", () => {
    expect(parsePreviewArgs([])).toEqual({
      out: "stage-preview.png",
      stage: "1",
      select: false,
      touch: false,
      camera: "fit",
      zoom: 2,
      settle: 10,
      actions: [],
    });
  });

  it("ポーズは書いた順に並ぶ", () => {
    const args = parsePreviewArgs([
      "out.png",
      "2-4",
      "--place",
      "p1=2.5,15",
      "--ride",
      "p2=platform:1",
      "--press",
      "p1=right+jump:30",
      "--hold",
      "150",
    ]);
    expect(args.out).toBe("out.png");
    expect(args.stage).toBe("2-4");
    expect(args.actions).toEqual([
      { kind: "place", player: 0, x: 2.5, y: 15 },
      { kind: "ride", player: 1, target: { kind: "gimmick", type: "platform", index: 1 } },
      { kind: "press", player: 0, left: false, right: true, jump: true, steps: 30 },
      { kind: "hold", steps: 150 },
    ]);
  });

  it("--ride は相方にも、番号を省いたギミックにも乗れる", () => {
    const args = parsePreviewArgs(["o.png", "1", "--ride", "p2=p1", "--ride", "p1=crate"]);
    expect(args.actions).toEqual([
      { kind: "ride", player: 1, target: { kind: "player", player: 0 } },
      { kind: "ride", player: 0, target: { kind: "gimmick", type: "crate", index: 0 } },
    ]);
  });

  it("画面のオプション", () => {
    const args = parsePreviewArgs(["o.png", "4-3", "--camera", "follow", "--zoom", "1", "--touch", "--settle", "0"]);
    expect(args).toMatchObject({ camera: "follow", zoom: 1, touch: true, settle: 0 });
  });

  it("旧形式の位置引数 (start / select / touch) も通る", () => {
    expect(parsePreviewArgs(["o.png", "3", "start"])).toMatchObject({ stage: "3", select: false });
    expect(parsePreviewArgs(["o.png", "1", "select", "touch"])).toMatchObject({ select: true, touch: true });
    expect(parsePreviewArgs(["o.png", "--select"]).select).toBe(true);
  });

  it.each([
    [["o.png", "1", "boost"], /ポーズ名 "boost" は廃止/],
    [["o.png", "1", "--place", "p1=3"], /--place は pN=X,Y/],
    [["o.png", "1", "--place", "p1=a,b"], /--place は pN=X,Y/],
    [["o.png", "1", "--place", "8,15"], /pN=\.\.\. の形/],
    [["o.png", "1", "--place", "q1=8,15"], /p1 \/ p2 の形/],
    [["o.png", "1", "--hold"], /--hold には 1 以上の整数/],
    [["o.png", "1", "--hold", "1.5"], /--hold には 1 以上の整数/],
    [["o.png", "1", "--ride", "p1=p1"], /自分の上には乗れない/],
    [["o.png", "1", "--press", "p1=up:10"], /left \/ right \/ jump/],
    [["o.png", "1", "--press", "p1=left"], /pN=KEYS:STEPS/],
    [["o.png", "1", "--camera", "wide"], /fit か follow/],
    [["o.png", "1", "--frob"], /未知のオプション: --frob/],
    [["o.png", "1", "--select", "--hold", "5"], /同時に使えない/],
  ])("書き間違い %j は使い方を添えて落とす", (argv, message) => {
    expect(() => parsePreviewArgs(argv)).toThrow(message);
    expect(() => parsePreviewArgs(argv)).toThrow(/使い方:/);
  });
});

describe("applyPose", () => {
  it("--place はタイル座標（小数可）へ置く", () => {
    const game = pose(stage01, ["--place", "p1=12.5,15", "--place", "p2=30,15"]);
    expect(game.players[0]!.box.x).toBe(12.5 * TILE);
    expect(game.players[0]!.box.y).toBe(15 * TILE);
    expect(game.players[1]!.box.x).toBe(30 * TILE);
  });

  it("--ride p2=p1 で頭の上に乗る", () => {
    const game = pose(stage01, ["--place", "p1=12,15", "--ride", "p2=p1", "--hold", "10"]);
    const [p1, p2] = game.players;
    expect(feet(p2!)).toBe(p1!.box.y);
    expect(p1!.carrying).toBe(true);
  });

  it("--ride と --hold で、足場に運ばれた後の状態を作れる（2-2）", () => {
    // P1 が地上の板を踏むと足場A (platform:0) が棚の高さ (行10) まで上がる
    const game = pose(stage05, ["--place", "p1=4,15", "--ride", "p2=platform:0", "--hold", "120"]);
    const p2 = game.players[1]!;
    expect(feet(p2)).toBe(10 * TILE);
  });

  it("--press は実際の入力で動かす（3-2 で箱を板Aまで押す）", () => {
    const game = pose(stage08, ["--place", "p1=11,15", "--hold", "5", "--press", "p1=left:240"]);
    const crate = game.stage.gimmicks.find((g) => g.type === "crate")!;
    expect(crate.aabb.x).toBe(TILE);
  });

  it("手順を並べればクリア状態まで作れる（1-1）", () => {
    const game = pose(stage01, [
      "--place", "p1=25,15", "--hold", "5", // 鍵を拾う
      "--place", "p1=35,15", "--place", "p2=36.25,15", "--hold", "5",
    ]);
    expect(game.phase).toBe("cleared");
  });

  it("居ないプレイヤーや無いギミックは分かる形で落とす", () => {
    expect(() => pose(stage01, ["--place", "p3=1,1"])).toThrow(/p3 は居ない/);
    expect(() => pose(stage01, ["--ride", "p1=crate"])).toThrow(/crate:0 が無い.*plate, gate, key, goal/);
  });
});
