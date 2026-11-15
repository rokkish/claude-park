import { describe, expect, it } from "vitest";
import { TILE } from "../src/game/tuning";
import stage05 from "../src/stages/stage-05.json";
import { expectCleared, feet, newStage, platform, rideOn, standOn } from "./helpers/stage";

/**
 * ステージ2-2「Counterweight」の検証 (docs/SPEC.md §7.x)。
 * 1つの信号 "sw1" が2つの足場を「from/to を入れ替えただけ」で逆向きに動かす
 * （つり合いおもり）。両方の棚は地面から144px（>86.5px＝頭に乗っても届かない）
 * で、足場に乗るしか登る方法が無い。
 */

const GROUND_TOP = 16 * TILE; // 384
const LEDGE_TOP = 10 * TILE; // 240
const LEFT_LEDGE_X = 11 * TILE; // 264 (左棚の左端)
const RIGHT_LEDGE_X = 30 * TILE; // 720 (右棚の左端)

describe("ステージ2-2のジオメトリ", () => {
  it("スポーンは2人ぶん、地面の上に立っている", () => {
    const s = newStage(stage05);
    expect(s.players).toHaveLength(2);
    for (const p of s.players) {
      expect(feet(p)).toBe(GROUND_TOP);
    }
  });

  it("両方の棚は地面から144px。左棚と右棚は336px離れていて跳躍不能", () => {
    expect(GROUND_TOP - LEDGE_TOP).toBe(144);
    // 左棚の右端(11+5タイル=384)から右棚の左端(720)まで
    expect(RIGHT_LEDGE_X - (LEFT_LEDGE_X + 5 * TILE)).toBe(336);
  });
});

describe("棚は単独では登れない（頭に乗っても届かない）", () => {
  it("左棚の真下から跳び続けても144pxには届かない", () => {
    const s = newStage(stage05);
    // 相方を隔離し、単独条件にする
    standOn(s.p2, 2, 15);
    // 足場Aの右（左棚の真下、足場と重ならない位置）
    standOn(s.p1, 15, 15);

    let highestFeet = Infinity;
    for (let i = 0; i < 180; i++) {
      s.input.inputs[0] = { left: false, right: false, jumpHeld: true, jumpPressed: i === 0 };
      s.step();
      highestFeet = Math.min(highestFeet, feet(s.p1));
    }

    // 単独到達は 384 - 62.5 ≒ 321.5。棚の上面 240 には届かない。
    expect(highestFeet).toBeGreaterThan(LEDGE_TOP);
  });
});

describe("信号が無い間、両足場は始点に留まる", () => {
  it("誰も板を踏んでいなければ、足場Aは低い位置、足場Bは高い位置のまま", () => {
    const s = newStage(stage05);
    standOn(s.p1, 2, 15);
    standOn(s.p2, 38, 15);

    s.step(60);

    expect(platform(s, 0).x).toBe(8 * TILE);
    expect(platform(s, 0).y).toBe(15 * TILE); // 低い位置（地面+24pxで乗れる高さ）
    expect(platform(s, 1).x).toBe(27 * TILE);
    expect(platform(s, 1).y).toBe(10 * TILE); // 高い位置（右棚の隣）
  });

  it("足場の低い位置は地面から24px above（乗り移れる高さ）", () => {
    const lowY = 15 * TILE;
    expect(GROUND_TOP - lowY).toBe(24);
  });
});

describe("つり合いおもり: 同じ信号が2つの足場を逆向きに動かす", () => {
  it("地上の板を踏むと、足場Aは上昇し足場Bは下降する（逆位相）", () => {
    const s = newStage(stage05);
    // p1 は地上の板 (4,15) を踏み続ける
    standOn(s.p1, 4, 15);
    // p2 は隔離
    standOn(s.p2, 38, 15);

    const a0 = platform(s, 0).y;
    const b0 = platform(s, 1).y;

    s.step(90); // 板の上で動かない

    expect(platform(s, 0).y).toBeLessThan(a0); // Aは上昇
    expect(platform(s, 1).y).toBeGreaterThan(b0); // Bは下降
  });

  it("足場Aに乗っている間、板を踏み続ける相方と一緒に乗員が持ち上げられる", () => {
    const s = newStage(stage05);
    standOn(s.p2, 4, 15); // 地上の板
    rideOn(s.p1, platform(s, 0)); // 足場Aの上（足場の上面=360pxに足が乗る高さ）

    const startY = s.p1.box.y;

    s.step(90);

    expect(s.p1.box.y).toBeLessThan(startY); // 持ち上げられている
    expect(feet(s.p1)).toBe(platform(s, 0).y); // 足場の上に乗ったまま
  });

  /**
   * 通しでクリアできることの証明。
   *
   * 初版は「右棚にゴール、板は地上と左棚だけ」という構成で、右棚へ上がるには
   * 誰かが板を離す必要があるのに離す役が右棚に居られず、1人しか到達できない
   * 詰み盤面だった。地形と足場の単体テストは全部通っていたので気付けなかった。
   * ここは想定手順をそのまま踏んで、最後まで到達できることを固定する。
   */
  it("想定手順で2人ともゴールに到達できる", () => {
    const s = newStage(stage05);
    const { p1, p2 } = s;
    const A = () => platform(s, 0);
    const B = () => platform(s, 1);
    const groundPlate = (): void => standOn(p1, 4, 15, 8);
    const away = (): void => standOn(p1, 20, 15);

    // 1. P1 が地上の板を踏むと B が下り、A が上がる（逆位相）
    groundPlate();
    s.step(120);
    expect(B().y).toBe(15 * TILE);
    expect(A().y).toBe(10 * TILE);

    // 2-3. P2 が B に乗り、P1 が離すと B が P2 を右棚へ運ぶ
    rideOn(p2, B());
    s.step(5);
    away();
    s.step(120);
    expect(feet(p2)).toBe(10 * TILE);

    // 4-5. 鍵を取り、B で地上へ戻る
    standOn(p2, 33, 9);
    s.step(10);
    rideOn(p2, B());
    groundPlate();
    s.step(120);
    expect(feet(p2)).toBe(15 * TILE);

    // 6-7. P2 が A に乗り換え、A で左棚へ
    standOn(p2, 24, 15);
    away();
    s.step(120);
    rideOn(p2, A());
    groundPlate();
    s.step(120);
    expect(feet(p2)).toBe(10 * TILE);

    // 8-10. P2 が板を踏み、残った P1 も A で左棚へ（ここが初版で詰んでいた区間）
    standOn(p2, 14, 9);
    away();
    s.step(120);
    expect(A().y).toBe(15 * TILE);

    rideOn(p1, A());
    s.step(5);
    expect(feet(p1)).toBe(15 * TILE);

    standOn(p2, 11, 9); // 棚の板
    s.step(120);
    expect(feet(p1)).toBe(10 * TILE); // 運ばれて棚の高さへ

    // 11. 2人とも棚の上を歩いてゴールへ
    standOn(p2, 13, 9);
    standOn(p1, 13, 9, 40);

    expectCleared(s);
  });
});
