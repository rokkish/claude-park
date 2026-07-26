import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";
import { DT, TILE } from "../src/game/tuning";
import type { StageData } from "../src/game/stageData";
import stage11 from "../src/stages/stage-11.json";

/**
 * ステージ2-4「Tower」の検証 (docs/SPEC.md §7.16)。
 *
 * World 2 の総仕上げ。画面の上半分（島と棚は地面から288px）まで使う縦のステージで、
 * 1つの信号 "sw1" が2つの足場を逆位相で動かす。
 *
 *   sw1 OFF: リフトA=地上 / リフトB=最上段（島と棚を橋渡ししている）
 *   sw1 ON : リフトA=中段 / リフトB=中段（隣り合って乗り継げる）
 *
 * どちらの足場も道のりの半分しか行かないので、中段ですれ違う一瞬に
 * A から B へ乗り継ぐしかない（気づき①）。上の板は島の上にあり、島と棚を
 * つなぐ橋は B そのものなので、板を押した本人は島に取り残される（気づき②）。
 *
 * 高さで縛れるのは「地上→中段」だけで、そこは二段ジャンプ149pxに対して
 * 216px あるので余裕がある。中段より上は「1人しか中段に居られない」という
 * 要求の構造で縛っていて、跳躍力の見積もりに依存していない。
 */

const GROUND_TOP = 16 * TILE; // 384
const MID_TOP = 7 * TILE; // 168 (足場A・Bが出会う中段。地面から216px)
const UPPER_TOP = 4 * TILE; // 96 (島と棚の上面。地面から288px)

const A_LOW_Y = 15 * TILE; // 360 足場A の始点（地面から24px＝乗り移れる）
const ISLAND_RIGHT = 11 * TILE; // 264 島の右端
const LEDGE_LEFT = 17 * TILE; // 408 棚の左端

const GROUND_PLATE = { x: 2 * TILE + 8, y: 15 * TILE };
const ISLAND_PLATE = { x: 8 * TILE + 8, y: 3 * TILE };
/** 島の右端。板から降りるが島には残る位置。鍵2もここにある。 */
const ISLAND_EDGE = { x: 10 * TILE, y: 3 * TILE };
/** どの板にも乗っていない地上の待機位置。 */
const AWAY = { x: 20 * TILE, y: 15 * TILE };

function idle(): PlayerInput {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false };
}

function newGame(): { game: Game; input: ScriptedInput; step: (n?: number) => void } {
  const input = new ScriptedInput([idle(), idle()]);
  const game = new Game(input, stage11 as StageData);
  game.start();
  const step = (n = 1): void => {
    for (let i = 0; i < n; i++) game.step(DT);
  };
  return { game, input, step };
}

/** 足場は宣言順。solids() に出るのはこの2つだけ。 */
function liftA(game: Game): { x: number; y: number; w: number; h: number } {
  return game.stage.solids()[0]!.box;
}
function liftB(game: Game): { x: number; y: number; w: number; h: number } {
  return game.stage.solids()[1]!.box;
}

/** 足場の上に立たせる。上面にちょうど足が乗る高さへ置く。 */
function rideOn(
  p: { teleport: (x: number, y: number) => void },
  box: { x: number; y: number },
): void {
  p.teleport(box.x + 24, box.y - 24);
}

/** 指定プレイヤーだけを n フレーム右へ走らせる。 */
function runRight(input: ScriptedInput, step: (n?: number) => void, index: number, n: number): void {
  for (let i = 0; i < n; i++) {
    input.inputs[index] = { ...idle(), right: true };
    step(1);
  }
  input.inputs[index] = idle();
}

describe("ステージ2-4のジオメトリ", () => {
  it("スポーンは2人ぶん、地面の上に立っている", () => {
    const { game } = newGame();
    expect(game.players).toHaveLength(2);
    for (const p of game.players) {
      expect(p.box.y + p.box.h).toBe(GROUND_TOP);
    }
  });

  it("中段は地面から216px、島と棚は288px。画面の上半分を使う", () => {
    expect(GROUND_TOP - MID_TOP).toBe(216);
    expect(GROUND_TOP - UPPER_TOP).toBe(288);
    // 論理解像度は 960x432。上半分 (y < 216) に島・棚・足場Bの行程が入る。
    expect(UPPER_TOP).toBeLessThan(432 / 2);
  });

  it("足場Aの始点は地面から24px。ジャンプ無しで乗り移れる", () => {
    expect(GROUND_TOP - A_LOW_Y).toBe(24);
  });

  it("島と棚の間は144px空いている。橋になるのは足場Bだけ", () => {
    expect(LEDGE_LEFT - ISLAND_RIGHT).toBe(144);
    // 単独ジャンプの水平到達 約87px、二段ジャンプでも約102px。どちらも届かない。
    expect(LEDGE_LEFT - ISLAND_RIGHT).toBeGreaterThan(102);
  });
});

describe("逆位相: 1つの信号が2つの足場を逆向きに動かす", () => {
  it("誰も踏んでいなければ A は地上、B は最上段（島と棚が地続きになる）", () => {
    const { game, step } = newGame();
    step(60);

    expect(liftA(game).y).toBe(A_LOW_Y);
    expect(liftB(game).y).toBe(UPPER_TOP);
    // B が島の右端から棚の左端までを隙間なく埋めている
    expect(liftB(game).x).toBe(ISLAND_RIGHT);
    expect(liftB(game).x + liftB(game).w).toBe(LEDGE_LEFT);
  });

  it("板を踏むと A は上昇し B は下降して、中段で隣り合う（乗り継ぎ点）", () => {
    const { game, step } = newGame();
    const [p1, p2] = game.players;
    p1!.teleport(GROUND_PLATE.x, GROUND_PLATE.y);
    p2!.teleport(AWAY.x, AWAY.y);

    step(150);

    const a = liftA(game);
    const b = liftB(game);
    expect(a.y).toBe(MID_TOP);
    expect(b.y).toBe(MID_TOP); // 上面が揃う
    expect(a.x + a.w).toBe(b.x); // 横に隙間なく並ぶ
  });

  it("板を離すと A は地上へ、B は最上段へ戻る", () => {
    const { game, step } = newGame();
    const [p1, p2] = game.players;
    p1!.teleport(GROUND_PLATE.x, GROUND_PLATE.y);
    p2!.teleport(AWAY.x, AWAY.y);
    step(150);
    expect(liftA(game).y).toBe(MID_TOP);

    p1!.teleport(AWAY.x, AWAY.y);
    step(150);

    expect(liftA(game).y).toBe(A_LOW_Y);
    expect(liftB(game).y).toBe(UPPER_TOP);
  });
});

describe("中段は地上からは届かない", () => {
  it("地面で相方の頭に乗って跳ぶ二段ジャンプ(149px)でも中段に届かない", () => {
    const { game, input, step } = newGame();
    const [p1, p2] = game.players;
    // 塔を作る。P1 が土台、P2 がその頭の上。
    p1!.teleport(20 * TILE, 15 * TILE);
    p2!.teleport(20 * TILE, 14 * TILE);
    step(3);

    let highestFeet = Infinity;
    let upperJumped = false;
    for (let i = 0; i < 180; i++) {
      // 下が跳び、その頂点で上が跳ぶ＝二段ジャンプ
      const apex = p1!.vy >= 0 && i > 3;
      const fireUpper = apex && !upperJumped && i > 5;
      if (fireUpper) upperJumped = true;
      input.inputs[0] = { ...idle(), jumpHeld: true, jumpPressed: i === 1 };
      input.inputs[1] = { ...idle(), jumpHeld: true, jumpPressed: fireUpper };
      step(1);
      highestFeet = Math.min(highestFeet, p2!.box.y + p2!.box.h);
    }

    expect(upperJumped).toBe(true);
    // 384 - 149 = 235。中段(168)には67px足りない。
    expect(highestFeet).toBeGreaterThan(MID_TOP);
  });

  it("足場Aの始点(24px高い)の上で二段ジャンプしても中段に届かない", () => {
    const { game, input, step } = newGame();
    const [p1, p2] = game.players;
    rideOn(p1!, liftA(game));
    p1!.teleport(9 * TILE, 14 * TILE); // 足場Aの上（足元=360）
    p2!.teleport(9 * TILE, 13 * TILE); // その頭の上
    step(3);

    let highestFeet = Infinity;
    let upperJumped = false;
    for (let i = 0; i < 180; i++) {
      const fireUpper = p1!.vy >= 0 && !upperJumped && i > 5;
      if (fireUpper) upperJumped = true;
      input.inputs[0] = { ...idle(), jumpHeld: true, jumpPressed: i === 1 };
      input.inputs[1] = { ...idle(), jumpHeld: true, jumpPressed: fireUpper };
      step(1);
      highestFeet = Math.min(highestFeet, p2!.box.y + p2!.box.h);
    }

    expect(upperJumped).toBe(true);
    // 360 - 149 = 211。中段(168)には43px足りない。
    expect(highestFeet).toBeGreaterThan(MID_TOP);
  });
});

describe("気づき①: 足場は半分しか行かないので中段で乗り継ぐ", () => {
  it("A は乗員を地上から中段まで運ぶ（そこから先へは行かない）", () => {
    const { game, step } = newGame();
    const [p1, p2] = game.players;
    rideOn(p2!, liftA(game));
    p1!.teleport(GROUND_PLATE.x, GROUND_PLATE.y);

    step(200);

    expect(p2!.box.y + p2!.box.h).toBe(MID_TOP);
    expect(liftA(game).y).toBe(MID_TOP); // 上限で止まる
  });

  it("中段で B に乗り換えてから板を離すと、B が最上段まで運ぶ", () => {
    const { game, input, step } = newGame();
    const [p1, p2] = game.players;
    rideOn(p2!, liftA(game));
    p1!.teleport(GROUND_PLATE.x, GROUND_PLATE.y);
    step(150);
    expect(p2!.box.y + p2!.box.h).toBe(MID_TOP);

    // A から B へ歩いて乗り継ぐ
    runRight(input, step, 1, 45);
    expect(p2!.box.x).toBeGreaterThanOrEqual(liftB(game).x);

    // 板を離す＝B が上昇（同時に A は下降）
    p1!.teleport(AWAY.x, AWAY.y);
    step(200);

    expect(p2!.box.y + p2!.box.h).toBe(UPPER_TOP);
    expect(liftA(game).y).toBe(A_LOW_Y);
  });
});

describe("気づき②: 上の板は島の上にあり、橋は足場Bそのもの", () => {
  it("B が最上段にいる間は、島から棚まで歩いて渡れる", () => {
    const { game, input, step } = newGame();
    const [p1, p2] = game.players;
    p1!.teleport(AWAY.x, AWAY.y); // 誰も板を踏まない＝B は最上段のまま
    p2!.teleport(ISLAND_EDGE.x, ISLAND_EDGE.y);
    step(5);
    expect(liftB(game).y).toBe(UPPER_TOP);

    runRight(input, step, 1, 150);

    expect(p2!.box.x).toBeGreaterThanOrEqual(LEDGE_LEFT);
    expect(p2!.box.y + p2!.box.h).toBe(UPPER_TOP); // 段差なく棚へ渡れた
  });

  it("B が中段へ降りている間は、島から棚へは渡れない（押した本人が取り残される）", () => {
    const { game, input, step } = newGame();
    const [p1, p2] = game.players;
    p1!.teleport(GROUND_PLATE.x, GROUND_PLATE.y); // 相方が地上の板を踏み、B を降ろす
    p2!.teleport(ISLAND_EDGE.x, ISLAND_EDGE.y);
    step(150);
    expect(liftB(game).y).toBe(MID_TOP);

    let reachedLedge = false;
    for (let i = 0; i < 240; i++) {
      input.inputs[0] = idle();
      input.inputs[1] = { ...idle(), right: true, jumpHeld: true, jumpPressed: i % 30 === 0 };
      step(1);
      if (p2!.box.x + p2!.box.w > LEDGE_LEFT && p2!.box.y + p2!.box.h <= UPPER_TOP) {
        reachedLedge = true;
      }
    }

    expect(reachedLedge).toBe(false);
  });

  it("島の板でも A を呼べる（地上の板と同じ sw1）", () => {
    const { game, step } = newGame();
    const [p1, p2] = game.players;
    p1!.teleport(AWAY.x, AWAY.y);
    p2!.teleport(ISLAND_PLATE.x, ISLAND_PLATE.y);

    step(150);

    expect(liftA(game).y).toBe(MID_TOP);
    expect(liftB(game).y).toBe(MID_TOP);
  });
});

/**
 * 通しでクリアできることの証明。
 * 2-2 で「単体テストは全部通るのに詰み盤面」を出荷しているので、
 * ステージを足すときは必ずこれを置く。
 */
describe("想定手順で2人ともゴールに到達できる", () => {
  it("役割を交代しながら2往復すると、2人とも鍵2つを持って棚に立てる", () => {
    const { game, input, step } = newGame();
    const [p1, p2] = game.players;

    // 0. 初期状態: A は地上、B は最上段。
    step(5);
    expect(liftA(game).y).toBe(A_LOW_Y);
    expect(liftB(game).y).toBe(UPPER_TOP);

    // 1. P2 が A に乗り、P1 が地上の板を踏む。A が上がり B が降りてくる。
    rideOn(p2!, liftA(game));
    p1!.teleport(GROUND_PLATE.x, GROUND_PLATE.y);
    step(150);
    expect(p2!.box.y + p2!.box.h).toBe(MID_TOP);
    expect(liftB(game).y).toBe(MID_TOP);

    // 2. P2 が A から B へ乗り継ぐ。途中に鍵1がある。
    runRight(input, step, 1, 45);
    expect(p2!.box.x).toBeGreaterThanOrEqual(liftB(game).x);

    // 3. P1 が板を離すと、B が P2 を最上段へ運び、A は地上へ戻る。
    p1!.teleport(AWAY.x, AWAY.y);
    step(200);
    expect(p2!.box.y + p2!.box.h).toBe(UPPER_TOP);
    expect(liftA(game).y).toBe(A_LOW_Y);

    // 4. P2 が島へ渡って鍵2を取る。ここまでは B が橋になっている。
    p2!.teleport(ISLAND_EDGE.x, ISLAND_EDGE.y);
    step(5);

    // 5. P1 が地上の A に乗り、P2 が島の板を踏む（＝自分は島に取り残される）。
    rideOn(p1!, liftA(game));
    step(5);
    expect(p1!.box.y + p1!.box.h).toBe(A_LOW_Y);
    p2!.teleport(ISLAND_PLATE.x, ISLAND_PLATE.y);
    step(200);
    expect(p1!.box.y + p1!.box.h).toBe(MID_TOP);
    expect(liftB(game).y).toBe(MID_TOP);

    // 6. P1 も中段で B に乗り継ぐ。
    runRight(input, step, 0, 45);
    expect(p1!.box.x).toBeGreaterThanOrEqual(liftB(game).x);

    // 7. P2 が板から降りると B が上昇し、P1 も最上段へ。橋も元に戻る。
    p2!.teleport(ISLAND_EDGE.x, ISLAND_EDGE.y);
    step(200);
    expect(p1!.box.y + p1!.box.h).toBe(UPPER_TOP);
    expect(liftB(game).y).toBe(UPPER_TOP);

    // 8. P2 が橋を渡って合流し、2人でゴールへ。
    runRight(input, step, 1, 150);
    expect(p2!.box.x).toBeGreaterThanOrEqual(LEDGE_LEFT);

    p1!.teleport(30 * TILE, 3 * TILE);
    p2!.teleport(30 * TILE + 30, 3 * TILE);
    step(10);

    expect(game.phase).toBe("cleared");
  });

  it("鍵を取らずにゴールへ行ってもクリアにならない（鍵2つが必須）", () => {
    const { game, step } = newGame();
    const [p1, p2] = game.players;
    p1!.teleport(30 * TILE, 3 * TILE);
    p2!.teleport(30 * TILE + 30, 3 * TILE);
    step(10);

    expect(game.phase).toBe("playing");
  });
});
