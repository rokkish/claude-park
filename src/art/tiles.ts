import type { Renderer } from "../engine/renderer";
import type { TileGrid } from "../engine/tilegrid";
import { Tile } from "../engine/tilegrid";
import { PALETTE } from "./palette";

/** 上面ハイライトの帯の太さ (px)。 */
const TOP_HIGHLIGHT_H = 4;

/**
 * タイルグリッドを描画する (SPEC §6.4)。
 * 連続した Solid の塊が「1つの土台」に見えるよう、上に Solid が無いセルの
 * 上端だけにハイライトを乗せる。これがないと単なるタイルの敷き詰めに見えてしまう。
 */
export function drawTiles(r: Renderer, grid: TileGrid): void {
  const ts = grid.tileSize;
  for (let ty = 0; ty < grid.rows; ty++) {
    for (let tx = 0; tx < grid.cols; tx++) {
      const tile = grid.at(tx, ty);
      switch (tile) {
        case Tile.Solid: {
          const x = tx * ts;
          const y = ty * ts;
          r.rect(x, y, ts, ts, PALETTE.tile);
          if (!grid.isSolid(tx, ty - 1)) {
            r.rect(x, y, ts, TOP_HIGHLIGHT_H, PALETTE.tileTop);
          }
          break;
        }
        case Tile.OneWay:
          // TODO: 一方通行床。SPEC §8.3 で予約済み、ステージ1では未使用。
          break;
        case Tile.Hazard:
          // TODO: トゲ等のハザード。SPEC §8.3 で予約済み、ステージ1では未使用。
          break;
        case Tile.Empty:
        default:
          break;
      }
    }
  }
}
