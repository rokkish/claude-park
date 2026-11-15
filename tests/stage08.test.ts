import { describe, expect, it } from "vitest";
import { TILE } from "../src/game/tuning";
import stage08 from "../src/stages/stage-08.json";
import {
  crate,
  expectCleared,
  feet,
  gateClosed,
  newStage,
  standOn,
  walkLeft,
  walkRight,
} from "./helpers/stage";

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

/**
 * 箱を左の壁際まで押し切るのに十分なフレーム数。板Aは壁際にあるので、押し切れば
 * 必ず載る（行き過ぎて壁に詰まり、押し戻せなくなる事故が起きない配置）。
 */
const PUSH_FRAMES = 240;

describe("3-2 Double Lock", () => {
  it("2人とも地面の上にスポーンする", () => {
    const s = newStage(stage08);
    for (const p of s.players) {
      expect(feet(p)).toBe(GROUND);
    }
  });

  it("何も押さえていなければゲートは閉じている", () => {
    const s = newStage(stage08);
    s.step(10);
    expect(gateClosed(s)).toBe(true);
  });

  it("片方のチャンネルだけではゲートは開かない", () => {
    const s = newStage(stage08);

    // swB だけ（人が板Bに乗る。箱は初期位置でどの板にも載っていない）
    standOn(s.p1, 12, 15);
    standOn(s.p2, 30, 15);
    s.step(10);
    expect(gateClosed(s)).toBe(true);

    // swA だけ（箱を板Aへ、人はどの板にも乗らない）
    standOn(s.p1, 18, 15);
    crate(s).x = 1 * TILE;
    s.step(10);
    expect(gateClosed(s)).toBe(true);
  });

  it("箱が板Aに、人が板Bに乗るとゲートが開く", () => {
    const s = newStage(stage08);
    crate(s).x = 1 * TILE;
    standOn(s.p1, 12, 15);
    standOn(s.p2, 18, 15);
    s.step(10);

    expect(gateClosed(s)).toBe(false);
  });

  it("箱を左へ押して板Aに載せられる", () => {
    const s = newStage(stage08);
    standOn(s.p1, 11, 15); // 箱の右側に立つ
    standOn(s.p2, 30, 15);
    s.step(5);

    walkLeft(s, s.p1, PUSH_FRAMES);

    // 板A は x=24..72。箱は壁(x=24)まで押されて板の上に載る
    expect(crate(s).x).toBe(TILE);
  });

  it("人が2枚とも押さえても、押さえた本人はゲートを通れない（箱が必須）", () => {
    const s = newStage(stage08);
    standOn(s.p1, 1, 15); // 板A
    standOn(s.p2, 12, 15); // 板B
    s.step(10);
    expect(gateClosed(s)).toBe(false);

    // 板Bを離れた瞬間に swB が落ちてゲートが閉じるので、通り抜けられない
    walkRight(s, s.p2, 240);
    expect(s.p2.box.x + s.p2.box.w).toBeLessThanOrEqual(GATE_X);
  });

  /**
   * 通しでクリアできることの証明。2-2 で詰み盤面を出しているので、
   * 各ステージにこれを必ず置く。
   */
  it("想定手順で2人ともゴールに到達できる", () => {
    const s = newStage(stage08);
    const { p1, p2 } = s;

    // 1. P1 が箱を左へ押して板Aに載せる
    standOn(p1, 11, 15);
    standOn(p2, 16, 15);
    s.step(5);
    walkLeft(s, p1, PUSH_FRAMES);
    expect(crate(s).x).toBe(TILE);

    // 2. P1 が板Bに乗る -> swA(箱) と swB(人) が揃ってゲートが開く
    standOn(p1, 12, 15);
    s.step(10);
    expect(gateClosed(s)).toBe(false);

    // 3. P2 がゲートを抜け、向こう側の板Cに乗って swB を引き継ぐ
    standOn(p2, 27, 15);
    s.step(10);
    expect(gateClosed(s)).toBe(false);

    // 4. P1 が板Bを離れてもゲートは開いたまま。P1 も通り抜けられる
    standOn(p1, 25, 15);
    s.step(10);
    expect(gateClosed(s)).toBe(false);

    // 5. 2人ともゴールへ
    standOn(p1, 33, 15);
    standOn(p2, 33, 15, 30);

    expectCleared(s);
  });
});
