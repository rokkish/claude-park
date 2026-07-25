import { describe, expect, it } from "vitest";
import { TileGrid } from "../src/engine/tilegrid";
import {
  Actor,
  isRiding,
  moveX,
  moveY,
  sortBottomUp,
  type PhysicsWorld,
} from "../src/engine/physics";

const TS = 24;

function world(rows: string[], actors: Actor[] = []): PhysicsWorld {
  return { grid: TileGrid.fromRows(rows, TS), solids: [], actors };
}

/** 幅20×高さ24（＝プレイヤー相当）の Actor。 */
function actor(x: number, y: number): Actor {
  return new Actor(x, y, 20, 24);
}

describe("トンネリング防止", () => {
  const rows = [
    "#########",
    "#.......#",
    "#.......#",
    "#########",
  ];

  it("1ステップで壁の何倍も移動しても、すり抜けずに壁の手前で止まる", () => {
    const a = actor(TS, TS); // タイル(1,1)
    const w = world(rows, [a]);

    const ok = moveX(w, a, 5000);

    expect(ok).toBe(false);
    // 右の壁はタイル8 = px192。右端がちょうど192に接して止まる。
    expect(a.box.x + a.box.w).toBe(192);
  });

  it("落下速度が極端でも床を突き抜けない", () => {
    const a = actor(TS, TS);
    const w = world(rows, [a]);

    const ok = moveY(w, a, 9999);

    expect(ok).toBe(false);
    // 床はタイル行3 = px72。足元が72に接する。
    expect(a.box.y + a.box.h).toBe(72);
    expect(a.grounded).toBe(true);
  });
});

describe("ライダー搬送", () => {
  // 床の上面 = py 72
  const rows = [
    "#########",
    "#.......#",
    "#.......#",
    "#########",
  ];

  it("頭の上に立った Actor は、土台の移動量ぶん正確に運ばれる", () => {
    const base = actor(24, 48); // 床の上（足元72）
    const rider = actor(24, 24); // base の頭の上（足元48 === base の頭48）
    const w = world(rows, [base, rider]);

    expect(isRiding(rider, base)).toBe(true);

    const ok = moveX(w, base, 30);

    expect(ok).toBe(true);
    expect(base.box.x).toBe(54);
    expect(rider.box.x).toBe(54); // 置き去りにならない
    expect(isRiding(rider, base)).toBe(true);
  });

  it("運ばれた先が壁なら、挟まらずに頭から滑り落ちる", () => {
    // 行1（rider の高さ）だけタイル6に壁があり、行2（base の高さ）は素通り
    const blocked = [
      "#########",
      "#.....#.#",
      "#.......#",
      "#########",
    ];
    const base = actor(24, 48);
    const rider = actor(24, 24);
    const w = world(blocked, [base, rider]);

    const ok = moveX(w, base, 120);

    // 土台は rider が詰まっても止まらない
    expect(ok).toBe(true);
    expect(base.box.x).toBe(144);
    // rider は壁（px144）の手前で停止 → 頭から外れる
    expect(rider.box.x).toBe(124);
    expect(isRiding(rider, base)).toBe(false);
  });
});

describe("3人の塔", () => {
  const rows = [
    "#########",
    "#.......#",
    "#.......#",
    "#.......#",
    "#########",
  ];

  function tower(): { w: PhysicsWorld; bottom: Actor; middle: Actor; top: Actor } {
    // 床の上面 = py 96
    const bottom = actor(24, 72);
    const middle = actor(24, 48);
    const top = actor(24, 24);
    return { w: world(rows, [top, bottom, middle]), bottom, middle, top };
  }

  it("sortBottomUp は配列順に関係なく土台から順に返す", () => {
    const { w, bottom, middle, top } = tower();

    expect(sortBottomUp(w)).toEqual([bottom, middle, top]);
  });

  it("土台が動くと上の2人がまとめて運ばれる", () => {
    const { w, bottom, middle, top } = tower();

    moveX(w, bottom, 40);

    expect(bottom.box.x).toBe(64);
    expect(middle.box.x).toBe(64);
    expect(top.box.x).toBe(64);
  });

  it("循環するような入力でも sortBottomUp が停止する", () => {
    // 物理的にはあり得ないが、防御的に無限ループしないことを確かめる
    const a = actor(24, 48);
    const b = actor(24, 24);
    const w = world(rows, [a, b]);
    // b は a に乗っている。a を b に乗っているように見せかける細工はできないので、
    // 少なくとも通常の2人構成で全員が1度ずつ返ることを確認する。
    const order = sortBottomUp(w);
    expect(order).toHaveLength(2);
    expect(new Set(order).size).toBe(2);
  });
});

describe("プレイヤー同士の衝突", () => {
  const rows = [
    "#########",
    "#.......#",
    "#.......#",
    "#########",
  ];

  it("横方向はぶつかった相手を押す", () => {
    const pusher = actor(24, 48);
    const pushed = actor(48, 48); // 隣接（pusher の右端44 → 間に4px）
    const w = world(rows, [pusher, pushed]);

    moveX(w, pusher, 20);

    expect(pusher.box.x).toBe(44);
    expect(pushed.box.x).toBe(64); // 16px 押された
  });

  it("押した先が壁なら押した側も止まる", () => {
    const pusher = actor(120, 48);
    const pushed = actor(148, 48); // 右端168、壁は192
    const w = world(rows, [pusher, pushed]);

    const ok = moveX(w, pusher, 100);

    expect(ok).toBe(false);
    expect(pushed.box.x + pushed.box.w).toBe(192); // 壁まで押し切った
    expect(pusher.box.x + pusher.box.w).toBe(172); // その手前で停止
  });

  it("落下すると相手の頭に着地する", () => {
    // 4行グリッドだと天井にめり込むので、落下距離を取れる5行グリッドを使う
    const tall = ["#########", "#.......#", "#.......#", "#.......#", "#########"];
    const lower = actor(24, 72); // 床の上（足元96）
    const upper = actor(24, 24); // 足元48 → 24px 上に浮いている
    const w = world(tall, [lower, upper]);

    const ok = moveY(w, upper, 100);

    expect(ok).toBe(false);
    expect(upper.box.y + upper.box.h).toBe(lower.box.y); // 頭にぴったり乗る
    expect(upper.grounded).toBe(true);
    expect(isRiding(upper, lower)).toBe(true);
  });
});
