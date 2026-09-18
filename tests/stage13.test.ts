import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";
import { Tile } from "../src/engine/tilegrid";
import { DT, TILE } from "../src/game/tuning";
import type { StageData } from "../src/game/stageData";
import stage13 from "../src/stages/stage-13.json";

/**
 * ステージ4-2「Chimney」の検証 (docs/SPEC.md §7.22)。
 *
 * ボール A (2,12) は厚い壁 (16..18, 9..12) の根元に当てて崩すためのもの。
 * 同じ行に3回当てて初めてその段が抜ける。壁の向こうで待つ相方は
 * 4回目の返球で板になってしまうので、崩れたら2人とも跳んでやり過ごす。
 *
 * 壁を抜けた先の穴 (27,8) の下にはボール B (27,10) が浮いていて、
 * 真下から跳んで打つと真上の煙突 (27,1..7) を1本ずつ壊しながら飛んでいく。
 * 真下から少しでもずれて打つと斜めに飛んで壁に当たって消え、煙突は無傷のまま。
 *
 * 煙突を抜けた通路を左へ戻り、橋 (10..15, 8) を渡ってゴールする。
 * 橋は右端から3個までなら欠けても跳べるが、4個欠けると渡れない。
 */

const REST_A = { x: 2 * TILE + 7, y: 12 * TILE + 7 };
const REST_B = { x: 27 * TILE + 7, y: 10 * TILE + 7 };
const BRIDGE_X = [10, 11, 12, 13, 14, 15];
const WALL_X = [16, 17, 18];
const CHIMNEY_Y = [1, 2, 3, 4, 5, 6, 7];

function idle(): PlayerInput {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false };
}

type Sim = { game: Game; input: ScriptedInput; step: (n?: number) => void };

function newGame(): Sim {
  const input = new ScriptedInput([idle(), idle()]);
  const game = new Game(input, stage13 as StageData);
  game.start();
  const step = (n = 1): void => {
    for (let i = 0; i < n; i++) game.step(DT);
  };
  return { game, input, step };
}

function ballA(sim: Sim): { x: number; y: number } {
  return sim.game.stage.gimmicks[0]!.aabb;
}
function ballB(sim: Sim): { x: number; y: number } {
  return sim.game.stage.gimmicks[1]!.aabb;
}
function atRest(b: { x: number; y: number }, rest: { x: number; y: number }): boolean {
  return b.x === rest.x && b.y === rest.y;
}
function tile(sim: Sim, x: number, y: number): Tile {
  return sim.game.stage.grid.at(x, y);
}
function box(sim: Sim, i: number): { x: number; y: number; w: number; h: number } {
  return sim.game.players[i]!.box;
}
/** 壁 (16..18, y) が3列とも Empty か。 */
function wallRowOpen(sim: Sim, y: number): boolean {
  return WALL_X.every((x) => tile(sim, x, y) === Tile.Empty);
}
function wallRowBrick(sim: Sim, y: number): boolean {
  return WALL_X.every((x) => tile(sim, x, y) === Tile.Brick);
}
/** 壁の行の見た目（3マス分）を文字列化する。1マスずつ壊れていく様子を変化として数えるため。 */
function wallRowStr(sim: Sim, y: number): string {
  return WALL_X.map((x) => tile(sim, x, y)).join("");
}
function chimneyOpen(sim: Sim): boolean {
  return CHIMNEY_Y.every((y) => tile(sim, 27, y) === Tile.Empty);
}
function chimneyBrick(sim: Sim): boolean {
  return CHIMNEY_Y.every((y) => tile(sim, 27, y) === Tile.Brick);
}
function bridgeLeft(sim: Sim): number {
  return BRIDGE_X.filter((x) => tile(sim, x, 8) === Tile.Brick).length;
}

/** 汎用の歩行ヘルパー。dir=+1 で右へ、-1 で左へ untilX まで。詰まった/崖の手前で跳ぶ。 */
function walk(sim: Sim, i: number, dir: 1 | -1, untilX: number, frames = 60 * 15): void {
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
    const cliff = grounded && !grid.isSolid(Math.floor(frontX / TILE), Math.floor((b.y + b.h) / TILE));
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
  inp.left = false;
  inp.jumpHeld = false;
  inp.jumpPressed = false;
}

/** P1 がボール A を跳び越えて左側に回り込み、右へ歩いて打ち出す。 */
function kickA(sim: Sim): void {
  const inp = sim.input.inputs[0]!;
  let held = 0;
  for (let f = 0; f < 300 && box(sim, 0).x > TILE + 1; f++) {
    inp.left = true;
    inp.jumpPressed = false;
    const gap = box(sim, 0).x - (ballA(sim).x + 10);
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
  for (let f = 0; f < 120 && atRest(ballA(sim), REST_A); f++) {
    inp.right = true;
    sim.step();
  }
  inp.right = false;
}

/**
 * 近づいてくるボールを、指定した人たちで跳んでやり過ごす。
 * 元の位置に戻ったら true。
 */
function dodgeUntilRest(
  sim: Sim,
  ball: (sim: Sim) => { x: number; y: number },
  rest: { x: number; y: number },
  players: number[] = [0, 1],
): boolean {
  const held: Record<number, number> = {};
  for (const i of players) held[i] = 0;
  let prevX = ball(sim).x;
  for (let f = 0; f < 900; f++) {
    const vx = ball(sim).x - prevX;
    prevX = ball(sim).x;
    for (const i of players) {
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
    if (atRest(ball(sim), rest)) return true;
  }
  return false;
}

/** 真下（またはずれた位置）から跳んでボール B を打つ。 */
function jumpKickB(sim: Sim, x: number): void {
  sim.game.players[0]!.teleport(x, 12 * TILE);
  sim.step(5);
  const inp = sim.input.inputs[0]!;
  for (let k = 0; k < 20; k++) {
    inp.jumpPressed = k === 0;
    inp.jumpHeld = k < 15;
    sim.step();
  }
  inp.jumpHeld = false;
  inp.jumpPressed = false;
}

describe("4-2 Chimney", () => {
  it("壁は3列: 同じ行を3回返して初めてトンネルが開く", () => {
    const sim = newGame();
    sim.game.players[1]!.teleport(22 * TILE, 12 * TILE); // P2 は壁の向こうで待つ
    kickA(sim);
    let changes = 0;
    let prevRow = wallRowStr(sim, 12);
    for (let f = 0; f < 60 * 30 && !wallRowOpen(sim, 12); f++) {
      sim.step();
      const row = wallRowStr(sim, 12);
      if (row !== prevRow) {
        changes++;
        prevRow = row;
      }
    }
    expect(wallRowOpen(sim, 12)).toBe(true);
    expect(changes).toBe(3); // 1マスずつ、計3発当てて初めて行12が全部抜ける
    expect(wallRowBrick(sim, 9)).toBe(true);
    expect(wallRowBrick(sim, 10)).toBe(true);
    expect(wallRowBrick(sim, 11)).toBe(true);
    // 4回目は P2 に当たって戻るので、2人とも避ける
    expect(dodgeUntilRest(sim, ballA, REST_A)).toBe(true);
    expect(bridgeLeft(sim)).toBe(6);
  });

  it("浮いたボールは真下から跳んで打つと真上に飛び、煙突を1本ずつ壊す", () => {
    const sim = newGame();
    jumpKickB(sim, 27 * TILE + 2);
    expect(atRest(ballB(sim), REST_B)).toBe(false);
    let opened = false;
    for (let f = 0; f < 60 * 15 && !opened; f++) {
      sim.step();
      if (chimneyOpen(sim)) opened = true;
    }
    expect(chimneyOpen(sim)).toBe(true);
    let backAtRest = false;
    for (let f = 0; f < 600 && !backAtRest; f++) {
      sim.step();
      if (atRest(ballB(sim), REST_B)) backAtRest = true;
    }
    expect(backAtRest).toBe(true);
    expect(tile(sim, 26, 8)).toBe(Tile.Solid);
    expect(tile(sim, 28, 8)).toBe(Tile.Solid);
    expect(tile(sim, 27, 8)).toBe(Tile.Empty);
  });

  it("真下から12pxずれて打つと斜めに飛んで消え、煙突は無傷", () => {
    const sim = newGame();
    jumpKickB(sim, 27 * TILE + 2 + 12);
    sim.step(60 * 3);
    expect(chimneyBrick(sim)).toBe(true);
    expect(atRest(ballB(sim), REST_B)).toBe(true);
  });

  it("想定手順で2人ともゴールに到達できる", () => {
    const sim = newGame();
    sim.game.players[1]!.teleport(22 * TILE, 12 * TILE); // P2 は壁の向こうで待つ
    kickA(sim);
    for (let f = 0; f < 60 * 30 && !wallRowOpen(sim, 12); f++) sim.step();
    expect(wallRowOpen(sim, 12)).toBe(true);
    expect(dodgeUntilRest(sim, ballA, REST_A)).toBe(true);

    walk(sim, 0, 1, 27 * TILE + 2);
    walk(sim, 1, 1, 30 * TILE);

    jumpKickB(sim, 27 * TILE + 2);
    for (let f = 0; f < 60 * 15 && !chimneyOpen(sim); f++) sim.step();
    expect(chimneyOpen(sim)).toBe(true);
    for (let f = 0; f < 600 && !atRest(ballB(sim), REST_B); f++) sim.step();
    expect(atRest(ballB(sim), REST_B)).toBe(true);

    walk(sim, 0, 1, 37 * TILE + 2);
    walk(sim, 0, -1, 3 * TILE);
    walk(sim, 1, 1, 37 * TILE + 2);
    walk(sim, 1, -1, 3 * TILE + 24);
    sim.step(10);

    expect(sim.game.phase).toBe("cleared");
    expect(bridgeLeft(sim)).toBe(6);
  });

  it("橋は右端から3個までなら欠けても跳べ、4個欠けると渡れない", () => {
    for (const missing of [3, 4]) {
      const sim = newGame();
      for (let x = 16 - missing; x <= 15; x++) sim.game.stage.grid.set(x, 8, Tile.Empty);
      sim.game.players[0]!.teleport(20 * TILE, 7 * TILE);
      walk(sim, 0, -1, 3 * TILE, 60 * 8);
      const b = box(sim, 0);
      const crossed = b.y <= 7 * TILE && b.x <= 9 * TILE;
      expect(crossed, `${missing}個欠け`).toBe(missing === 3);
    }
  });

  it("R でやり直すと壁も煙突も戻る", () => {
    const sim = newGame();
    sim.game.stage.grid.set(16, 12, Tile.Empty);
    sim.game.stage.grid.set(27, 7, Tile.Empty);
    sim.input.press("KeyR");
    sim.step(2);
    expect(tile(sim, 16, 12)).toBe(Tile.Brick);
    expect(tile(sim, 27, 7)).toBe(Tile.Brick);
    expect(atRest(ballA(sim), REST_A)).toBe(true);
    expect(atRest(ballB(sim), REST_B)).toBe(true);
  });
});
