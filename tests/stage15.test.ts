import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";
import { Tile } from "../src/engine/tilegrid";
import { DT, TILE, VIEW_W } from "../src/game/tuning";
import type { StageData } from "../src/game/stageData";
import stage15 from "../src/stages/stage-15.json";

/**
 * ステージ4-4「Skylight」の検証 (docs/SPEC.md §7.24)。
 *
 * 80×18。浮いた球A (37,11) は袋小路の奥に置かれた箱に乗らないと届かない。
 * 立って横から打てば水平に飛び、頭上を素通りするだけだが、跳んで横から
 * 当てれば45°で斜め上に飛び、立つ位置によって天窓 (22,10) か (23,10) の
 * どちらを割るかが決まる。両方割った後は、箱を穴の縁に据えて片方から
 * 乗って中二階へ上がれる。中二階を渡った先の竪穴に落ちると奥の通路。
 * そこにある床の球B (44,12) を厚い壁 (60..62,12) に3回打ち込むとトンネル
 * が開き、ゴール (74,12) に届く。行11の壁は無傷のまま残す設計。
 */

const REST_A = { x: 37 * TILE + 7, y: 11 * TILE + 7 };
const REST_B = { x: 44 * TILE + 7, y: 12 * TILE + 7 };

function idle(): PlayerInput {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false };
}

type Sim = { game: Game; input: ScriptedInput; step: (n?: number) => void };

function newGame(): Sim {
  const input = new ScriptedInput([idle(), idle()]);
  const game = new Game(input, stage15 as StageData);
  game.start();
  const step = (n = 1): void => {
    for (let i = 0; i < n; i++) game.step(DT);
  };
  return { game, input, step };
}

function ballA(sim: Sim): { x: number; y: number } {
  return sim.game.stage.gimmicks[0]!.aabb;
}
function crate(sim: Sim): { x: number; y: number } {
  return sim.game.stage.gimmicks[1]!.aabb;
}
function ballB(sim: Sim): { x: number; y: number } {
  return sim.game.stage.gimmicks[2]!.aabb;
}
function atRest(b: { x: number; y: number }, r: { x: number; y: number }): boolean {
  return b.x === r.x && b.y === r.y;
}
function tile(sim: Sim, x: number, y: number): Tile {
  return sim.game.stage.grid.at(x, y);
}
function box(sim: Sim, i: number): { x: number; y: number; w: number; h: number } {
  return sim.game.players[i]!.box;
}
/** 天窓2枚 (22,10)/(23,10) を Tile の組として見る。 */
function sky(sim: Sim): [Tile, Tile] {
  return [tile(sim, 22, 10), tile(sim, 23, 10)];
}
/** 奥の厚い壁 (行 y, 60..62)。行12は割れる側、行11は無傷のまま残るはずの側。 */
function wallRow(sim: Sim, y: number): [Tile, Tile, Tile] {
  return [tile(sim, 60, y), tile(sim, 61, y), tile(sim, 62, y)];
}
function clear(sim: Sim, i: number): void {
  const inp = sim.input.inputs[i]!;
  inp.right = inp.left = inp.jumpHeld = inp.jumpPressed = false;
}

/** 汎用の歩行ヘルパー。dir=+1 で右へ、-1 で左へ untilX まで。詰まった/崖の手前で跳ぶ（無効化も可）。 */
function walk(
  sim: Sim,
  i: number,
  dir: 1 | -1,
  untilX: number,
  opts: { frames?: number; cliffJump?: boolean; stuckJump?: boolean } = {},
): void {
  const frames = opts.frames ?? 60 * 20;
  const cliffJump = opts.cliffJump ?? true;
  const stuckJump = opts.stuckJump ?? true;
  const grid = sim.game.stage.grid;
  let lastX = box(sim, i).x;
  let stuck = 0;
  let held = 0;
  for (let f = 0; f < frames; f++) {
    const inp = sim.input.inputs[i]!;
    const b = box(sim, i);
    const grounded = sim.game.players[i]!.grounded;
    if (dir > 0 ? b.x >= untilX : b.x <= untilX) break;
    inp.right = dir > 0;
    inp.left = dir < 0;
    inp.jumpPressed = false;
    stuck = Math.abs(b.x - lastX) < 0.01 && grounded ? stuck + 1 : 0;
    const frontX = dir > 0 ? b.x + b.w + 2 : b.x - 2;
    const cliff = cliffJump && grounded && !grid.isSolid(Math.floor(frontX / TILE), Math.floor((b.y + b.h) / TILE));
    if (((stuckJump && stuck > 3) || cliff) && held === 0) {
      inp.jumpPressed = true;
      held = 30;
      stuck = 0;
    }
    inp.jumpHeld = held > 0;
    if (held > 0) held--;
    lastX = b.x;
    sim.step();
  }
  clear(sim, i);
}

/** ジャンプ押しっぱなしで frames フレーム。dirAfter〜dirUntil の間だけ dir 方向に移動も入れる。 */
function jumpHold(sim: Sim, i: number, frames: number, dir: 0 | 1 | -1 = 0, dirAfter = 0, dirUntil = 999): void {
  const inp = sim.input.inputs[i]!;
  for (let f = 0; f < frames; f++) {
    const d = f >= dirAfter && f < dirUntil;
    inp.jumpPressed = f === 0;
    inp.jumpHeld = f < 25;
    inp.right = dir > 0 && d;
    inp.left = dir < 0 && d;
    sim.step();
  }
  clear(sim, i);
}

/** 跳び続けて球を斜めに返す。cond が真になるまで。 */
function jumpSpamUntil(sim: Sim, i: number, cond: () => boolean, max = 60 * 20): void {
  const inp = sim.input.inputs[i]!;
  for (let f = 0; f < max && !cond(); f++) {
    inp.jumpPressed = sim.game.players[i]!.grounded;
    inp.jumpHeld = true;
    sim.step();
  }
  clear(sim, i);
}

/** P2 が箱を跳び越えて袋小路の隅 (x≈940) に立つ。 */
function toCorner(sim: Sim): void {
  jumpHold(sim, 1, 40, 1, 0);
  walk(sim, 1, 1, 39 * TILE + 2, { stuckJump: false });
  sim.step(3);
}

/** 隅に居る P2 が箱に跳び乗る。 */
function mountCrate(sim: Sim): void {
  jumpHold(sim, 1, 35, -1, 3, 11);
  sim.step(3);
}

/** 箱の上の P2 が左へ歩いて浮いた球Aを左へ打ち、右へ歩いて隅に降りる。 */
function kickA(sim: Sim): void {
  const inp = sim.input.inputs[1]!;
  mountCrate(sim);
  for (let f = 0; f < 120 && atRest(ballA(sim), REST_A); f++) {
    inp.left = true;
    sim.step();
  }
  clear(sim, 1);
  for (let f = 0; f < 40; f++) {
    inp.right = true;
    sim.step();
  }
  clear(sim, 1);
  sim.step(5);
}

/** P2 が箱を dir 方向へ押す。cond が偽になるまで（または frames 経過）。 */
function pushCrate(sim: Sim, dir: 1 | -1, cond: () => boolean, frames: number): void {
  const inp = sim.input.inputs[1]!;
  for (let f = 0; f < frames && cond(); f++) {
    inp.right = dir > 0;
    inp.left = dir < 0;
    sim.step();
  }
  clear(sim, 1);
  sim.step(5);
}

/** 箱の縁に立っている人が、箱に触れるところまで dir 方向へ寄る。 */
function stepOntoCrateEdge(sim: Sim, i: number, dir: 1 | -1): void {
  const inp = sim.input.inputs[i]!;
  for (
    let f = 0;
    f < 60 && (dir > 0 ? box(sim, i).x < crate(sim).x + 3 : box(sim, i).x > Math.max(crate(sim).x + 1, 22 * TILE + 1));
    f++
  ) {
    inp.right = dir > 0;
    inp.left = dir < 0;
    sim.step();
  }
  clear(sim, i);
  sim.step(2);
}

/** 0. P2 が箱を袋小路 (x≈38) まで押し、跳び越えて隅へ。箱に乗って球Aを左へ打つ。 */
function setupBallA(sim: Sim): void {
  pushCrate(sim, 1, () => crate(sim).x < 38 * TILE - 8, 60 * 20);
  toCorner(sim);
  kickA(sim);
}

/** 球Aが元の位置へ静止するまで待つ。 */
function waitBallARest(sim: Sim, max = 600): void {
  for (let f = 0; f < max && !atRest(ballA(sim), REST_A); f++) sim.step();
}

/** 1. P1 が立つ位置(509→天窓22, 533→天窓23)で当たる天窓が決まる。両方割る。 */
function breakBothSkylights(sim: Sim): void {
  waitBallARest(sim);
  for (const [px] of [[509], [533]] as const) {
    walk(sim, 0, box(sim, 0).x < px ? 1 : -1, px, { stuckJump: false });
    sim.step(5);
    kickA(sim);
    const before = sky(sim).join(",");
    jumpSpamUntil(sim, 0, () => sky(sim).join(",") !== before || atRest(ballA(sim), REST_A));
    waitBallARest(sim, 300);
  }
}

/** 2. 箱を天窓の縁に据えて、P1→P2の順に中二階へ上がる。 */
function climbToMezzanine(sim: Sim): void {
  // 箱を天窓23の下へ。P1が左(22)から乗って右へ上がる。
  pushCrate(sim, -1, () => crate(sim).x > 23 * TILE + 10, 60 * 30);
  walk(sim, 0, 1, 22 * TILE + 2, { stuckJump: false });
  sim.step(3);
  jumpHold(sim, 0, 40, 1, 4, 12);
  sim.step(5);
  stepOntoCrateEdge(sim, 0, 1);
  jumpHold(sim, 0, 40, 1, 9, 13);
  sim.step(10);
  walk(sim, 0, 1, 26 * TILE, { cliffJump: false }); // 穴の上から離れておく

  // 箱を天窓22の下へずらす。P2が右(23)から乗って左へ上がる。
  pushCrate(sim, -1, () => crate(sim).x > 22 * TILE + 9, 60 * 10);
  jumpHold(sim, 1, 40, -1, 4, 12);
  sim.step(5);
  stepOntoCrateEdge(sim, 1, -1);
  jumpHold(sim, 1, 40, -1, 9, 13);
  sim.step(10);
}

/** 3. 中二階を右へ渡り、竪穴 (41..43) から奥の通路へ落ちる。 */
function crossToBackRoom(sim: Sim): void {
  walk(sim, 0, 1, 40 * TILE + 6); // 段は stuck-jump で越え、柱の上へ
  walk(sim, 0, 1, 42 * TILE, { cliffJump: false }); // 竪穴へ落ちる
  sim.step(40);
  walk(sim, 1, 1, 40 * TILE + 6);
  walk(sim, 1, 1, 41 * TILE + 2, { cliffJump: false });
  sim.step(40);
}

/** 4. 奥でP1が球Bを右へ打ち、立ったまま3回返して厚い壁を抜く。P2は41で待つ。戻り値: 変化回数。 */
function breakFarWall(sim: Sim): number {
  walk(sim, 1, -1, 41 * TILE + 2, { stuckJump: false });
  walk(sim, 0, box(sim, 0).x < 43 * TILE ? 1 : -1, 43 * TILE + 2, { stuckJump: false });
  sim.step(5);
  for (let f = 0; f < 600 && !atRest(ballB(sim), REST_B); f++) sim.step();

  const inp = sim.input.inputs[0]!;
  for (let f = 0; f < 120 && atRest(ballB(sim), REST_B); f++) {
    inp.right = true;
    sim.step();
  }
  clear(sim, 0);
  for (let f = 0; f < 15; f++) {
    inp.left = true;
    sim.step();
  }
  clear(sim, 0);

  let hits = 0;
  let prev = wallRow(sim, 12).join(",");
  for (let f = 0; f < 60 * 40 && !wallRow(sim, 12).every((t) => t === Tile.Empty); f++) {
    sim.step();
    const row = wallRow(sim, 12).join(",");
    if (row !== prev) {
      hits++;
      prev = row;
    }
  }
  for (let f = 0; f < 600 && !atRest(ballB(sim), REST_B); f++) sim.step();
  return hits;
}

/** 5. トンネルを抜けてゴールへ。 */
function reachGoal(sim: Sim): void {
  walk(sim, 0, 1, 74 * TILE + 4);
  walk(sim, 1, 1, 74 * TILE + 28);
  sim.step(10);
}

describe("4-4 Skylight", () => {
  it("浮いた球は箱の上から水平に打て、立っている人の頭上を通る", () => {
    const sim = newGame();
    setupBallA(sim);
    const a = sim.game.stage.gimmicks[0] as any;
    // 立ったまま横から打てば水平（vy===0）。高さも 11 行のまま。
    expect(a.vy).toBe(0);
    expect(ballA(sim).y).toBe(11 * TILE + 7);

    // P1 は出現位置 (spawn) から動いていない。ボールはその頭上を素通りして戻る。
    let rested = false;
    for (let f = 0; f < 600 && !rested; f++) {
      sim.step();
      if (atRest(ballA(sim), REST_A)) rested = true;
    }
    expect(rested).toBe(true);
    expect(tile(sim, 22, 10)).toBe(Tile.Brick);
    expect(tile(sim, 23, 10)).toBe(Tile.Brick);
  });

  it("跳んで返すと45°で、立つ位置で割れる天窓が決まる", () => {
    const sim = newGame();
    setupBallA(sim);
    waitBallARest(sim);

    // 509 → 天窓22 が割れる。23 は無傷のまま。
    walk(sim, 0, box(sim, 0).x < 509 ? 1 : -1, 509, { stuckJump: false });
    sim.step(5);
    kickA(sim);
    let before = sky(sim).join(",");
    jumpSpamUntil(sim, 0, () => sky(sim).join(",") !== before || atRest(ballA(sim), REST_A));
    waitBallARest(sim, 300);
    expect(tile(sim, 22, 10)).toBe(Tile.Empty);
    expect(tile(sim, 23, 10)).toBe(Tile.Brick);

    // 533 → 天窓23 が割れる。22 はそのまま(既に割れている)。
    walk(sim, 0, box(sim, 0).x < 533 ? 1 : -1, 533, { stuckJump: false });
    sim.step(5);
    kickA(sim);
    before = sky(sim).join(",");
    jumpSpamUntil(sim, 0, () => sky(sim).join(",") !== before || atRest(ballA(sim), REST_A));
    waitBallARest(sim, 300);
    expect(tile(sim, 22, 10)).toBe(Tile.Empty);
    expect(tile(sim, 23, 10)).toBe(Tile.Empty);

    // 外れ: P1 が 470 だと壁の# に当たって消える。天窓はどちらも変わらない。
    const miss = newGame();
    pushCrate(miss, 1, () => crate(miss).x < 38 * TILE - 8, 60 * 20);
    toCorner(miss);
    walk(miss, 0, 1, 470, { stuckJump: false });
    miss.step(5);
    kickA(miss);
    jumpSpamUntil(miss, 0, () => atRest(ballA(miss), REST_A), 60 * 10);
    expect(tile(miss, 22, 10)).toBe(Tile.Brick);
    expect(tile(miss, 23, 10)).toBe(Tile.Brick);
    expect(atRest(ballA(miss), REST_A)).toBe(true);
  });

  it("箱を穴の端に置き、左から乗って右へ上がり、箱をずらして右から乗って左へ上がる", () => {
    const sim = newGame();
    setupBallA(sim);
    breakBothSkylights(sim);

    pushCrate(sim, -1, () => crate(sim).x > 23 * TILE + 10, 60 * 30);
    expect(crate(sim).x).toBeGreaterThanOrEqual(552);
    expect(crate(sim).x).toBeLessThanOrEqual(560);

    walk(sim, 0, 1, 22 * TILE + 2, { stuckJump: false });
    sim.step(3);
    jumpHold(sim, 0, 40, 1, 4, 12);
    sim.step(5);
    expect(box(sim, 0).y).toBe(11 * TILE);

    stepOntoCrateEdge(sim, 0, 1);
    jumpHold(sim, 0, 40, 1, 9, 13);
    sim.step(10);
    expect(box(sim, 0).y).toBe(9 * TILE);

    walk(sim, 0, 1, 26 * TILE, { cliffJump: false });

    pushCrate(sim, -1, () => crate(sim).x > 22 * TILE + 9, 60 * 10);
    expect(crate(sim).x).toBeGreaterThanOrEqual(528);
    expect(crate(sim).x).toBeLessThanOrEqual(536);

    jumpHold(sim, 1, 40, -1, 4, 12);
    sim.step(5);
    expect(box(sim, 1).y).toBe(11 * TILE);

    stepOntoCrateEdge(sim, 1, -1);
    jumpHold(sim, 1, 40, -1, 9, 13);
    sim.step(10);
    expect(box(sim, 1).y).toBe(9 * TILE);
  });

  it("想定手順で2人ともゴールに到達できる。奥の厚い壁は3回", () => {
    const sim = newGame();
    setupBallA(sim);
    breakBothSkylights(sim);
    climbToMezzanine(sim);
    crossToBackRoom(sim);
    expect(atRest(ballB(sim), REST_B)).toBe(true);
    expect(wallRow(sim, 12)).toEqual([Tile.Brick, Tile.Brick, Tile.Brick]);

    const hits = breakFarWall(sim);
    expect(hits).toBe(3);
    expect(wallRow(sim, 12)).toEqual([Tile.Empty, Tile.Empty, Tile.Empty]);
    expect(wallRow(sim, 11)).toEqual([Tile.Brick, Tile.Brick, Tile.Brick]);

    reachGoal(sim);
    if (sim.game.phase !== "cleared") {
      sim.step(120);
    }
    expect(sim.game.phase).toBe("cleared");
    const cam = sim.game.cameraView;
    expect(cam.scale).toBeCloseTo(1, 2);
    expect(cam.offsetX).toBeCloseTo(VIEW_W - 80 * TILE, 0);
  });

  it("R でやり直すと天窓・箱・球が戻る", () => {
    const sim = newGame();
    sim.game.stage.grid.set(22, 10, Tile.Empty);
    sim.input.press("KeyR");
    sim.step(2);
    expect(tile(sim, 22, 10)).toBe(Tile.Brick);
    expect(crate(sim).x).toBe(30 * TILE);
    expect(atRest(ballA(sim), REST_A)).toBe(true);
    expect(atRest(ballB(sim), REST_B)).toBe(true);
  });
});
