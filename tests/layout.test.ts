import { describe, expect, it } from "vitest";
import { MIN_TOUCH_TARGET, computeLayout, type Viewport } from "../src/engine/layout";

/**
 * レイアウトのリグレッション検出。
 *
 * 過去に2回、実機でしか気付けない形で壊している。
 *   - canvas が画面をはみ出し、下部が操作帯に隠れた
 *   - 縦画面で操作帯が画面幅を 164px 超過して右側が見切れた
 * どちらも代表的な端末サイズで検算すれば机上で分かるものだった。
 * ここが通る限り、同じ壊れ方はしない。
 */

/** 実在する端末の CSS ピクセル。横持ちは幅と高さを入れ替えて使う。 */
const DEVICES: { name: string; w: number; h: number }[] = [
  { name: "iPhone SE", w: 375, h: 667 },
  { name: "iPhone 13", w: 390, h: 844 },
  { name: "iPhone 15 Pro Max", w: 430, h: 932 },
  { name: "Pixel 7", w: 412, h: 892 },
  { name: "Galaxy Fold (閉)", w: 320, h: 720 },
  { name: "iPad", w: 768, h: 1024 },
  { name: "iPad Pro", w: 1024, h: 1366 },
];

const portrait = (d: { w: number; h: number }): Viewport => ({ width: d.w, height: d.h });
const landscape = (d: { w: number; h: number }): Viewport => ({ width: d.h, height: d.w });

/** 端末サイズ全部を縦横で回す。 */
function eachOrientation(fn: (vp: Viewport, label: string) => void): void {
  for (const d of DEVICES) {
    fn(portrait(d), `${d.name} 縦`);
    fn(landscape(d), `${d.name} 横`);
  }
}

describe("タッチ端末のレイアウト", () => {
  it("canvas は画面幅に収まる", () => {
    eachOrientation((vp, label) => {
      const l = computeLayout(vp, true);
      expect(l.canvasWidth, label).toBeLessThanOrEqual(vp.width + 0.5);
    });
  });

  it("canvas と操作帯の合計が画面高に収まる", () => {
    eachOrientation((vp, label) => {
      const l = computeLayout(vp, true);
      expect(l.canvasHeight + l.barHeight, label).toBeLessThanOrEqual(vp.height + 0.5);
    });
  });

  it("操作帯を出すときは必ず画面幅に収まっている", () => {
    eachOrientation((vp, label) => {
      const l = computeLayout(vp, true);
      if (!l.showControls) return;
      expect(l.controlsRequiredWidth, label).toBeLessThanOrEqual(vp.width + 0.5);
    });
  });

  it("ボタンはタップ標的の下限を下回らない", () => {
    eachOrientation((vp, label) => {
      const l = computeLayout(vp, true);
      expect(l.buttonSize, label).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      expect(l.jumpSize, label).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    });
  });

  it("canvas は 20:9 の比を保つ", () => {
    eachOrientation((vp, label) => {
      const l = computeLayout(vp, true);
      expect(l.canvasWidth / l.canvasHeight, label).toBeCloseTo(20 / 9, 6);
    });
  });

  it("横画面ではどの端末でも操作帯が出る", () => {
    for (const d of DEVICES) {
      const l = computeLayout(landscape(d), true);
      expect(l.showControls, `${d.name} 横`).toBe(true);
    }
  });

  it("スマホの縦画面では操作帯が入らないので出さない", () => {
    for (const name of ["iPhone SE", "iPhone 13", "Pixel 7", "Galaxy Fold (閉)"]) {
      const d = DEVICES.find((x) => x.name === name)!;
      const l = computeLayout(portrait(d), true);
      expect(l.showControls, `${name} 縦`).toBe(false);
      expect(l.barHeight, `${name} 縦`).toBe(0);
    }
  });

  it("幅の足りるタブレットは縦持ちでも操作帯を出す", () => {
    for (const name of ["iPad", "iPad Pro"]) {
      const d = DEVICES.find((x) => x.name === name)!;
      expect(computeLayout(portrait(d), true).showControls, `${name} 縦`).toBe(true);
    }
  });
});

describe("非タッチ端末のレイアウト", () => {
  it("操作帯を出さず、canvas は 960px を超えない", () => {
    for (const vp of [
      { width: 1920, height: 1080 },
      { width: 1280, height: 800 },
      { width: 3840, height: 2160 },
    ]) {
      const l = computeLayout(vp, false);
      expect(l.showControls).toBe(false);
      expect(l.barHeight).toBe(0);
      expect(l.canvasWidth).toBeLessThanOrEqual(960);
    }
  });

  it("縦に狭い窓では高さに合わせて縮む", () => {
    const l = computeLayout({ width: 1920, height: 300 }, false);
    expect(l.canvasHeight).toBeLessThanOrEqual(300);
    expect(l.canvasWidth).toBeLessThan(960);
  });

  it("極端に狭い窓でもはみ出さない", () => {
    for (const vp of [
      { width: 200, height: 900 },
      { width: 900, height: 120 },
    ]) {
      const l = computeLayout(vp, false);
      expect(l.canvasWidth).toBeLessThanOrEqual(vp.width + 0.5);
      expect(l.canvasHeight).toBeLessThanOrEqual(vp.height + 0.5);
    }
  });
});
