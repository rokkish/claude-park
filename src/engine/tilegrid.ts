import type { AABB } from "./aabb";

/**
 * ステージの静的地形。
 * SPEC §7.2 のグリッド文字がそのままここに入る。
 */
export const enum Tile {
  Empty = 0,
  Solid = 1,
  /** 予約: 一方通行床（下から通り抜け、上には乗れる）。PoC では未使用。 */
  OneWay = 2,
  /** 予約: 触れるとリスポーン。PoC では未使用。 */
  Hazard = 3,
}

/** グリッド文字 → Tile。ステージ JSON の見た目をそのまま維持するための対応表。 */
export const TILE_LEGEND: Record<string, Tile> = {
  ".": Tile.Empty,
  "#": Tile.Solid,
  "-": Tile.OneWay,
  "^": Tile.Hazard,
};

export class TileGrid {
  readonly cols: number;
  readonly rows: number;
  readonly tileSize: number;
  private readonly cells: Uint8Array;

  constructor(cols: number, rows: number, tileSize: number, cells: Uint8Array) {
    this.cols = cols;
    this.rows = rows;
    this.tileSize = tileSize;
    this.cells = cells;
  }

  /**
   * ASCII 行の配列からグリッドを作る。
   * 行の長さが揃っていない・未知の文字がある場合は即座に throw する
   * （プレイ中に静かに壊れるより、ロード時に気付ける方がよい）。
   */
  static fromRows(rows: readonly string[], tileSize: number): TileGrid {
    if (rows.length === 0) throw new Error("TileGrid: grid が空です");
    const cols = rows[0]!.length;
    const cells = new Uint8Array(cols * rows.length);
    rows.forEach((row, y) => {
      if (row.length !== cols) {
        throw new Error(`TileGrid: 行 ${y} の長さが ${row.length} (期待値 ${cols})`);
      }
      for (let x = 0; x < cols; x++) {
        const ch = row[x]!;
        const tile = TILE_LEGEND[ch];
        if (tile === undefined) {
          throw new Error(`TileGrid: 未知のタイル文字 "${ch}" (${x}, ${y})`);
        }
        cells[y * cols + x] = tile;
      }
    });
    return new TileGrid(cols, rows.length, tileSize, cells);
  }

  /** グリッド外は Solid 扱い（ステージ外へ出られないようにする安全網）。 */
  at(tx: number, ty: number): Tile {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return Tile.Solid;
    return this.cells[ty * this.cols + tx] as Tile;
  }

  isSolid(tx: number, ty: number): boolean {
    return this.at(tx, ty) === Tile.Solid;
  }

  /** 矩形が Solid タイルと重なるか。物理の衝突判定の一次ソース。 */
  overlapsSolid(box: AABB): boolean {
    const ts = this.tileSize;
    // 右端/下端は開区間なので、境界ちょうどのタイルを含めないよう 1 引いてから floor する
    const x0 = Math.floor(box.x / ts);
    const y0 = Math.floor(box.y / ts);
    const x1 = Math.floor((box.x + box.w - 1) / ts);
    const y1 = Math.floor((box.y + box.h - 1) / ts);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.isSolid(tx, ty)) return true;
      }
    }
    return false;
  }

  get widthPx(): number {
    return this.cols * this.tileSize;
  }

  get heightPx(): number {
    return this.rows * this.tileSize;
  }
}
