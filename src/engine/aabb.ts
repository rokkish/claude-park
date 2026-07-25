/**
 * 軸平行境界矩形。x/y は左上、単位はワールド px。
 * 全ての当たり判定はこの型で表現する。
 */
export interface AABB {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function aabb(x: number, y: number, w: number, h: number): AABB {
  return { x, y, w, h };
}

export const left = (a: AABB): number => a.x;
export const right = (a: AABB): number => a.x + a.w;
export const top = (a: AABB): number => a.y;
export const bottom = (a: AABB): number => a.y + a.h;

/** 境界が接しているだけの状態は「重なっていない」とする（開区間）。 */
export function overlaps(a: AABB, b: AABB): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** X 軸方向にのみ重なっているか。ライダー判定（頭の上に乗っているか）で使う。 */
export function overlapsX(a: AABB, b: AABB): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w;
}

export function contains(outer: AABB, inner: AABB): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

export function moved(a: AABB, dx: number, dy: number): AABB {
  return { x: a.x + dx, y: a.y + dy, w: a.w, h: a.h };
}
