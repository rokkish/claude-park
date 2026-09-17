import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";
import { Tile } from "../src/engine/tilegrid";
import { DT, TILE } from "../src/game/tuning";
import type { StageData } from "../src/game/stageData";
import stage12 from "../src/stages/stage-12.json";

/**
 * ステージ4-1「Breakout」の検証 (docs/SPEC.md §7.21)。
 *
 * ボールは人が触れると飛び、ブロック (B) を壊して跳ね返り、人に当たると跳ね返り、
 * 壁 (#) に当たると消えて元の位置に戻る。壁の根元のブロック (18,12) を壊さないと
 * 先へ進めず、谷に架かるブロックの橋 (26..31, 12) を壊しすぎると渡れない。
 *
 * 全部同じ高さ（行12）に並んでいるので、床に立ったまま打ち返し続けると
 * 壁の次は橋が1個ずつ壊れる。壁を抜けたら「返さずに跳んでやり過ごす」のが解。
 *
 * ボールは触れた人から離れる向きに飛ぶので、右へ打つには左側（壁との
 * 1タイルの隙間）に回り込む。線上に立っている人は誰でも板になるので、
 * 相方は跳んでボールを通す。
 */

const REST = { x: 2 * TILE + 7, y: 12 * TILE + 7 };
const BRIDGE_X = [26, 27, 28, 29, 30, 31];

function idle(): PlayerInput {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false };
}

type Sim = { game: Game; input: ScriptedInput; step: (n?: number) => void };

function newGame(): Sim {
  const input = new ScriptedInput([idle(), idle()]);
  const game = new Game(input, stage12 as StageData);
  game.start();
  const step = (n = 1): void => {
    for (let i = 0; i < n; i++) game.step(DT);
  };
  return { game, input, step };
}

function ball(sim: Sim): { x: number; y: number } {
  return sim.game.stage.gimmicks[0]!.aabb;
}
function atRest(sim: Sim): boolean {
  return ball(sim).x === REST.x && ball(sim).y === REST.y;
}
function tile(sim: Sim, x: number, y: number): Tile {
  return sim.game.stage.grid.at(x, y);
}
function bridgeLeft(sim: Sim): number {
  return BRIDGE_X.filter((x) => tile(sim, x, 12) === Tile.Brick).length;
}
function box(sim: Sim, i: number): { x: number; y: number; w: number; h: number } {
  return sim.game.players[i]!.box;
}

/** P1 がボールを跳び越えて左側に回り込み、右へ歩いてボールを打ち出す。 */
function kick(sim: Sim): void {
  const inp = sim.input.inputs[0]!;
  let held = 0;
  for (let f = 0; f < 300 && box(sim, 0).x > 1 * TILE + 1; f++) {
    inp.left = true;
    inp.jumpPressed = false;
    const gap = box(sim, 0).x - (ball(sim).x + 10);
    if (gap > 0 && gap < 30 && sim.game.players[0]!.grounded && held === 0) {
      inp.jumpPressed = true;
      held = 20;
    }
    inp.jumpHeld = held > 0;
    if (held > 0) held--;
    sim.step();
  }
  inp.left = false;
  inp.jumpHeld = false;
  expect(atRest(sim)).toBe(true); // 跳び越えただけでは動かない
  expect(box(sim, 0).x + box(sim, 0).w).toBeLessThan(ball(sim).x);
  for (let f = 0; f < 120 && atRest(sim); f++) {
    inp.right = true;
    sim.step();
  }
  inp.right = false;
  expect(atRest(sim)).toBe(false);
}

/** 壁の根元のブロックが壊れるまで待つ。 */
function waitWallBroken(sim: Sim): void {
  for (let f = 0; f < 600 && tile(sim, 18, 12) === Tile.Brick; f++) sim.step();
  expect(tile(sim, 18, 12)).toBe(Tile.Empty);
}

/**
 * 近づいてくるボールを、2人とも跳んでやり過ごす（どちら向きでも）。
 * ボールが元の位置に戻ったら true。
 */
function dodgeUntilRest(sim: Sim): boolean {
  const held = [0, 0];
  let prevX = ball(sim).x;
  for (let f = 0; f < 900; f++) {
    const vx = ball(sim).x - prevX;
    prevX = ball(sim).x;
    for (const i of [0, 1]) {
      const inp = sim.input.inputs[i]!;
      const b = box(sim, i);
      inp.jumpPressed = false;
      const gap = vx < 0 ? ball(sim).x - (b.x + b.w) : b.x - (ball(sim).x + 10);
      const incoming = vx !== 0 && gap > 20 && gap < 45;
      if (incoming && sim.game.players[i]!.grounded && held[i] === 0) {
        inp.jumpPressed = true;
        held[i] = 25;
      }
      inp.jumpHeld = held[i]! > 0;
      if (held[i]! > 0) held[i]!--;
    }
    sim.step();
    if (atRest(sim)) return true;
  }
  return false;
}

/** 右へ歩く。壁で止まったら、または一歩先が崖なら跳ぶ。 */
function walkRight(sim: Sim, i: number, untilX: number, frames = 60 * 15): void {
  const grid = sim.game.stage.grid;
  let lastX = box(sim, i).x;
  let stuck = 0;
  let held = 0;
  for (let f = 0; f < frames && box(sim, i).x < untilX; f++) {
    const inp = sim.input.inputs[i]!;
    const b = box(sim, i);
    const grounded = sim.game.players[i]!.grounded;
    inp.right = true;
    inp.jumpPressed = false;
    stuck = Math.abs(b.x - lastX) < 0.01 && grounded ? stuck + 1 : 0;
    const cliff = grounded && !grid.isSolid(Math.floor((b.x + b.w + 2) / TILE), Math.floor((b.y + b.h) / TILE));
    if ((stuck > 3 || cliff) && held === 0) {
      inp.jumpPressed = true;
      held = 30;
      stuck = 0;
    }
    inp.jumpHeld = held > 0;
    if (held > 0) held--;
    lastX = b.x;
    sim.step();
  }
  const inp = sim.input.inputs[i]!;
  inp.right = false;
  inp.jumpHeld = false;
  inp.jumpPressed = false;
}

describe("4-1 Breakout", () => {
  it("ボールを使わずに壁は越えられない", () => {
    const sim = newGame();
    sim.game.players[0]!.teleport(300, 12 * TILE); // ボールより右から歩き出す
    walkRight(sim, 0, 20 * TILE, 60 * 5);
    expect(box(sim, 0).x).toBe(18 * TILE - 20);
    expect(tile(sim, 18, 12)).toBe(Tile.Brick);
  });

  it("触れたボールが壁の根元のブロックを壊す。壁に当たると消えて元の位置に戻る", () => {
    const sim = newGame();
    sim.game.players[1]!.teleport(34 * TILE, 12 * TILE); // P2 は線上に居ないよう橋の向こうで待つ
    kick(sim);
    waitWallBroken(sim);
    // 上のブロックは無傷で、穴は1タイル
    expect(tile(sim, 18, 11)).toBe(Tile.Brick);
    // 2人とも跳んでやり過ごすと、左の壁で消えて戻ってくる
    expect(dodgeUntilRest(sim)).toBe(true);
    expect(bridgeLeft(sim)).toBe(6);
  });

  it("線上に立っている人は誰でも板になる: 相方が避けないと壁まで届かない", () => {
    const sim = newGame();
    kick(sim); // P2 はスポーン (6,12) に立ったまま
    sim.step(60 * 5);
    expect(tile(sim, 18, 12)).toBe(Tile.Brick);
    expect(atRest(sim)).toBe(false); // P1 と P2 の間を往復している
  });

  it("床に立ったまま返し続けると橋が左から1個ずつ壊れる", () => {
    const sim = newGame();
    sim.game.players[1]!.teleport(34 * TILE, 12 * TILE); // P2 は線上に居ないよう橋の向こうで待つ
    kick(sim);
    waitWallBroken(sim);
    // 1往復 ≒ 5秒で1個。6個全部が消えるまで回す
    for (let f = 0; f < 60 * 60 && bridgeLeft(sim) > 0; f++) sim.step();
    expect(bridgeLeft(sim)).toBe(0);
  });

  it("想定手順で2人ともゴールに到達できる", () => {
    const sim = newGame();
    kick(sim);
    // P2 は跳んでボールを通し、壁が壊れて戻ってきたら2人とも跳んでやり過ごす
    expect(dodgeUntilRest(sim)).toBe(true);
    expect(tile(sim, 18, 12)).toBe(Tile.Empty);
    walkRight(sim, 0, 36 * TILE);
    walkRight(sim, 1, 36 * TILE + 20);
    sim.step(10);
    expect(sim.game.phase).toBe("cleared");
    expect(bridgeLeft(sim)).toBe(6);
  });

  it("橋は左から2個までなら欠けても渡れ、3個欠けると渡れない", () => {
    for (const missing of [2, 3]) {
      const sim = newGame();
      for (let x = 26; x < 26 + missing; x++) sim.game.stage.grid.set(x, 12, Tile.Empty);
      sim.game.players[0]!.teleport(23 * TILE, 12 * TILE);
      walkRight(sim, 0, 33 * TILE, 60 * 8);
      const crossed = box(sim, 0).x >= 32 * TILE && box(sim, 0).y <= 12 * TILE;
      expect(crossed, `${missing}個欠け`).toBe(missing === 2);
    }
  });

  it("R でやり直すと壊したブロックが戻る", () => {
    const sim = newGame();
    sim.game.players[1]!.teleport(34 * TILE, 12 * TILE);
    kick(sim);
    waitWallBroken(sim);
    sim.input.press("KeyR");
    sim.step(2);
    expect(tile(sim, 18, 12)).toBe(Tile.Brick);
    expect(atRest(sim)).toBe(true);
  });
});
