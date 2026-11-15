import { describe, expect, it } from "vitest";
import { TILE } from "../src/game/tuning";
import stage01 from "../src/stages/stage-01.json";
import stage04 from "../src/stages/stage-04.json";
import stage07 from "../src/stages/stage-07.json";
import {
  crate,
  expectCleared,
  feet,
  gateClosed,
  newStage,
  platform,
  rideOn,
  standOn,
  walkLeft,
  walkRight,
} from "./helpers/stage";

/**
 * tests/helpers/stage.ts の動作確認。
 * 既存ステージに対して使い、ヘルパ自体が物理と食い違っていないことを固定する。
 */

describe("newStage", () => {
  it("選択画面を飛ばして開始し、2人をスポーンさせる", () => {
    const s = newStage(stage01);
    expect(s.game.phase).toBe("playing");
    expect(s.players).toHaveLength(2);
    expect(s.p1.box.x).toBe(4 * TILE);
    expect(s.p2.box.x).toBe(7 * TILE);
  });

  it("step は指定した回数だけ進める", () => {
    const s = newStage(stage01);
    s.step(30);
    expect(s.game.stageSecondsElapsed).toBeCloseTo(0.5, 5);
  });
});

describe("standOn / rideOn", () => {
  it("standOn はタイル座標に立たせる（床の1つ上の行）", () => {
    const s = newStage(stage01);
    standOn(s.p1, 20, 15, 4);
    s.step(5);
    expect(s.p1.box.x).toBe(20 * TILE + 4);
    expect(feet(s.p1)).toBe(16 * TILE);
    expect(s.p1.grounded).toBe(true);
  });

  it("rideOn で相方の頭に乗せると、落ちずに乗り続ける", () => {
    const s = newStage(stage01);
    standOn(s.p1, 20, 15);
    rideOn(s.p2, s.p1);
    s.step(10);
    expect(feet(s.p2)).toBe(s.p1.box.y);
    expect(s.p1.carrying).toBe(true);
  });

  it("rideOn で足場に乗せると、足場と一緒に運ばれる", () => {
    const s = newStage(stage04); // 2-1 Ferry: 板を踏むと足場が右へ動く
    standOn(s.p1, 8, 12); // 手前の板
    rideOn(s.p2, platform(s));
    const startX = s.p2.box.x;
    s.step(60);
    expect(s.p2.box.x).toBeGreaterThan(startX);
    expect(feet(s.p2)).toBe(platform(s).y);
  });

  it("rideOn で箱の上にも乗せられる", () => {
    const s = newStage(stage07);
    rideOn(s.p1, crate(s));
    s.step(10);
    expect(feet(s.p1)).toBe(crate(s).y);
  });
});

describe("walkRight / walkLeft", () => {
  it("実際の入力で歩くので、閉じたゲートで止まる", () => {
    const s = newStage(stage01);
    standOn(s.p1, 10, 15);
    standOn(s.p2, 2, 15);
    walkRight(s, s.p1, 240);
    expect(gateClosed(s)).toBe(true);
    expect(s.p1.box.x + s.p1.box.w).toBe(18 * TILE);
  });

  it("until が真になったところで止まり、歩いたステップ数を返す", () => {
    const s = newStage(stage01);
    standOn(s.p1, 20, 15);
    const frames = walkRight(s, s.p1, 600, { until: () => s.p1.box.x >= 25 * TILE });
    expect(frames).toBeLessThan(600);
    expect(s.p1.box.x).toBeGreaterThanOrEqual(25 * TILE);
    // 入力は離してある
    expect(s.input.inputs[0]!.right).toBe(false);
  });

  it("walkLeft は左へ歩き、箱を押す", () => {
    const s = newStage(stage07);
    rideOn(s.p1, { x: crate(s).x + TILE, y: crate(s).y + TILE, w: TILE, h: TILE }); // 箱の右隣、棚の上
    const before = crate(s).x;
    walkLeft(s, s.p1, 30);
    expect(crate(s).x).toBeLessThan(before);
  });
});

describe("expectCleared", () => {
  it("クリアしていなければ、2人の位置とゴールを添えて落ちる", () => {
    const s = newStage(stage01);
    expect(() => expectCleared(s)).toThrow(/stage-01: クリアしていない。p1=\(4\.0,15\.0\).*requires=\["key1"\]/);
  });

  /**
   * ヘルパだけで書いた通しクリア。テレポートは最初の配置だけで、
   * あとは実際の入力（ブースト・板・ゲート・鍵・ゴール）で進める。
   */
  it("1-1 を実際の入力だけで通しクリアできる", () => {
    const s = newStage(stage01);

    // 1. P1 を棚の手前に立たせ、P2 がその頭から棚へ跳び乗る（ブースト）
    standOn(s.p1, 12, 15);
    rideOn(s.p2, s.p1);
    s.step(5);
    walkRight(s, s.p2, 120, { jump: true, until: () => s.p2.box.x >= 15 * TILE + 8 });
    s.step(5);
    expect(feet(s.p2)).toBe(13 * TILE); // 棚の上（板の上）
    expect(gateClosed(s)).toBe(false);

    // 2. P1 がゲートを抜け、鍵を拾ってゴールへ
    walkRight(s, s.p1, 600, { until: () => s.p1.box.x >= 36 * TILE + 12 });
    expect(s.p1.box.x).toBeGreaterThan(35 * TILE);

    // 3. P2 が棚の右端から降りる（ゲートの向こう側に落ちる）→ ゴールへ
    walkRight(s, s.p2, 600, { until: () => s.game.phase === "cleared" });

    expectCleared(s);
  });
});
