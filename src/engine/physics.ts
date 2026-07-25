import type { AABB } from "./aabb";
import { bottom, left, moved, overlaps, overlapsX, right, top } from "./aabb";
import type { TileGrid } from "./tilegrid";

/**
 * SPEC §3 の物理。Celeste / TowerFall 方式の Actor / Solid 分離。
 *
 * 位置は常に整数 px を保ち、移動は 1px ずつ進めて判定する。
 * これによりトンネリングが原理的に起きず、頭の上に乗る判定
 * （bottom === top の厳密一致）も安定する。
 */

/** 押し合いの連鎖上限。無限再帰を防ぎつつ、3人以上の横並びも押せる長さ。 */
const MAX_PUSH_CHAIN = 4;

export class Actor {
  readonly box: AABB;
  vx = 0;
  vy = 0;
  grounded = false;

  /** 1px 未満の移動残差。切り捨てて速度が失われるのを防ぐ。 */
  private xRemainder = 0;
  private yRemainder = 0;

  constructor(x: number, y: number, w: number, h: number) {
    this.box = { x: Math.round(x), y: Math.round(y), w, h };
  }

  /** ワープ用。残差もリセットする。 */
  teleport(x: number, y: number): void {
    this.box.x = Math.round(x);
    this.box.y = Math.round(y);
    this.vx = 0;
    this.vy = 0;
    this.xRemainder = 0;
    this.yRemainder = 0;
    this.grounded = false;
  }

  /** @internal 残差を含めた移動量を整数 px に確定させる。 */
  consumeX(amount: number): number {
    this.xRemainder += amount;
    const move = Math.round(this.xRemainder);
    this.xRemainder -= move;
    return move;
  }

  /** @internal */
  consumeY(amount: number): number {
    this.yRemainder += amount;
    const move = Math.round(this.yRemainder);
    this.yRemainder -= move;
    return move;
  }

  /** @internal 衝突で止まったとき、残差を持ち越さない。 */
  cancelX(): void {
    this.xRemainder = 0;
  }

  /** @internal */
  cancelY(): void {
    this.yRemainder = 0;
  }
}

/**
 * ギミック由来の Solid。
 *
 * ギミックは update() で自分の box を動かし、動いた量を dx/dy で申告する。
 * 申告が 0 なら搬送も押し出しも起きないので、静止したギミック（閉じた
 * ゲートなど）は何もしなくてよい。
 *
 * 前フレームとの差分を物理側で推測する手もあるが、ステージのリセットに
 * よる瞬間移動と区別できないので採らない。動かした本人が量を知っている。
 */
export interface SolidBody {
  box: AABB;
  dx: number;
  dy: number;
  /** 押し出し・搬送の最中だけ true。自分自身を障害物にしないため。 */
  disabled?: boolean;
}

/**
 * 物理が知る世界。ギミックの存在は知らず、
 * 「今フレームの Solid の配列」だけを受け取る。
 */
export interface PhysicsWorld {
  readonly grid: TileGrid;
  /** ギミック由来の Solid。毎ステップ差し替えられる。 */
  solids: SolidBody[];
  readonly actors: Actor[];
}

/** タイルとギミック Solid による静的な阻害。 */
export function blockedByStatic(world: PhysicsWorld, box: AABB): boolean {
  if (world.grid.overlapsSolid(box)) return true;
  for (const s of world.solids) {
    if (s.disabled) continue;
    if (overlaps(box, s.box)) return true;
  }
  return false;
}

/** box と重なる他の Actor（self を除く）。プレイヤー同士は互いに Solid。 */
export function actorAt(world: PhysicsWorld, box: AABB, self: Actor): Actor | null {
  for (const a of world.actors) {
    if (a === self) continue;
    if (overlaps(box, a.box)) return a;
  }
  return null;
}

/**
 * a が carrier の頭の上に立っているか。
 * 位置が整数 px なので厳密一致で判定できる。
 */
export function isRiding(a: Actor, carrier: Actor): boolean {
  return isRidingBox(a, carrier.box);
}

/** 矩形の上に立っているか。動く床の乗員判定にも使う。 */
export function isRidingBox(a: Actor, box: AABB): boolean {
  return bottom(a.box) === top(box) && overlapsX(a.box, box);
}

function ridersOf(world: PhysicsWorld, carrier: Actor): Actor[] {
  const out: Actor[] = [];
  for (const a of world.actors) {
    if (a !== carrier && isRiding(a, carrier)) out.push(a);
  }
  return out;
}

/**
 * 横移動。SPEC §3.3「横方向は押し合い」。
 * 壁に阻まれたら false、進み切れたら true。
 */
export function moveX(world: PhysicsWorld, actor: Actor, amount: number): boolean {
  const move = actor.consumeX(amount);
  return stepX(world, actor, move, 0);
}

/** 1px ずつ進める本体。depth は押し合いの連鎖回数。 */
function stepX(world: PhysicsWorld, actor: Actor, move: number, depth: number): boolean {
  if (move === 0) return true;
  const step = Math.sign(move);

  while (move !== 0) {
    const next = moved(actor.box, step, 0);

    if (blockedByStatic(world, next)) {
      actor.cancelX();
      actor.vx = 0;
      return false;
    }

    const other = actorAt(world, next, actor);
    if (other) {
      // 相手を押す。押し切れなければ自分も止まる。
      if (depth >= MAX_PUSH_CHAIN || !stepX(world, other, step, depth + 1)) {
        actor.cancelX();
        actor.vx = 0;
        return false;
      }
    }

    // 頭の上のアクターは、動く前に確定させてから一緒に運ぶ (SPEC §3.4)。
    const riders = ridersOf(world, actor);
    actor.box.x += step;
    for (const rider of riders) {
      // 運ばれた先が壁なら、挟まって固まるより頭から滑り落ちる方を選ぶ。
      stepX(world, rider, step, depth + 1);
    }

    move -= step;
  }
  return true;
}

/**
 * 縦移動。SPEC §3.3「縦方向は硬い」。
 * 下向きに阻まれたら接地、上向きに他アクターへぶつかったら相手を持ち上げる。
 */
export function moveY(world: PhysicsWorld, actor: Actor, amount: number): boolean {
  const move = actor.consumeY(amount);
  return stepY(world, actor, move, 0);
}

function stepY(world: PhysicsWorld, actor: Actor, move: number, depth: number): boolean {
  if (move === 0) return true;
  const step = Math.sign(move);

  while (move !== 0) {
    const next = moved(actor.box, 0, step);

    if (blockedByStatic(world, next)) {
      if (step > 0) actor.grounded = true;
      actor.cancelY();
      actor.vy = 0;
      return false;
    }

    const other = actorAt(world, next, actor);
    if (other) {
      if (step > 0) {
        // 落下して相手の頭に着地
        actor.grounded = true;
        actor.cancelY();
        actor.vy = 0;
        return false;
      }
      // 下から突き上げ: 乗っている相手を持ち上げる
      if (depth >= MAX_PUSH_CHAIN || !stepY(world, other, step, depth + 1)) {
        actor.cancelY();
        actor.vy = 0;
        return false;
      }
    }

    actor.box.y += step;
    move -= step;
  }
  return true;
}

/** 1px 下に探りを入れて接地判定する。移動後に毎回呼ぶ。 */
export function isOnGround(world: PhysicsWorld, actor: Actor): boolean {
  const probe = moved(actor.box, 0, 1);
  return blockedByStatic(world, probe) || actorAt(world, probe, actor) !== null;
}

/** 壁やギミック Solid にめり込んでいる＝圧殺 (SPEC §3.5)。 */
export function isCrushed(world: PhysicsWorld, actor: Actor): boolean {
  return blockedByStatic(world, actor.box);
}

/**
 * 「乗っている関係」を下から上へ並べる (SPEC §3.4)。
 * 3人以上の塔でも、土台から順に解決すれば破綻しない。
 * 物理的にあり得ない循環は、検出したら残りを任意順で返して打ち切る。
 */
export function sortBottomUp(world: PhysicsWorld): Actor[] {
  const actors = world.actors;
  const carrierOf = new Map<Actor, Actor | null>();
  for (const a of actors) {
    let carrier: Actor | null = null;
    for (const b of actors) {
      if (a !== b && isRiding(a, b)) {
        carrier = b;
        break;
      }
    }
    carrierOf.set(a, carrier);
  }

  const out: Actor[] = [];
  const state = new Map<Actor, 0 | 1 | 2>(); // 0=未訪問 1=訪問中 2=確定

  const visit = (a: Actor): void => {
    const s = state.get(a) ?? 0;
    if (s === 2) return;
    if (s === 1) return; // 循環: ここで切る
    state.set(a, 1);
    const carrier = carrierOf.get(a) ?? null;
    if (carrier) visit(carrier);
    state.set(a, 2);
    out.push(a);
  };

  for (const a of actors) visit(a);
  return out;
}

// ---- Solid の移動 (SPEC §3.4) ----

/**
 * 残差を使わず整数 px だけ Actor を動かす。搬送と押し出しに使う。
 * 通常の移動 (moveX/moveY) は速度から残差を積むが、搬送は
 * 「Solid が動いた量そのまま」を渡したいので残差を通さない。
 */
export function shiftActor(
  world: PhysicsWorld,
  actor: Actor,
  dx: number,
  dy: number,
): boolean {
  let ok = true;
  if (dx !== 0) ok = stepX(world, actor, Math.round(dx), 0) && ok;
  if (dy !== 0) ok = stepY(world, actor, Math.round(dy), 0) && ok;
  return ok;
}

/** Solid が動いた向きに、めり込みを解消するのに必要な押し出し量。 */
function penetration(
  actorBox: AABB,
  solidBox: AABB,
  dx: number,
  dy: number,
): { x: number; y: number } {
  let x = 0;
  let y = 0;
  if (dx > 0) x = right(solidBox) - left(actorBox);
  else if (dx < 0) x = left(solidBox) - right(actorBox);
  if (dy > 0) y = bottom(solidBox) - top(actorBox);
  else if (dy < 0) y = top(solidBox) - bottom(actorBox);
  return { x, y };
}

/**
 * 動いた Solid が、重なった Actor を押し出し、乗員を運ぶ。
 * ギミック更新の直後、Actor が自分で動き出す前に呼ぶこと。
 */
export function moveSolids(world: PhysicsWorld): void {
  for (const solid of world.solids) {
    if (solid.dx === 0 && solid.dy === 0) continue;
    moveSolid(world, solid);
  }
}

function moveSolid(world: PhysicsWorld, solid: SolidBody): void {
  const { dx, dy } = solid;

  // box は既にギミックが動かした後なので、乗員は「動く前の位置」で数える。
  // 動いた後に数えると、置き去りにされた乗員が乗員として拾えない。
  const before = moved(solid.box, -dx, -dy);
  const riders = world.actors.filter((a) => isRidingBox(a, before));

  // 押し出しと搬送の間は自分を障害物から外す。外さないと、
  // めり込んだ Actor が自分の中から出られない。
  //
  // finally で必ず戻す。ここで抜けたまま残ると、その Solid は以後ずっと
  // 素通りになり、閉じたゲートをすり抜けられてしまう。
  solid.disabled = true;
  try {
    // 動いた先で重なった Actor は、進行方向へめり込みぶん押し出す。
    const pushed = new Set<Actor>();
    for (const actor of world.actors) {
      if (!overlaps(actor.box, solid.box)) continue;
      const push = penetration(actor.box, solid.box, dx, dy);
      shiftActor(world, actor, push.x, push.y);
      pushed.add(actor);
      // 押し切れずまだめり込んでいる場合は圧殺。判定と復帰は呼び出し側
      // (isCrushed) が持つので、ここでは何もしない。
    }

    // 乗員を同じ量だけ運ぶ。押し出した相手は既に動いているので二重に動かさない。
    for (const rider of riders) {
      if (pushed.has(rider)) continue;
      // 運ばれた先が壁なら、挟まって固まるより床から滑り落ちる方を選ぶ。
      shiftActor(world, rider, dx, dy);
    }
  } finally {
    solid.disabled = false;
  }
}
