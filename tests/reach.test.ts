import { beforeAll, describe, expect, it } from "vitest";
import {
  REACH,
  REACH_ANALYTIC,
  REACH_KINDS,
  canCrossGap,
  measureEnvelope,
  measureReach,
  type MeasuredReach,
} from "../src/game/reach";
import { TILE } from "../src/game/tuning";

/**
 * 到達力の定数 (REACH) が、実際の物理で測った値と一致することを固定する。
 *
 * ここが落ちたら、物理か tuning.ts が変わって跳べる範囲が変わっている。
 * REACH を実測に合わせ直し、`npx vite-node scripts/check-stage.ts` の表で
 * 既存ステージの成立条件（届く／届かない）が保たれているかを確認すること。
 */

// 総当たりで軌道を測るので、既定の 5 秒では足りないことがある
const SLOW = 60_000;

let measured: MeasuredReach;
beforeAll(() => {
  measured = measureReach();
}, SLOW);

describe("REACH は実測と一致する", () => {
  it("高さ: 単独 / ブースト / 二段", () => {
    expect(measured.solo.rise).toBe(REACH.solo.rise);
    expect(measured.boost.rise).toBe(REACH.boost.rise);
    expect(measured.double.rise).toBe(REACH.double.rise);
  });

  it("高さ: 箱の上から", () => {
    expect(measured.crate.rise).toBe(REACH.crate.rise);
    expect(measured.crateBoost.rise).toBe(REACH.crateBoost.rise);
    expect(measured.crateDouble.rise).toBe(REACH.crateDouble.rise);
  });

  it("同じ高さへ跳び移れる隙間", () => {
    expect(measured.solo.gap).toBe(REACH.solo.gap);
    expect(measured.boost.gap).toBe(REACH.boost.gap);
    expect(measured.double.gap).toBe(REACH.double.gap);
  });

  it("全体が一致する（項目の足し忘れを防ぐ）", () => {
    expect(measured).toEqual(REACH);
  });
});

describe("定数どうしの関係", () => {
  it("頭や箱は、ちょうど1タイルぶん高さを足す", () => {
    expect(REACH.boost.rise).toBe(REACH.solo.rise + TILE);
    expect(REACH.crate.rise).toBe(REACH.solo.rise + TILE);
    expect(REACH.crateBoost.rise).toBe(REACH.boost.rise + TILE);
    expect(REACH.crateDouble.rise).toBe(REACH.double.rise + TILE);
  });

  it("二段ジャンプは箱＋ブーストを上回る（高さで箱を必須にできない根拠）", () => {
    expect(REACH.double.rise).toBeGreaterThan(REACH.crateBoost.rise);
  });

  it("3タイルの段差は単独では登れず、頭に乗れば登れる（1-1 の成立条件）", () => {
    expect(REACH.solo.rise).toBeLessThan(3 * TILE);
    expect(REACH.boost.rise).toBeGreaterThanOrEqual(3 * TILE);
  });
});

describe("解析値 (SPEC の検算表) との関係", () => {
  it("式から出る値は SPEC の表と同じ", () => {
    expect(REACH_ANALYTIC.solo).toBe(62.5);
    expect(REACH_ANALYTIC.boost).toBe(86.5);
    expect(REACH_ANALYTIC.crateBoost).toBe(110.5);
    expect(REACH_ANALYTIC.double).toBe(149);
  });

  it("高さの解析値は実測の上界で、差は10px未満", () => {
    const pairs: [number, number][] = [
      [REACH.solo.rise, REACH_ANALYTIC.solo],
      [REACH.boost.rise, REACH_ANALYTIC.boost],
      [REACH.crateBoost.rise, REACH_ANALYTIC.crateBoost],
      [REACH.double.rise, REACH_ANALYTIC.double],
    ];
    for (const [real, analytic] of pairs) {
      expect(real).toBeLessThanOrEqual(analytic);
      expect(analytic - real).toBeLessThan(10);
    }
  });
});

describe("包絡線は本物の地形でも成り立つ", () => {
  it.each(REACH_KINDS)(
    "%s: 測った隙間に収まるタイル数は越えられ、1タイル広いと越えられない",
    (kind) => {
      const tiles = Math.floor(REACH[kind].gap / TILE);
      expect(canCrossGap(kind, tiles)).toBe(true);
      expect(canCrossGap(kind, tiles + 1)).toBe(false);
    },
    SLOW,
  );

  it("越えられるタイル数は 単独4 / ブースト5 / 二段8", () => {
    expect(REACH_KINDS.map((k) => Math.floor(REACH[k].gap / TILE))).toEqual([4, 5, 8]);
  });
});

describe("包絡線の形", () => {
  it.each(REACH_KINDS)("%s: 登れる高さの上限は REACH.rise", (kind) => {
    const env = measureEnvelope(kind);
    expect(env.maxRise).toBe(REACH[kind].rise);
    expect(env.gapAt(REACH[kind].rise)).toBeGreaterThanOrEqual(0);
    expect(env.gapAt(REACH[kind].rise + 1)).toBe(-Infinity);
  });

  it.each(REACH_KINDS)("%s: 低い面ほど遠くまで届く", (kind) => {
    const env = measureEnvelope(kind);
    for (let rise = REACH[kind].rise; rise > -10 * TILE; rise--) {
      expect(env.gapAt(rise - 1)).toBeGreaterThanOrEqual(env.gapAt(rise));
    }
  });

  it("2人でできることは1人でできることを含む", () => {
    const [solo, boost, double] = REACH_KINDS.map(measureEnvelope);
    for (let rise = REACH.solo.rise; rise > -10 * TILE; rise -= 4) {
      expect(boost!.gapAt(rise)).toBeGreaterThanOrEqual(solo!.gapAt(rise));
      expect(double!.gapAt(rise)).toBeGreaterThanOrEqual(boost!.gapAt(rise));
    }
  });
});
