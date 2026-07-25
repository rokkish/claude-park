import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";
import { DT, TILE } from "../src/game/tuning";
import type { StageData } from "../src/game/stageData";
import stage04 from "../src/stages/stage-04.json";

/**
 * ステージ2-1「Ferry」の検証 (docs/SPEC.md §7.x)。
 * 板を押している間だけ動く足場が、336px（>87px＝跳躍不能）幅・120px
 * （>62.5px＝登り返し不能）深さの谷を渡す唯一の手段になっている。
 * 板は両岸にあり、どちらから乗っても同じチャンネル "sw1" を鳴らす。
 */

/** 両岸の地面（足場の高さも同じ）の上面。 */
const GROUND_TOP = 13 * TILE; // 312
/** 谷の左岸の右端＝足場の始点の左端が一致する場所。 */
const LEFT_BANK_EDGE = 13 * TILE; // 312
/** 谷の右岸の左端＝足場の終点の右端が一致する場所。 */
const RIGHT_BANK_EDGE = 27 * TILE; // 648

function idle(): PlayerInput {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false };
}

function newGame(): { game: Game; input: ScriptedInput } {
  const input = new ScriptedInput([idle(), idle()]);
  const game = new Game(input, stage04 as StageData);
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

describe("ステージ2-1のジオメトリ", () => {
  it("スポーンは2人ぶん、地面の上に立っている", () => {
    const { game } = newGame();
    expect(game.players).toHaveLength(2);
    for (const p of game.players) {
      expect(p.box.y + p.box.h).toBe(GROUND_TOP);
    }
  });

  it("足場の始点は左岸の縁に、終点の右端は右岸の縁にちょうど一致する", () => {
    const { game, input } = newGame();
    run(game, input, 1);
    const start = game.stage.solids()[0]!.box;
    expect(start.x).toBe(LEFT_BANK_EDGE);

    // 板を踏み続けて終点まで進めると、右端がちょうど右岸に届く
    const [, p2] = game.players;
    p2!.teleport(8 * TILE, 12 * TILE);
    run(game, input, 200);
    const end = game.stage.solids()[0]!.box;
    expect(end.x).toBe(24 * TILE);
    expect(end.x + end.w).toBe(RIGHT_BANK_EDGE);
  });
});

describe("谷は単独では渡れない", () => {
  it("板を踏み続けられる相方がいないと、足場は動かず、跳躍でも谷を越えられない", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    // 相方を対岸ではなく遠くへ隔離し、誰も板を踏んでいない状態を保つ
    p2!.teleport(35 * TILE, 12 * TILE);
    p1!.teleport(5 * TILE, 12 * TILE);

    let maxX = -Infinity;
    run(game, input, 180, (i) => {
      input.inputs[0] = { left: false, right: true, jumpHeld: true, jumpPressed: i === 0 };
      input.inputs[1] = idle();
      maxX = Math.max(maxX, p1!.box.x);
    });

    // 足場自体は左岸の縁に常駐している（信号が無いので動かない）ので
    // その上までは歩けるが、そこから先の谷（336px）は跳躍不能。
    expect(maxX).toBeLessThan(RIGHT_BANK_EDGE);
  });
});

describe("信号が無い間、足場は始点に留まる", () => {
  it("誰も板を踏んでいなければ足場は動かない", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    p1!.teleport(5 * TILE, 12 * TILE);
    p2!.teleport(35 * TILE, 12 * TILE);

    run(game, input, 60);

    const solid = game.stage.solids()[0]!.box;
    expect(solid.x).toBe(13 * TILE);
    expect(solid.y).toBe(13 * TILE);
  });
});

describe("板を踏み続けると足場が乗員を対岸まで運ぶ", () => {
  it("近い方の板に相方が乗っている間、足場は乗せた側を対岸へ運ぶ", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    // p2 は近い板 (8,12) の上に常駐
    p2!.teleport(8 * TILE, 12 * TILE);
    // p1 は足場の上に乗る
    p1!.teleport(14 * TILE, 12 * TILE);

    const startX = p1!.box.x;

    run(game, input, 200, () => {
      input.inputs[0] = idle();
      input.inputs[1] = idle(); // 乗ったままでも板の上に留まり続ける
    });

    const solid = game.stage.solids()[0]!.box;
    // 足場は終点 (24タイル=576) まで到達し、右端がちょうど右岸に届いている
    expect(solid.x).toBe(24 * TILE);
    expect(solid.x + solid.w).toBe(RIGHT_BANK_EDGE);
    // 乗せた p1 も、足場の全走行距離ぶん (264px) 一緒に運ばれている
    expect(p1!.box.x - startX).toBe(264);
    // 運ばれている間、足場の上に立ったまま
    expect(p1!.box.y + p1!.box.h).toBe(solid.y);
  });

  it("板から降ろすと足場は始点へ戻る", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    p2!.teleport(8 * TILE, 12 * TILE);

    run(game, input, 60);
    const movedX = game.stage.solids()[0]!.box.x;
    expect(movedX).toBeGreaterThan(13 * TILE);

    // 板から降ろす
    p2!.teleport(2 * TILE, 12 * TILE);
    run(game, input, 60);

    expect(game.stage.solids()[0]!.box.x).toBeLessThan(movedX);
    void p1;
  });
});
