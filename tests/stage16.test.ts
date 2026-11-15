import { describe, expect, it } from "vitest";
import { ScriptedInput } from "../src/engine/input";
import { Tile } from "../src/engine/tilegrid";
import { Game } from "../src/game/game";
import type { Gimmick } from "../src/game/gimmicks/types";
import { findStageIndex, stageLabel } from "../src/game/stageSelect";
import { TILE } from "../src/game/tuning";
import stage16 from "../src/stages/stage-16.json";
import { STAGES } from "../src/stages/index";
import { listWorlds } from "../src/stages/worlds";
import {
  expectCleared,
  feet,
  idle,
  newStage,
  rideOn,
  standOn,
  walkLeft,
  walkRight,
  type StageRig,
} from "./helpers/stage";

/**
 * 5-1「Courier」。
 *
 * 想定手順: P1 の頭から P2 が棚（行13、立つのは行12）へ跳び乗る（ブースト 82px。単独は 58px
 * なので届かない）。P1 が爆弾を頭に載せて右の壁まで運び、P2 が棚の板を踏んで起爆する。
 * 爆風は壁の `B` 3個を壊し、運び役の P1 をスポーンへ戻す。あとは2人で穴を抜けてゴール。
 *
 * 起爆役は棚の上（板）、運び役は壁際という配置が離れているので、「爆弾を持った人が
 * 自分で起爆する」ことはできず、運び役が必ず巻き込まれる。
 */

const FLOOR = 16 * TILE; // 立っているときの足元
const SHELF_TOP = 13 * TILE;
const WALL_X = 28 * TILE; // 壁の左端
const SPAWN_P1_X = 9 * TILE;

interface BombLike extends Gimmick {
  readonly carriedBy: number | null;
}

function bomb(s: StageRig): BombLike {
  return s.game.stage.gimmicks.find((g) => g.type === "bomb") as BombLike;
}

function wallBricks(s: StageRig): Tile[] {
  return [13, 14, 15].map((ty) => s.game.stage.grid.at(28, ty));
}

/** 手順1: P1 を棚の右隣に立たせ、頭から P2 が実際の入力で棚へ跳び乗り、板の手前で止まる。 */
function boostOntoShelf(s: StageRig): void {
  standOn(s.p1, 7, 15);
  s.step(5);
  rideOn(s.p2, s.p1);
  s.step(3);
  walkLeft(s, s.p2, 120, {
    jump: true,
    // 棚に着地していて、板 (列3〜4 = x<120) の手前（列5〜6）まで来たら止まる
    until: () => feet(s.p2) === SHELF_TOP && s.p2.box.x <= 5 * TILE + 8,
  });
  s.step(10);
}

describe("5-1 Courier: 登録", () => {
  it("ラベル 5-1 が stage-16 に解決される", () => {
    const i = findStageIndex(STAGES, "5-1");
    expect(i).not.toBeNull();
    expect(STAGES[i!]!.id).toBe("stage-16");
    expect(stageLabel(STAGES, i!)).toBe("5-1");
    expect(findStageIndex(STAGES, "stage-16")).toBe(i);
  });

  it("startIndex と skipSelect で、そのステージを遊び始める", () => {
    const startIndex = findStageIndex(STAGES, "5-1")!;
    const game = new Game(new ScriptedInput([idle(), idle()]), STAGES, {
      startIndex,
      skipSelect: true,
    });
    expect(game.phase).toBe("playing");
    expect(game.stage.data.id).toBe("stage-16");
  });

  it("ワールド選択に 5「爆弾」が並び、決定するとこのステージから始まる", () => {
    const w5 = listWorlds(STAGES).find((w) => w.world === 5);
    expect(w5?.name).toBe("爆弾");
    expect(STAGES[w5!.firstIndex]!.id).toBe("stage-16");

    // 実際の選択画面でも: 左を1回押すと末尾のワールド（5）に回り込む
    const input = new ScriptedInput([idle(), idle()]);
    const game = new Game(input, STAGES);
    expect(game.phase).toBe("select");
    input.inputs[0] = { ...idle(), left: true };
    game.step(1 / 60);
    input.inputs[0] = { ...idle(), jumpPressed: true };
    game.step(1 / 60);
    expect(game.stage.data.id).toBe("stage-16");
  });
});

describe("5-1 Courier: 盤面", () => {
  it("2人とも床の上にスポーンし、壁は B 3個、爆弾は置いてある", () => {
    const s = newStage(stage16);
    expect(feet(s.p1)).toBe(FLOOR);
    expect(feet(s.p2)).toBe(FLOOR);
    expect(wallBricks(s)).toEqual([Tile.Brick, Tile.Brick, Tile.Brick]);
    expect(bomb(s).carriedBy).toBeNull();
  });

  it("単独のジャンプでは棚（72px）に届かない（58px < 72px）", () => {
    // 棚の右隣・左隣・真下、それぞれから跳んで棚へ向かう。足が棚の上面より上に出ることは無い
    for (const [tx, walk] of [
      [7, walkLeft],
      [8, walkLeft],
      [2, walkRight],
      [1, walkRight],
    ] as const) {
      const s = newStage(stage16);
      standOn(s.p1, tx, 15);
      s.step(5);
      let minFeet = Infinity;
      walk(s, s.p1, 60, {
        jump: true,
        until: () => {
          minFeet = Math.min(minFeet, feet(s.p1));
          return false;
        },
      });
      s.step(60);
      expect(minFeet, `列${tx}から`).toBeGreaterThan(SHELF_TOP);
      expect(feet(s.p1), `列${tx}から`).toBe(FLOOR);
    }
  });

  it("相方の頭に乗れば棚に届く（ブースト 82px）", () => {
    const s = newStage(stage16);
    boostOntoShelf(s);
    expect(feet(s.p2)).toBe(SHELF_TOP);
    expect(s.p2.box.x).toBeLessThan(7 * TILE);
    expect(s.p2.box.x).toBeGreaterThan(5 * TILE - 24); // 板（x<120）の手前の棚の上
  });
});

describe("5-1 Courier: 壁は爆弾でしか開かない", () => {
  it("爆発させなければ、歩いてもジャンプしても壁（列28）の手前で止まる", () => {
    const s = newStage(stage16);
    walkRight(s, s.p1, 600);
    walkRight(s, s.p2, 600, { jump: true });
    for (const p of s.players) expect(p.box.x + p.box.w).toBeLessThanOrEqual(WALL_X);
    expect(wallBricks(s)).toEqual([Tile.Brick, Tile.Brick, Tile.Brick]);
  });

  it("爆弾が置いてある（誰も運んでいない）ままの爆発では壁は開かない", () => {
    const s = newStage(stage16);
    standOn(s.p1, 3, 12); // 板を踏む（棚の上へ置く）
    s.step(5);
    expect(bomb(s).carriedBy).toBeNull();
    expect(wallBricks(s)).toEqual([Tile.Brick, Tile.Brick, Tile.Brick]);
    standOn(s.p1, 20, 15); // 板を離れる。爆弾は戻っている
    s.step(60);
    walkRight(s, s.p2, 600);
    expect(s.p2.box.x + s.p2.box.w).toBeLessThanOrEqual(WALL_X);
  });
});

describe("5-1 Courier: 運び役と起爆役", () => {
  /** 手順1〜2: 棚へ上げ、P1 が爆弾を運んで壁際で止まる。 */
  function carriedToWall(): StageRig {
    const s = newStage(stage16);
    boostOntoShelf(s);
    walkRight(s, s.p1, 600); // 爆弾を拾い、壁で止まる
    return s;
  }

  it("P1 は走り抜ける途中で爆弾を拾い、壁際で止まる", () => {
    const s = carriedToWall();
    expect(bomb(s).carriedBy).toBe(0);
    expect(s.p1.box.x + s.p1.box.w).toBeLessThanOrEqual(WALL_X);
    expect(s.p1.box.x + s.p1.box.w).toBeGreaterThan(WALL_X - 4);
  });

  it("起爆で運び役はスポーンへ戻され、棚の上の起爆役は動かない", () => {
    const s = carriedToWall();
    const p2Before = { x: s.p2.box.x, y: s.p2.box.y };
    walkLeft(s, s.p2, 60, { until: () => s.p2.box.x < 4 * TILE });
    // 板の上に立っている。P2 が動いたのは歩いた分だけで、リスポーンではない
    expect(feet(s.p2)).toBe(SHELF_TOP);
    expect(s.p2.box.x).toBeLessThan(p2Before.x);
    expect(s.p2.box.x).toBeGreaterThan(2 * TILE);
    // P1 はスポーンへ
    expect(s.p1.box.x).toBe(SPAWN_P1_X);
    expect(feet(s.p1)).toBe(FLOOR);
    expect(bomb(s).carriedBy).toBeNull();
    expect(wallBricks(s)).toEqual([Tile.Empty, Tile.Empty, Tile.Empty]);
  });
});

describe("5-1 Courier: 通しクリア", () => {
  it("想定手順を実際の入力で踏んで、2人ともゴールに着く", () => {
    const s = newStage(stage16);

    // 1. P1 が棚の右隣に立ち、頭から P2 が棚へ跳び乗って、板の手前で待つ
    boostOntoShelf(s);
    expect(feet(s.p2)).toBe(SHELF_TOP);

    // 2. P1 が右へ歩く。途中の爆弾を拾い、頭に載せたまま壁で止まる
    walkRight(s, s.p1, 600);
    expect(bomb(s).carriedBy).toBe(0);
    expect(wallBricks(s)).toEqual([Tile.Brick, Tile.Brick, Tile.Brick]);

    // 3. P2 が板を踏む → 爆発。壁が壊れ、P1 はスポーンへ戻る
    walkLeft(s, s.p2, 60, { until: () => bomb(s).carriedBy === null });
    expect(wallBricks(s)).toEqual([Tile.Empty, Tile.Empty, Tile.Empty]);
    expect(s.p1.box.x).toBe(SPAWN_P1_X);
    s.step(60);

    // 4. P2 が棚から降り、2人で穴を抜けてゴールへ
    walkRight(s, s.p2, 120, { until: () => feet(s.p2) === FLOOR && s.p2.box.x > 8 * TILE });
    s.step(10);
    expect(feet(s.p2)).toBe(FLOOR);
    walkRight(s, s.p1, 600, { until: () => s.p1.box.x >= 35 * TILE });
    walkRight(s, s.p2, 600, { until: () => s.p2.box.x >= 34 * TILE });
    expectCleared(s);
  });
});
