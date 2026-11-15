import { describe, expect, it } from "vitest";
import { Tile } from "../src/engine/tilegrid";
import type { Gimmick } from "../src/game/gimmicks/types";
import { BLAST_SIZE } from "../src/game/gimmicks/bomb";
import type { StageData } from "../src/game/stageData";
import { TILE } from "../src/game/tuning";
import {
  newStage,
  standOn,
  walkRight,
  type StageRig,
} from "./helpers/stage";

/**
 * 爆弾ギミックの単体テスト。小さな合成ステージで規則だけを見る
 * （5-1 の盤面は tests/stage16.test.ts）。
 *
 * 盤面（20×8、床は行7、立つのは行6）:
 *   爆弾 (8,6)。爆風は 72px 四方で、爆弾の中心 (204,159) から x=168..240, y=123..195。
 *   つまりタイル x=7..9, y=5..7 に掛かる。
 *   B (9,5) (9,6) = 爆風の内側 / B (10,6) = すぐ外側（x=240 から） / B (9,2) = 上の外側 / B (13,6) = 遠い（運んだ先でだけ掛かる）
 *   # (7,5) = 爆風の内側の壁（壊れてはいけない）。床の行7 も内側に掛かる。
 *   板 (15,6) が "boom" を出す。スポーンは (3,6) と (5,6)。
 */
const ROWS = [
  "####################",
  "#..................#",
  "#........B.........#",
  "#..................#",
  "#..................#",
  "#......#.B.........#",
  "#........BB..B.....#",
  "####################",
];

function synthetic(
  bomb: Record<string, unknown> = { listen: ["boom"] },
  plateX = 15,
): StageData {
  return {
    id: "bomb-test",
    name: "bomb-test",
    world: 5,
    tileSize: 24,
    grid: ROWS,
    spawns: [
      { x: 3, y: 6 },
      { x: 5, y: 6 },
    ],
    gimmicks: [
      { type: "plate", x: plateX, y: 6, emit: "boom" },
      { type: "bomb", x: 8, y: 6, ...bomb },
    ],
  };
}

interface BombLike extends Gimmick {
  readonly carriedBy: number | null;
}

function bomb(s: StageRig): BombLike {
  return s.game.stage.gimmicks.find((g) => g.type === "bomb") as BombLike;
}

function at(s: StageRig, tx: number, ty: number): Tile {
  return s.game.stage.grid.at(tx, ty);
}

/** P1 に爆弾を拾わせ、P2 を板から離れた位置に置く。 */
function pickedUp(): StageRig {
  const s = newStage(synthetic());
  standOn(s.p1, 8, 6);
  s.step(2);
  return s;
}

function px(p: StageRig["p1"]): { x: number; y: number } {
  return { x: p.box.x, y: p.box.y };
}

describe("爆弾: 拾う・運ぶ", () => {
  it("置いてある間は誰も運んでいない", () => {
    const s = newStage(synthetic());
    s.step(5);
    expect(bomb(s).carriedBy).toBeNull();
  });

  it("触れた人の頭に載る", () => {
    const s = pickedUp();
    expect(bomb(s).carriedBy).toBe(0);
  });

  it("運び役の頭の上（爆弾の下端 = 運び役の上端）に付いてくる", () => {
    const s = pickedUp();
    const b = bomb(s);
    expect(b.aabb.y + b.aabb.h).toBe(s.p1.box.y);
    walkRight(s, s.p1, 20);
    expect(b.aabb.y + b.aabb.h).toBe(s.p1.box.y);
    expect(b.aabb.x + b.aabb.w / 2).toBeCloseTo(s.p1.box.x + s.p1.box.w / 2, 5);
  });

  it("運び役が跳んでいる間も頭の上に付いてくる（描画前の値は1ステップ遅れる）", () => {
    const s = pickedUp();
    const b = bomb(s);
    const startY = s.p1.box.y;
    let maxRise = 0;
    // 爆弾は update（移動の前）で引き直すので、ステップ直後の aabb は直前のステップ終了時の
    // 運び役に付いている。描画 (draw) がもう一度合わせるので見た目は頭の上。
    let prevTop = s.p1.box.y;
    walkRight(s, s.p1, 40, {
      jump: true,
      until: () => {
        maxRise = Math.max(maxRise, startY - s.p1.box.y);
        expect(b.aabb.y + b.aabb.h).toBe(prevTop);
        prevTop = s.p1.box.y;
        return false;
      },
    });
    expect(maxRise).toBeGreaterThan(20); // 本当に跳んでいる
    s.step(60);
    // 着地して止まれば、ぴったり頭の上
    expect(b.aabb.y + b.aabb.h).toBe(s.p1.box.y);
  });

  it("運ばれている間は、相方が触れても横取りできない", () => {
    const s = pickedUp();
    // 相方を爆弾（P1 の頭）に重ねる
    const b = bomb(s);
    s.p2.teleport(b.aabb.x, b.aabb.y - 2);
    s.step(5);
    expect(bomb(s).carriedBy).toBe(0);
  });

  it("運び役が降ろす手段はない（歩く・跳ぶで落ちない）", () => {
    const s = pickedUp();
    walkRight(s, s.p1, 30, { jump: true });
    expect(bomb(s).carriedBy).toBe(0);
  });
});

describe("爆弾: 起爆", () => {
  /** P1 が拾った状態で、P2 が板を踏む。 */
  function detonate(s: StageRig): void {
    standOn(s.p2, 15, 6);
    s.step(2);
  }

  it("信号が立つまでは爆発しない", () => {
    const s = pickedUp();
    s.step(30);
    expect(bomb(s).carriedBy).toBe(0);
    expect(at(s, 9, 6)).toBe(Tile.Brick);
  });

  it("立ち上がりで爆発し、運び役は手放す", () => {
    const s = pickedUp();
    detonate(s);
    expect(at(s, 9, 6)).toBe(Tile.Empty);
    expect(bomb(s).carriedBy).toBeNull();
  });

  it("板を踏み続けても再び爆発しない。離して踏み直すと爆発する", () => {
    const s = pickedUp();
    detonate(s);
    expect(at(s, 9, 6)).toBe(Tile.Empty);

    // 爆弾が戻って拾われても、板を踏みっぱなしの間は爆発しない
    s.game.stage.grid.set(9, 6, Tile.Brick);
    standOn(s.p1, 8, 6);
    s.step(60); // 0.8 秒の待ちを超える。戻った爆弾に P1 が触れて拾う
    expect(bomb(s).carriedBy).toBe(0);
    expect(at(s, 9, 6)).toBe(Tile.Brick); // 板は押されたまま = 立ち上がりが無い

    // 離す
    standOn(s.p2, 12, 6);
    s.step(3);
    expect(at(s, 9, 6)).toBe(Tile.Brick);
    // もう一度踏むと、もう一度爆発する
    standOn(s.p2, 15, 6);
    s.step(2);
    expect(at(s, 9, 6)).toBe(Tile.Empty);
  });
});

describe("爆弾: 爆風の範囲", () => {
  it("爆風は 72px 四方", () => {
    expect(BLAST_SIZE).toBe(72);
  });

  it("範囲内の B だけ壊れ、外の B と # は残る", () => {
    const s = pickedUp();
    standOn(s.p2, 15, 6);
    s.step(2);
    // 内側
    expect(at(s, 9, 5)).toBe(Tile.Empty);
    expect(at(s, 9, 6)).toBe(Tile.Empty);
    // 外側の B
    expect(at(s, 10, 6)).toBe(Tile.Brick);
    expect(at(s, 9, 2)).toBe(Tile.Brick);
    // 内側の # と床は残る
    expect(at(s, 7, 5)).toBe(Tile.Solid);
    expect(at(s, 9, 7)).toBe(Tile.Solid);
    expect(at(s, 8, 7)).toBe(Tile.Solid);
  });

  it("爆弾を運んだ先が中心になる（家では届かない (13,6) が壊れる）", () => {
    const s = pickedUp();
    standOn(s.p1, 12, 6);
    s.step(2);
    expect(bomb(s).carriedBy).toBe(0);
    standOn(s.p2, 15, 6);
    s.step(2);
    expect(at(s, 13, 6)).toBe(Tile.Empty);
    expect(at(s, 9, 6)).toBe(Tile.Brick); // 元の場所のブロックは無傷
  });
});

describe("爆弾: 人の巻き込み", () => {
  it("運び役は必ずスポーンへ戻される", () => {
    const s = pickedUp();
    standOn(s.p2, 15, 6);
    s.step(2);
    expect(s.p1.box.x).toBe(3 * TILE);
    expect(s.p1.box.y + s.p1.box.h).toBe(7 * TILE);
  });

  it("爆風の外の相方は動かない", () => {
    const s = pickedUp();
    standOn(s.p2, 15, 6);
    const before = px(s.p2);
    s.step(2);
    expect(px(s.p2)).toEqual(before);
  });

  it("爆風の中の相方はスポーンへ戻される", () => {
    // 板を (7,6) に置く: 爆弾 (8,6) の爆風 x=168..240 の内側
    const s = newStage(synthetic({ listen: ["boom"] }, 7));
    standOn(s.p1, 8, 6);
    s.step(2);
    expect(bomb(s).carriedBy).toBe(0);
    standOn(s.p2, 7, 6);
    expect(s.p2.box.x).toBeLessThan(240);
    s.step(2);
    expect(s.p2.box.x).toBe(5 * TILE); // P2 のスポーン (5,6)
    expect(s.p1.box.x).toBe(3 * TILE); // P1 のスポーン (3,6)
  });
});

describe("爆弾: 復帰とリセット", () => {
  it("爆発の 0.8 秒後に元の位置へ戻り、また拾える", () => {
    const s = pickedUp();
    standOn(s.p2, 15, 6);
    s.step(2);
    const b = bomb(s);
    // 消えている間は拾えない
    standOn(s.p1, 8, 6);
    s.step(10);
    expect(b.carriedBy).toBeNull();
    // 待てば戻る
    standOn(s.p2, 12, 6); // 板を離す
    s.step(60);
    expect(b.carriedBy).toBe(0);
    expect(b.aabb.y + b.aabb.h).toBe(s.p1.box.y);
  });

  it("戻ったあと、誰も居なければ元のタイルの床の上にある", () => {
    const s = pickedUp();
    standOn(s.p2, 15, 6);
    s.step(2);
    standOn(s.p1, 2, 6); // 爆弾から遠ざける
    s.step(60);
    const b = bomb(s);
    expect(b.carriedBy).toBeNull();
    expect(b.aabb.y + b.aabb.h).toBe(7 * TILE);
    expect(b.aabb.x + b.aabb.w / 2).toBe(8 * TILE + TILE / 2);
  });

  it("R でブロックと爆弾が元に戻る", () => {
    const s = pickedUp();
    standOn(s.p2, 15, 6);
    s.step(2);
    expect(at(s, 9, 6)).toBe(Tile.Empty);

    s.input.press("KeyR");
    s.step();
    expect(at(s, 9, 6)).toBe(Tile.Brick);
    expect(at(s, 9, 5)).toBe(Tile.Brick);
    expect(bomb(s).carriedBy).toBeNull();
    const b = bomb(s);
    expect(b.aabb.x + b.aabb.w / 2).toBe(8 * TILE + TILE / 2);
    expect(b.aabb.y + b.aabb.h).toBe(7 * TILE);
  });

  it("R で運搬中の爆弾も置き場所に戻る", () => {
    const s = pickedUp();
    walkRight(s, s.p1, 30);
    expect(bomb(s).carriedBy).toBe(0);
    s.input.press("KeyR");
    s.step();
    expect(bomb(s).carriedBy).toBeNull();
    expect(bomb(s).aabb.x + 9).toBe(8 * TILE + TILE / 2);
  });
});

describe("爆弾: ロード時の検査", () => {
  it("listen が無い爆弾はロード時に throw する", () => {
    expect(() => newStage(synthetic({}))).toThrow(/listen/);
  });

  it("listen が空配列でも throw する", () => {
    expect(() => newStage(synthetic({ listen: [] }))).toThrow(/listen/);
  });
});
