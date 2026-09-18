import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";
import { Tile } from "../src/engine/tilegrid";
import { DT, TILE, VIEW_W } from "../src/game/tuning";
import type { StageData } from "../src/game/stageData";
import stage14 from "../src/stages/stage-14.json";

/**
 * ステージ4-3「Door」の検証 (docs/SPEC.md §7.23)。
 *
 * 80×18 で、ワールド4で初めて画面より広く、追従カメラが仕事をする。
 * ボール (2,12) はP1が左端から打ち返し続けるパワー。板 (24,10) は棚の上
 * (行11の`#`の上、行10)にあり、ボールの通り道(行12)からは外れているので、
 * 板を踏んでもボール自体には触れない。板を踏んでいる間だけ扉(30,12)が
 * 開き、ボールが通れるようになる。
 *
 * 扉を開けたまま同じ行12を3回打ち返すと厚い壁(33..35,12)にトンネルが開く
 * （行9..11は無傷のまま）。トンネルが開いた後の4発目まで板を踏み続けると
 * 谷の橋(50..55,12)に届いてブロックを1個壊してしまう。4発目が届く前
 * （P1からの片道 約2.3秒）に板を降りれば、扉が閉じてボールは消え、橋は
 * 無傷のまま残る。
 *
 * 飛んでいるボールはカメラが追う（Gimmick.cameraTarget）ので、壁を抜ける
 * 頃には scale が1を割り込み、橋まで飛ぶとさらに0.7台まで引く。
 */

const REST = { x: 2 * TILE + 7, y: 12 * TILE + 7 };
const WALL_X = [33, 34, 35];
const WALL_ROWS_ABOVE = [9, 10, 11];
const BRIDGE_X = [50, 51, 52, 53, 54, 55];

function idle(): PlayerInput {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false };
}

type Sim = { game: Game; input: ScriptedInput; step: (n?: number) => void };

function newGame(): Sim {
  const input = new ScriptedInput([idle(), idle()]);
  const game = new Game(input, stage14 as StageData);
  game.start();
  const step = (n = 1): void => {
    for (let i = 0; i < n; i++) game.step(DT);
  };
  return { game, input, step };
}

function ball(sim: Sim): { x: number; y: number } {
  return sim.game.stage.gimmicks[0]!.aabb;
}
function atRest(b: { x: number; y: number }): boolean {
  return b.x === REST.x && b.y === REST.y;
}
function tile(sim: Sim, x: number, y: number): Tile {
  return sim.game.stage.grid.at(x, y);
}
function box(sim: Sim, i: number): { x: number; y: number; w: number; h: number } {
  return sim.game.players[i]!.box;
}
/** 扉(ゲート)を含む、ギミック由来の Solid が1つも無いか＝扉が開いているか。 */
function doorOpen(sim: Sim): boolean {
  return sim.game.stage.solids().length === 0;
}
/** 厚い壁(33..35, 行12)の見た目（3マス分）を文字列化する。1マスずつ壊れる変化を数えるため。 */
function wallRowStr(sim: Sim): string {
  return WALL_X.map((x) => tile(sim, x, 12)).join("");
}
function wallRowOpen(sim: Sim): boolean {
  return WALL_X.every((x) => tile(sim, x, 12) === Tile.Empty);
}
function wallRowsAboveBrick(sim: Sim): boolean {
  return WALL_ROWS_ABOVE.every((y) => WALL_X.every((x) => tile(sim, x, y) === Tile.Brick));
}
function bridgeLeft(sim: Sim): number {
  return BRIDGE_X.filter((x) => tile(sim, x, 12) === Tile.Brick).length;
}
function bridgeStr(sim: Sim): string {
  return BRIDGE_X.map((x) => tile(sim, x, 12)).join("");
}

/** 汎用の歩行ヘルパー。dir=+1 で右へ、-1 で左へ untilX まで。詰まった/崖の手前で跳ぶ。 */
function walk(sim: Sim, i: number, dir: 1 | -1, untilX: number, frames = 60 * 20): void {
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

/** P2 が棚 (24..25, 11) の上の板 (24, 10) に乗る。手前で跳びながら右へ寄せる。 */
function climbPlate(sim: Sim): void {
  const inp = sim.input.inputs[1]!;
  let held = 0;
  for (let f = 0; f < 600; f++) {
    const b = box(sim, 1);
    inp.right = true;
    inp.jumpPressed = false;
    if (b.x >= 22 * TILE && sim.game.players[1]!.grounded && b.y > 10 * TILE && held === 0) {
      inp.jumpPressed = true;
      held = 25;
    }
    inp.jumpHeld = held > 0;
    if (held > 0) held--;
    sim.step();
    if (b.x >= 24 * TILE + 6 && b.y <= 10 * TILE + 0.5 && sim.game.players[1]!.grounded) break;
  }
  inp.right = false;
  inp.jumpHeld = false;
  sim.step(3);
}

/** P1 がボールを跳び越えて左側に回り込み、右へ歩いて打ち出す。打った後は少し引いて「壁」役に戻る。 */
function kick(sim: Sim): void {
  const inp = sim.input.inputs[0]!;
  let held = 0;
  for (let f = 0; f < 300 && box(sim, 0).x > TILE + 1; f++) {
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
  for (let f = 0; f < 120 && atRest(ball(sim)); f++) {
    inp.right = true;
    sim.step();
  }
  inp.right = false;
  // 打ち返した位置に居座って壁役になるため、少し左に戻って場所を空ける。
  for (let f = 0; f < 15; f++) {
    inp.left = true;
    sim.step();
  }
  inp.left = false;
}

describe("4-3 Door", () => {
  it("扉が閉じているとボールは扉で消え、壁は無傷", () => {
    const sim = newGame();
    kick(sim);
    let died = false;
    for (let f = 0; f < 60 && !died; f++) {
      sim.step();
      if (atRest(ball(sim))) died = true;
    }
    expect(died).toBe(true);
    expect(WALL_X.every((x) => tile(sim, x, 12) === Tile.Brick)).toBe(true);
    expect(doorOpen(sim)).toBe(false);
  });

  it("板を踏んでいる間だけ扉が開き、同じ行を3回返すとトンネルが開く。飛んでいる球をカメラが追う", () => {
    const sim = newGame();
    climbPlate(sim);
    expect(box(sim, 1).y).toBe(10 * TILE);
    expect(doorOpen(sim)).toBe(true);

    kick(sim);
    let changes = 0;
    let prevRow = wallRowStr(sim);
    let minScale = Infinity;
    for (let f = 0; f < 60 * 30 && !wallRowOpen(sim); f++) {
      sim.step();
      minScale = Math.min(minScale, sim.game.cameraView.scale);
      const row = wallRowStr(sim);
      if (row !== prevRow) {
        changes++;
        prevRow = row;
      }
    }
    expect(wallRowOpen(sim)).toBe(true);
    expect(changes).toBe(3);
    expect(wallRowsAboveBrick(sim)).toBe(true);
    // 球が遠くまで飛ぶ局面でカメラが引く（実測では最小 0.98 付近）。
    expect(minScale).toBeLessThan(1);
  });

  it("4発目の前に板から降りると球は扉で消え、橋は無傷", () => {
    const sim = newGame();
    climbPlate(sim);
    kick(sim);
    for (let f = 0; f < 60 * 30 && !wallRowOpen(sim); f++) sim.step();
    expect(wallRowOpen(sim)).toBe(true);

    walk(sim, 1, 1, 28 * TILE); // P2 が棚から歩いて降りる
    sim.step(5);
    expect(doorOpen(sim)).toBe(false);

    let restAgain = false;
    for (let f = 0; f < 60 * 15 && !restAgain; f++) {
      sim.step();
      if (atRest(ball(sim))) restAgain = true;
    }
    expect(restAgain).toBe(true);
    expect(bridgeLeft(sim)).toBe(6);
  });

  it("板に乗ったままだと4発目が橋を壊し、カメラは球を映す", () => {
    const sim = newGame();
    climbPlate(sim);
    kick(sim);
    for (let f = 0; f < 60 * 30 && !wallRowOpen(sim); f++) sim.step();
    expect(wallRowOpen(sim)).toBe(true);

    const before = bridgeStr(sim);
    let scaleAtChange = 1;
    let changed = false;
    for (let f = 0; f < 60 * 15 && !changed; f++) {
      sim.step();
      if (bridgeStr(sim) !== before) {
        changed = true;
        scaleAtChange = sim.game.cameraView.scale;
      }
    }
    expect(changed).toBe(true);
    expect(bridgeLeft(sim)).toBe(5);
    // 橋まで飛んだ球をカメラが追って大きく引く（実測 0.72）。
    expect(scaleAtChange).toBeLessThan(0.8);
  });

  it("想定手順で2人ともゴールに到達できる。カメラは右端で止まる", () => {
    const sim = newGame();
    climbPlate(sim);
    kick(sim);
    for (let f = 0; f < 60 * 30 && !wallRowOpen(sim); f++) sim.step();
    expect(wallRowOpen(sim)).toBe(true);

    walk(sim, 1, 1, 28 * TILE); // 4発目の前に P2 が板を降りる → 橋は無傷のまま
    sim.step(5);
    expect(doorOpen(sim)).toBe(false);
    for (let f = 0; f < 60 * 15 && !atRest(ball(sim)); f++) sim.step();
    expect(atRest(ball(sim))).toBe(true);
    expect(bridgeLeft(sim)).toBe(6);

    walk(sim, 0, 1, 74 * TILE + 4);
    walk(sim, 1, 1, 74 * TILE + 28);
    sim.step(10);

    if (sim.game.phase !== "cleared") {
      // 稀にカメラや着地の収束が step(10) 直後に間に合わない場合の保険。
      sim.step(120);
    }
    expect(sim.game.phase).toBe("cleared");
    expect(bridgeLeft(sim)).toBe(6);
    const cam = sim.game.cameraView;
    if (cam.scale !== 1 || cam.offsetX !== VIEW_W - 80 * TILE) {
      for (let f = 0; f < 120; f++) sim.step();
    }
    expect(sim.game.cameraView.scale).toBeCloseTo(1, 2);
    expect(sim.game.cameraView.offsetX).toBeCloseTo(VIEW_W - 80 * TILE, 0);
  });

  it("R でやり直すとトンネルが塞がり球も戻る", () => {
    const sim = newGame();
    sim.game.stage.grid.set(33, 12, Tile.Empty);
    sim.input.press("KeyR");
    sim.step(2);
    expect(tile(sim, 33, 12)).toBe(Tile.Brick);
    expect(atRest(ball(sim))).toBe(true);
  });
});
