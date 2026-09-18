import { describe, expect, it } from "vitest";
import { approachCamera, fitCamera, followCamera } from "../src/engine/camera";
import { Game } from "../src/game/game";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";
import { DT, VIEW_H, VIEW_W } from "../src/game/tuning";
import { STAGES } from "../src/stages/index";

const V = { w: VIEW_W, h: VIEW_H }; // 960 × 432
const box = (x: number, y: number) => ({ x, y, w: 20, h: 24 });

/** ワールド座標 x が画面内に映っているか。 */
function onScreen(view: { scale: number; offsetX: number }, x: number): boolean {
  const sx = x * view.scale + view.offsetX;
  return sx >= 0 && sx <= VIEW_W;
}

describe("followCamera", () => {
  it("ステージが画面に収まるなら fitCamera と同じ（既存ステージの見た目を変えない）", () => {
    const targets = [box(100, 300), box(800, 300)];
    expect(followCamera(targets, 960, 432, V.w, V.h)).toEqual(fitCamera(960, 432, V.w, V.h));
    expect(followCamera(targets, 960, 432, V.w, V.h)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it("横に2倍のステージで2人が近ければ等倍で中心を追う", () => {
    const view = followCamera([box(900, 300), box(1000, 300)], 1920, 432, V.w, V.h);
    expect(view.scale).toBe(1);
    // 2人の中心 (960, 312) が画面中央 (480, 216) に来る
    expect(view.offsetX).toBe(480 - 960);
    expect(view.offsetY).toBe(0); // 縦は収まるので中央 = 0
  });

  it("ステージの端より外は映さない", () => {
    expect(followCamera([box(30, 300), box(60, 300)], 1920, 432, V.w, V.h).offsetX).toBe(0);
    expect(followCamera([box(1850, 300), box(1880, 300)], 1920, 432, V.w, V.h).offsetX).toBe(
      VIEW_W - 1920,
    );
  });

  it("2人が離れると引きになり、両方が映る", () => {
    const view = followCamera([box(100, 300), box(1500, 300)], 1920, 432, V.w, V.h);
    expect(view.scale).toBeLessThan(1);
    expect(onScreen(view, 100)).toBe(true);
    expect(onScreen(view, 1520)).toBe(true);
    // 余白 96px を含めた幅 (1520 - 100 + 192) が画面幅に収まる倍率
    expect(view.scale).toBeCloseTo(VIEW_W / (1420 + 192), 6);
  });

  it("approachCamera は目標を追い越さず、繰り返せば一致する", () => {
    let view = { scale: 1, offsetX: 0, offsetY: 0 };
    const target = { scale: 0.5, offsetX: -300, offsetY: 10 };
    view = approachCamera(view, target, DT);
    expect(view.offsetX).toBeGreaterThan(-300);
    expect(view.offsetX).toBeLessThan(0);
    for (let i = 0; i < 600; i++) view = approachCamera(view, target, DT);
    expect(view.offsetX).toBeCloseTo(-300, 3);
    expect(view.scale).toBeCloseTo(0.5, 3);
    // dt が大きくても目標で止まる
    expect(approachCamera(view, target, 10)).toEqual(target);
  });
});

describe("Game のカメラ", () => {
  const idle = (): PlayerInput => ({ left: false, right: false, jumpHeld: false, jumpPressed: false });

  it("1画面に収まるステージは、遊んでいる間も等倍・原点のまま", () => {
    const fitting = STAGES.filter((d) => d.grid[0]!.length * d.tileSize <= VIEW_W);
    expect(fitting.length).toBeGreaterThan(0);
    for (const data of fitting) {
      const input = new ScriptedInput([idle(), idle()]);
      const game = new Game(input, data);
      game.start();
      input.inputs[0]!.right = true;
      for (let i = 0; i < 120; i++) game.step(DT);
      expect(game.cameraView, data.id).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
    }
  });

  it("画面より広いステージ (4-3) は、右へ歩くとカメラが追ってくる", () => {
    const data = STAGES.find((d) => d.id === "stage-14")!;
    const input = new ScriptedInput([idle(), idle()]);
    const game = new Game(input, data);
    game.start();
    expect(game.cameraView).toEqual({ scale: 1, offsetX: 0, offsetY: 0 }); // 左端では原点
    game.players[0]!.teleport(60 * 24, 12 * 24);
    game.players[1]!.teleport(62 * 24, 12 * 24);
    for (let i = 0; i < 120; i++) game.step(DT);
    const v = game.cameraView;
    expect(v.scale).toBe(1);
    expect(v.offsetX).toBeLessThan(0);
    expect(v.offsetX).toBeGreaterThanOrEqual(VIEW_W - 80 * 24);
  });
});
