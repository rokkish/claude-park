import { describe, expect, it } from "vitest";
import { TileGrid } from "../src/engine/tilegrid";
import {
  Actor,
  isCrushed,
  isRidingBox,
  moveSolids,
  type PhysicsWorld,
  type SolidBody,
} from "../src/engine/physics";

/**
 * SPEC §3.4 の Solid による搬送。
 * 仕様書には書いてあったが実装されておらず、動く床を作ると乗員をすり抜けて
 * 圧殺していた。World 2「動く足場」の土台になるので、挙動をここで固定する。
 */

const TS = 24;

/**
 *   #########   row0
 *   #.......#   row1  y 24..48
 *   #.......#   row2  y 48..72
 *   #.......#   row3  y 72..96
 *   #########   row4  y 96..120   床の上面 = 96、右の壁 = x 192
 */
const ROWS = ["#########", "#.......#", "#.......#", "#.......#", "#########"];

function actor(x: number, y: number): Actor {
  return new Actor(x, y, 20, 24);
}

function solidAt(x: number, y: number, w: number, h: number): SolidBody {
  return { box: { x, y, w, h }, dx: 0, dy: 0 };
}

function world(actors: Actor[], solids: SolidBody[]): PhysicsWorld {
  return { grid: TileGrid.fromRows(ROWS, TS), solids, actors };
}

/** ギミックがやることの再現: box を動かし、動いた量を申告する。 */
function drive(s: SolidBody, dx: number, dy: number): void {
  s.box.x += dx;
  s.box.y += dy;
  s.dx = dx;
  s.dy = dy;
}

describe("動く Solid の搬送", () => {
  it("横に動くと、乗っている Actor を同じ量だけ運ぶ", () => {
    const plat = solidAt(48, 72, 48, 24);
    const rider = actor(48, 48); // 足元 72 = 足場の上面
    const w = world([rider], [plat]);
    expect(isRidingBox(rider, plat.box)).toBe(true);

    drive(plat, 20, 0);
    moveSolids(w);

    expect(rider.box.x).toBe(68);
    expect(isRidingBox(rider, plat.box)).toBe(true); // 乗ったまま
  });

  it("下に動くと乗員も付いていく（置き去りにして浮かせない）", () => {
    const plat = solidAt(48, 72, 48, 24);
    const rider = actor(48, 48);
    const w = world([rider], [plat]);

    drive(plat, 0, 10);
    moveSolids(w);

    expect(rider.box.y + rider.box.h).toBe(plat.box.y);
  });

  it("上に動くと、乗員をめり込ませず押し上げる", () => {
    const plat = solidAt(48, 72, 48, 24);
    const rider = actor(48, 48);
    const w = world([rider], [plat]);

    drive(plat, 0, -12);
    moveSolids(w);

    expect(rider.box.y + rider.box.h).toBe(plat.box.y);
    expect(rider.box.y).toBe(36);
  });

  it("進路上の Actor を進行方向へ押し出す", () => {
    const plat = solidAt(48, 72, 48, 24);
    const standing = actor(96, 72); // 足場と同じ高さで右隣。乗員ではない
    const w = world([standing], [plat]);
    expect(isRidingBox(standing, plat.box)).toBe(false);

    drive(plat, 20, 0);
    moveSolids(w);

    expect(standing.box.x).toBe(116);
  });

  it("動いていない Solid は何もしない", () => {
    const plat = solidAt(48, 72, 48, 24);
    const rider = actor(48, 48);
    const w = world([rider], [plat]);

    moveSolids(w); // dx = dy = 0

    expect(rider.box.x).toBe(48);
    expect(rider.box.y).toBe(48);
  });

  it("運ばれた先が壁なら、挟まらずに足場から滑り落ちる", () => {
    // 乗員の高さ(y 48..72 = row2)だけ右端に寄せた壁を想定し、
    // 足場は乗員より下なので動けるが、乗員は壁で止まる状況を作る。
    // 乗員の高さ(row2 = y 48..72)だけ col4 以降を壁にする。x=96 から先へは進めない。
    const blocked = ["#########", "#.......#", "#...#####", "#.......#", "#########"];
    const plat = solidAt(48, 72, 72, 24);
    const rider = actor(48, 48);
    const w = {
      grid: TileGrid.fromRows(blocked, TS),
      solids: [plat],
      actors: [rider],
    };

    drive(plat, 40, 0);
    moveSolids(w);

    // 乗員は壁の手前で止まり、足場だけが 40 進む。
    expect(rider.box.x + rider.box.w).toBe(96);
    expect(plat.box.x).toBe(88);
    expect(isRidingBox(rider, plat.box)).toBe(true); // まだ足場の上ではある
  });

  it("壁と動く Solid に挟まれた Actor は圧殺として検出される", () => {
    const plat = solidAt(124, 72, 48, 24);
    const squeezed = actor(172, 72); // 右端 192 = 右の壁にぴったり
    const w = world([squeezed], [plat]);

    drive(plat, 10, 0);
    moveSolids(w);

    // 押し出そうとしても壁があって逃げられない
    expect(isCrushed(w, squeezed)).toBe(true);
  });

  it("押し出した相手を二重に動かさない", () => {
    // 乗員かつ進路上、という状況（上昇する足場の上の Actor）で
    // 押し出しと搬送が両方効くと 2 倍動いてしまう。
    const plat = solidAt(48, 72, 48, 24);
    const rider = actor(48, 48);
    const w = world([rider], [plat]);

    drive(plat, 0, -10);
    moveSolids(w);

    expect(rider.box.y).toBe(38); // 48 - 10。-20 になっていないこと
  });
});
