import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";
import { DT, TILE } from "../src/game/tuning";
import type { StageData } from "../src/game/stageData";
import stage05 from "../src/stages/stage-05.json";

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

function idle(): PlayerInput {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false };
}

function newGame(): { game: Game; input: ScriptedInput } {
  const input = new ScriptedInput([idle(), idle()]);
  const game = new Game(input, stage05 as StageData);
  game.start();
  return { game, input };
}

function run(
  game: Game,
  input: ScriptedInput,
  steps: number,
  each?: (i: number) => void,
): void {
  for (let i = 0; i < steps; i++) {
    each?.(i);
    game.step(DT);
  }
  void input;
}

describe("ステージ2-2のジオメトリ", () => {
  it("スポーンは2人ぶん、地面の上に立っている", () => {
    const { game } = newGame();
    expect(game.players).toHaveLength(2);
    for (const p of game.players) {
      expect(p.box.y + p.box.h).toBe(GROUND_TOP);
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
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    // 相方を隔離し、単独条件にする
    p2!.teleport(2 * TILE, 15 * TILE);
    // 足場Aの右（左棚の真下、足場と重ならない位置）
    p1!.teleport(15 * TILE, 15 * TILE);

    let highestFeet = Infinity;
    run(game, input, 180, (i) => {
      input.inputs[0] = { left: false, right: false, jumpHeld: true, jumpPressed: i === 0 };
      input.inputs[1] = idle();
      highestFeet = Math.min(highestFeet, p1!.box.y + p1!.box.h);
    });

    // 単独到達は 384 - 62.5 ≒ 321.5。棚の上面 240 には届かない。
    expect(highestFeet).toBeGreaterThan(LEDGE_TOP);
  });
});

describe("信号が無い間、両足場は始点に留まる", () => {
  it("誰も板を踏んでいなければ、足場Aは低い位置、足場Bは高い位置のまま", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    p1!.teleport(2 * TILE, 15 * TILE);
    p2!.teleport(38 * TILE, 15 * TILE);

    run(game, input, 60);

    const [a, b] = game.stage.solids();
    expect(a!.box.x).toBe(8 * TILE);
    expect(a!.box.y).toBe(15 * TILE); // 低い位置（地面+24pxで乗れる高さ）
    expect(b!.box.x).toBe(27 * TILE);
    expect(b!.box.y).toBe(10 * TILE); // 高い位置（右棚の隣）
  });

  it("足場の低い位置は地面から24px above（乗り移れる高さ）", () => {
    const lowY = 15 * TILE;
    expect(GROUND_TOP - lowY).toBe(24);
  });
});

describe("つり合いおもり: 同じ信号が2つの足場を逆向きに動かす", () => {
  it("地上の板を踏むと、足場Aは上昇し足場Bは下降する（逆位相）", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    // p1 は地上の板 (4,15) を踏み続ける
    p1!.teleport(4 * TILE, 15 * TILE);
    // p2 は隔離
    p2!.teleport(38 * TILE, 15 * TILE);

    const [a0, b0] = game.stage.solids().map((s) => ({ ...s.box }));

    run(game, input, 90, () => {
      input.inputs[0] = idle(); // 板の上で動かない
      input.inputs[1] = idle();
    });

    const [a1, b1] = game.stage.solids();
    expect(a1!.box.y).toBeLessThan(a0!.y); // Aは上昇
    expect(b1!.box.y).toBeGreaterThan(b0!.y); // Bは下降
  });

  it("足場Aに乗っている間、板を踏み続ける相方と一緒に乗員が持ち上げられる", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    p2!.teleport(4 * TILE, 15 * TILE); // 地上の板
    p1!.teleport(9 * TILE, 14 * TILE); // 足場Aの上（足場の上面=360pxに足が乗る高さ）

    const startY = p1!.box.y;

    run(game, input, 90, () => {
      input.inputs[0] = idle();
      input.inputs[1] = idle();
    });

    const a = game.stage.solids()[0]!.box;
    expect(p1!.box.y).toBeLessThan(startY); // 持ち上げられている
    expect(p1!.box.y + p1!.box.h).toBe(a.y); // 足場の上に乗ったまま
  });
});
