import { ScriptedInput } from "../engine/input";
import { TILE_LEGEND, Tile } from "../engine/tilegrid";
import { Game } from "./game";
import type { GimmickParams } from "./gimmicks/types";
import { REACH_KINDS, REACH_LABEL, measureEnvelope, type ReachKind } from "./reach";
import type { StageData } from "./stageData";
import { DT, PLAYER_H, PLAYER_W } from "./tuning";

/**
 * ステージ JSON の機械検査。
 *
 * 「遊べば分かるが、遊ぶまで分からない」類いの書き間違いを、ロード直後に見つける。
 * 行の長さ・未知のタイル文字・未登録の type はロード時に throw するので、それも
 * 1件の error として拾う。
 *
 * 加えて、立てる面どうしの縦・横の隙間を到達力 (reach.ts) と突き合わせた表を出す。
 * 「ここは単独では届かず2人なら届く」「この谷は越えられない」といった成立条件を、
 * 手で検算する代わりに表で読む。
 *
 * 純粋なロジックだけを置く（ファイルや process には触らない）。CLI は
 * scripts/check-stage.ts、全ステージへの適用は tests/stageCheck.test.ts。
 */

export interface StageIssue {
  level: "error" | "warning";
  /** 検査の種類。テストと絞り込みに使う。 */
  code: string;
  message: string;
}

/** 立てる面。y は上面の px、x0..x1 は px の半開区間。 */
export interface Surface {
  id: string;
  kind: "terrain" | "brick" | "gate" | "platform" | "crate";
  y: number;
  x0: number;
  x1: number;
  /** 常には存在しない面の但し書き（「閉じている間」など）。 */
  note: string;
}

export interface Verdict {
  ok: boolean;
  /**
   * 届く場合は余裕 (px)。高さと幅のうち、きつい方。
   * 届かない場合は不足 (px)。
   */
  px: number;
  /** 余裕または不足がどちらの軸の話か。under は「真下にいて頭を打つ」。 */
  axis: "rise" | "gap" | "under";
}

export interface Transition {
  from: Surface;
  to: Surface;
  /** 登る高さ (px)。負なら降りる。 */
  rise: number;
  /** 水平の空き (px)。重なっている・隣接しているなら 0。 */
  gap: number;
  verdicts: Record<ReachKind, Verdict>;
  /** 箱がある場合、箱の上で二段ジャンプしたときの判定。 */
  withCrate: Verdict | null;
}

export interface StageReport {
  id: string;
  name: string;
  issues: StageIssue[];
  surfaces: Surface[];
}

// ---------------------------------------------------------------------------
// 検査
// ---------------------------------------------------------------------------

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const num = (v: unknown, fallback: number): number => (typeof v === "number" ? v : fallback);

/** ギミックが占めるタイル矩形。 */
function rectOf(g: GimmickParams): Rect {
  return { x: g.x, y: g.y, w: num(g.w, 1), h: num(g.h, 1) };
}

/** platform の終点の矩形。to が無ければ null。 */
function endRectOf(g: GimmickParams): Rect | null {
  const to = g.to as { x?: unknown; y?: unknown } | undefined;
  if (typeof to?.x !== "number" || typeof to?.y !== "number") return null;
  return { x: to.x, y: to.y, w: num(g.w, 1), h: num(g.h, 1) };
}

function describe(g: GimmickParams, index: number): string {
  return `gimmicks[${index}] ${g.type}(${g.x},${g.y})`;
}

function strings(v: unknown): string[] | null {
  return Array.isArray(v) && v.every((s) => typeof s === "string") ? (v as string[]) : null;
}

/** グリッド文字。範囲外は null。 */
function charAt(grid: readonly string[], tx: number, ty: number): string | null {
  return grid[ty]?.[tx] ?? null;
}

function isSolidChar(ch: string | null): boolean {
  if (ch === null) return true;
  const t = TILE_LEGEND[ch];
  return t === Tile.Solid || t === Tile.Brick;
}

/** 矩形が掛かるタイルを列挙する（小数座標にも対応）。 */
function cellsOf(r: Rect): { tx: number; ty: number }[] {
  const out: { tx: number; ty: number }[] = [];
  const EPS = 1e-9;
  for (let ty = Math.floor(r.y); ty < Math.ceil(r.y + r.h - EPS); ty++) {
    for (let tx = Math.floor(r.x); tx < Math.ceil(r.x + r.w - EPS); tx++) out.push({ tx, ty });
  }
  return out;
}

function inRange(r: Rect, cols: number, rows: number): boolean {
  return (
    [r.x, r.y, r.w, r.h].every(Number.isFinite) &&
    r.w > 0 &&
    r.h > 0 &&
    r.x >= 0 &&
    r.y >= 0 &&
    r.x + r.w <= cols &&
    r.y + r.h <= rows
  );
}

const SIGNAL_MODES = ["all", "any", "none"];

export function checkStage(data: StageData): StageReport {
  const issues: StageIssue[] = [];
  const error = (code: string, message: string): void => {
    issues.push({ level: "error", code, message });
  };
  const warn = (code: string, message: string): void => {
    issues.push({ level: "warning", code, message });
  };
  const report: StageReport = { id: data.id, name: data.name, issues, surfaces: [] };

  // --- ロードできるか。できなければ以降の検査は意味を持たない ---
  let game: Game;
  try {
    game = new Game(new ScriptedInput([]), data);
  } catch (e) {
    error("load", `ロードに失敗: ${e instanceof Error ? e.message : String(e)}`);
    return report;
  }

  const { grid, gimmicks, spawns } = data;
  const rows = grid.length;
  const cols = grid[0]!.length;
  const ts = data.tileSize;

  // --- ギミックがグリッド範囲内か ---
  const placed: boolean[] = gimmicks.map((g, i) => {
    let ok = true;
    if (!inRange(rectOf(g), cols, rows)) {
      error("gimmick-out-of-range", `${describe(g, i)} がグリッド (${cols}×${rows}) の外にはみ出している`);
      ok = false;
    }
    const end = endRectOf(g);
    if (end && !inRange(end, cols, rows)) {
      error(
        "gimmick-out-of-range",
        `${describe(g, i)} の終点 to(${end.x},${end.y}) がグリッド (${cols}×${rows}) の外にはみ出している`,
      );
      ok = false;
    }
    return ok;
  });

  // --- 地形に埋まっていないか ---
  gimmicks.forEach((g, i) => {
    if (!placed[i]) return;
    const chars = (r: Rect): (string | null)[] => cellsOf(r).map((c) => charAt(grid, c.tx, c.ty));
    if (g.type === "platform") {
      // 足場は地形と衝突しないので動きはするが、壁の中に消えて見える
      const end = endRectOf(g);
      const hit = [rectOf(g), ...(end ? [end] : [])].some((r) => chars(r).some(isSolidChar));
      if (hit) warn("platform-in-terrain", `${describe(g, i)} の始点か終点が地形に重なっている`);
      return;
    }
    const cs = chars(rectOf(g));
    if (cs.some((ch) => ch !== null && TILE_LEGEND[ch] === Tile.Solid)) {
      error("buried", `${describe(g, i)} が壁 (#) に埋まっている`);
    } else if (cs.some((ch) => ch !== null && TILE_LEGEND[ch] === Tile.Brick)) {
      warn("in-brick", `${describe(g, i)} がブロック (B) に重なっている（壊すまで触れない）`);
    }
  });

  // --- 板が宙に浮いていないか（下に床もギミックも無い） ---
  const solidRects: Rect[] = [];
  gimmicks.forEach((g, i) => {
    if (!placed[i]) return;
    if (g.type === "gate" || g.type === "crate") solidRects.push(rectOf(g));
    if (g.type === "platform") {
      solidRects.push(rectOf(g));
      const end = endRectOf(g);
      if (end) solidRects.push(end);
    }
  });
  gimmicks.forEach((g, i) => {
    if (g.type !== "plate" || !placed[i]) return;
    const r = rectOf(g);
    const below = r.y + r.h;
    const onTerrain = cellsOf({ x: r.x, y: below, w: r.w, h: 1 }).some((c) =>
      isSolidChar(charAt(grid, c.tx, c.ty)),
    );
    const onGimmick = solidRects.some(
      (s) => s.y < below + 1 && s.y + s.h > below && s.x < r.x + r.w && s.x + s.w > r.x,
    );
    if (!onTerrain && !onGimmick) {
      warn("plate-floating", `${describe(g, i)} の下に床が無い（踏めるのは落下中の一瞬だけ）`);
    }
  });

  // --- 配線: listen しているチャンネルを誰かが emit しているか ---
  const emitted = new Set<string>();
  const listened = new Set<string>();
  gimmicks.forEach((g, i) => {
    if (g.type === "plate" && typeof g.emit !== "string") {
      error("plate-without-emit", `${describe(g, i)} に emit が無い`);
    }
    if (typeof g.emit === "string") emitted.add(g.emit);

    if (g.type === "gate" && g.listen === undefined) {
      error("gate-without-listen", `${describe(g, i)} に listen が無い`);
    }
    if (g.listen !== undefined) {
      const names = strings(g.listen);
      if (!names) error("bad-listen", `${describe(g, i)} の listen は文字列の配列で書く`);
      else for (const n of names) listened.add(n);
    }
    if (g.mode !== undefined && !SIGNAL_MODES.includes(g.mode as string)) {
      error("bad-mode", `${describe(g, i)} の mode "${String(g.mode)}" は all / any / none のどれでもない`);
    }
  });
  for (const ch of listened) {
    if (!emitted.has(ch)) {
      error(
        "listen-without-emit",
        `チャンネル "${ch}" を listen しているが、誰も emit していない（emit: ${[...emitted].sort().join(", ") || "なし"}）`,
      );
    }
  }
  for (const ch of emitted) {
    if (!listened.has(ch)) warn("emit-without-listen", `チャンネル "${ch}" を emit しているが、誰も listen していない`);
  }

  // --- 鍵とゴール ---
  const keyIds: string[] = [];
  gimmicks.forEach((g, i) => {
    if (g.type !== "key") return;
    if (typeof g.id !== "string") error("key-without-id", `${describe(g, i)} に id が無い`);
    else keyIds.push(g.id);
  });
  for (const id of new Set(keyIds)) {
    if (keyIds.filter((k) => k === id).length > 1) warn("key-duplicate", `鍵の id "${id}" が重複している`);
  }
  const required = new Set<string>();
  const goals = gimmicks.filter((g) => g.type === "goal");
  if (goals.length === 0) error("no-goal", "goal が1つも無い（クリアできない）");
  gimmicks.forEach((g, i) => {
    if (g.type !== "goal" || g.requires === undefined) return;
    const ids = strings(g.requires);
    if (!ids) {
      error("bad-requires", `${describe(g, i)} の requires は文字列の配列で書く`);
      return;
    }
    for (const id of ids) {
      required.add(id);
      if (!keyIds.includes(id)) {
        error(
          "requires-missing-key",
          `${describe(g, i)} が鍵 "${id}" を要求しているが、その id の key が無い（key: ${keyIds.join(", ") || "なし"}）`,
        );
      }
    }
  });
  for (const id of new Set(keyIds)) {
    if (!required.has(id)) warn("key-unused", `鍵 "${id}" はどの goal にも要求されていない`);
  }

  // --- スポーン ---
  if (spawns.length === 0) error("no-spawn", "spawns が空");
  let spawnsOk = spawns.length > 0;
  spawns.forEach((s, i) => {
    const name = `spawns[${i}] (${s.x},${s.y})`;
    // 当たり判定は 20×24px。タイルの左上に置かれる。
    const box: Rect = { x: s.x, y: s.y, w: PLAYER_W / ts, h: PLAYER_H / ts };
    if (!inRange(box, cols, rows)) {
      error("spawn-out-of-range", `${name} がグリッド (${cols}×${rows}) の外`);
      spawnsOk = false;
    } else if (cellsOf(box).some((c) => isSolidChar(charAt(grid, c.tx, c.ty)))) {
      error("spawn-in-wall", `${name} が地形に埋まっている`);
      spawnsOk = false;
    }
    for (let j = 0; j < i; j++) {
      const o = spawns[j]!;
      if (Math.abs(o.x - s.x) * ts < PLAYER_W && Math.abs(o.y - s.y) * ts < PLAYER_H) {
        error("spawn-overlap", `${name} が spawns[${j}] (${o.x},${o.y}) と重なっている`);
        spawnsOk = false;
      }
    }
  });
  // 床の上かどうかは実際に動かして確かめる。地形だけでなく、足場や箱の上に
  // 立たせる配置も同じ基準（動かなければ床の上）で判定できる。
  if (spawnsOk) {
    game.start();
    const before = game.players.map((p) => ({ x: p.box.x, y: p.box.y }));
    try {
      for (let i = 0; i < 3; i++) game.step(DT);
    } catch (e) {
      // 配線の型違いなどで実行時に落ちる。原因は上の検査が既に報告している。
      error("run", `開始直後に例外: ${e instanceof Error ? e.message : String(e)}`);
      report.surfaces = findSurfaces(data, placed);
      return report;
    }
    game.players.forEach((p, i) => {
      const s = spawns[i]!;
      const b = before[i]!;
      if (p.box.y !== b.y || !p.grounded) {
        error(
          "spawn-not-on-floor",
          `spawns[${i}] (${s.x},${s.y}) は床の上に無い（開始直後に y=${b.y} から ${p.box.y} へ動く。床の1つ上の行を指定する）`,
        );
      }
    });
  }

  report.surfaces = findSurfaces(data, placed);
  return report;
}

// ---------------------------------------------------------------------------
// 面と到達力の突き合わせ
// ---------------------------------------------------------------------------

function findSurfaces(data: StageData, placed: readonly boolean[]): Surface[] {
  const { grid } = data;
  const ts = data.tileSize;
  const cols = grid[0]!.length;
  const out: Surface[] = [];

  // 地形: 上が空いている Solid タイルの横並び。壁とブロックは分けて数える
  // （ブロックは壊れると面でなくなる）。グリッドの外は Solid 扱いなので、
  // 最下行が空いている列（穴）はグリッドの下端が底になる。それも面として数える。
  let n = 0;
  for (let ty = 1; ty <= grid.length; ty++) {
    let run: { kind: "terrain" | "brick"; start: number } | null = null;
    for (let tx = 0; tx <= cols; tx++) {
      const ch = tx < cols ? charAt(grid, tx, ty) : null;
      const standable = tx < cols && isSolidChar(ch) && !isSolidChar(charAt(grid, tx, ty - 1));
      const kind = ch !== null && TILE_LEGEND[ch] === Tile.Brick ? "brick" : "terrain";
      if (run && (!standable || kind !== run.kind)) {
        out.push({
          id: `${run.kind === "brick" ? "B" : "T"}${++n}`,
          kind: run.kind,
          y: ty * ts,
          x0: run.start * ts,
          x1: tx * ts,
          note: run.kind === "brick" ? "壊せる" : ty === grid.length ? "穴の底（グリッド下端）" : "",
        });
        run = null;
      }
      if (standable && !run) run = { kind, start: tx };
    }
  }

  const count: Record<string, number> = {};
  const next = (prefix: string): string => `${prefix}${(count[prefix] = (count[prefix] ?? 0) + 1)}`;
  const top = (id: string, kind: Surface["kind"], r: Rect, note: string): void => {
    out.push({ id, kind, y: r.y * ts, x0: r.x * ts, x1: (r.x + r.w) * ts, note });
  };
  data.gimmicks.forEach((g, i) => {
    if (!placed[i]) return;
    if (g.type === "gate") {
      top(next("G"), "gate", rectOf(g), g.mode === "none" ? "信号が立っている間" : "閉じている間");
    } else if (g.type === "crate") {
      top(next("C"), "crate", rectOf(g), "初期位置");
    } else if (g.type === "platform") {
      const id = next("P");
      const end = endRectOf(g);
      const moving = end && (end.x !== g.x || end.y !== g.y);
      top(moving ? `${id}a` : id, "platform", rectOf(g), moving ? "始点" : "");
      if (end && moving) top(`${id}b`, "platform", end, "終点");
    }
  });
  return out;
}

function judge(kind: ReachKind, rise: number, gap: number, under: boolean): Verdict {
  const env = measureEnvelope(kind);
  if (rise > env.maxRise) return { ok: false, px: rise - env.maxRise, axis: "rise" };
  if (under) return { ok: false, px: 0, axis: "under" };
  const reach = env.gapAt(rise);
  if (gap > reach) return { ok: false, px: gap - reach, axis: "gap" };
  const riseMargin = env.maxRise - rise;
  const gapMargin = reach - gap;
  // 降りるだけなら高さの余裕に意味は無い
  return rise > 0 && riseMargin <= gapMargin
    ? { ok: true, px: riseMargin, axis: "rise" }
    : { ok: true, px: gapMargin, axis: "gap" };
}

/**
 * 面から面への移動を、到達力と突き合わせる。
 *
 * ○ は「到達力の範囲内」という上限の判定で、天井・壁・助走の長さ・2人が並べるか
 * どうかは見ていない。× は「どう操作しても届かない」。設計の根拠にしてよいのは × の方。
 * boost / double の横移動は土台が隙間へ落ちる前提の値（reach.ts 参照）。
 */
export function reachTable(data: StageData, surfaces: readonly Surface[]): Transition[] {
  const crateH = Math.max(
    0,
    ...data.gimmicks.filter((g) => g.type === "crate").map((g) => num(g.h, 1) * data.tileSize),
  );
  const out: Transition[] = [];
  for (const from of surfaces) {
    for (const to of surfaces) {
      if (from === to) continue;
      const rise = from.y - to.y;
      const gap = Math.max(0, to.x0 - from.x1, from.x0 - to.x1);
      // 登り先に完全に覆われている面からは、跳んでも頭を打つだけ
      const under = rise > 0 && from.x0 >= to.x0 && from.x1 <= to.x1;
      const verdicts = Object.fromEntries(
        REACH_KINDS.map((k) => [k, judge(k, rise, gap, under)]),
      ) as Record<ReachKind, Verdict>;
      const withCrate = crateH > 0 ? judge("double", rise - crateH, gap, under) : null;
      out.push({ from, to, rise, gap, verdicts, withCrate });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 表示
// ---------------------------------------------------------------------------

/** 全角文字を幅2として数えて右を埋める（○ × → などの記号は幅1）。 */
function pad(s: string, width: number): string {
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) >= 0x3000 ? 2 : 1;
  return s + " ".repeat(Math.max(0, width - w));
}

function cell(v: Verdict): string {
  if (v.ok) return `○ ${v.axis === "rise" ? "高" : "幅"}+${v.px}`;
  if (v.axis === "under") return "× 真下";
  return `× ${v.axis === "rise" ? "高" : "幅"}-${v.px}`;
}

const KIND_LABEL: Record<Surface["kind"], string> = {
  terrain: "地形",
  brick: "ブロック",
  gate: "ゲート",
  platform: "足場",
  crate: "箱",
};

export interface FormatOptions {
  /** 面と到達力の表を付けるか。 */
  table?: boolean;
  /** どの跳び方でも大きく届かない組も表に出す。 */
  all?: boolean;
  /** 「大きく届かない」の境目 (px)。不足がこれを超える組は省く。 */
  nearMiss?: number;
}

export function formatReport(
  data: StageData,
  report: StageReport,
  label: string,
  opts: FormatOptions = {},
): string {
  const lines: string[] = [];
  const errors = report.issues.filter((i) => i.level === "error");
  const warnings = report.issues.filter((i) => i.level === "warning");
  const status = errors.length > 0 ? "NG" : warnings.length > 0 ? "OK (警告あり)" : "OK";
  lines.push(`${label} ${report.id} "${report.name}": ${status}`);
  for (const i of errors) lines.push(`  ✗ [${i.code}] ${i.message}`);
  for (const i of warnings) lines.push(`  ! [${i.code}] ${i.message}`);
  if (!opts.table || report.surfaces.length === 0) return lines.join("\n");

  const ts = data.tileSize;
  lines.push("", "  面（y は上面の px。立つ行はその1つ上）");
  for (const s of report.surfaces) {
    const colsText = `列${Math.floor(s.x0 / ts)}〜${Math.ceil(s.x1 / ts) - 1}`;
    lines.push(
      `    ${pad(s.id, 5)}${pad(KIND_LABEL[s.kind], 9)}y=${pad(String(s.y), 5)}行${pad(String(s.y / ts), 5)}` +
        `x=${pad(`${s.x0}..${s.x1}`, 11)}${pad(colsText, 12)}${s.note}`,
    );
  }

  const nearMiss = opts.nearMiss ?? 48;
  const table = reachTable(data, report.surfaces);
  const all = (t: Transition): Verdict[] => [
    ...Object.values(t.verdicts),
    ...(t.withCrate ? [t.withCrate] : []),
  ];
  // 降りるだけで誰でも届く組は、行にすると表が埋まるので1行にまとめる
  const trivial = (t: Transition): boolean => !opts.all && t.rise <= 0 && all(t).every((v) => v.ok);
  const drops = table.filter(trivial);
  const shown = table.filter(
    (t) =>
      !trivial(t) &&
      (opts.all || all(t).some((v) => v.ok || (v.axis !== "under" && v.px <= nearMiss))),
  );
  const hasCrate = table.some((t) => t.withCrate);
  lines.push(
    "",
    "  面 → 面（高: +登る / -降りる、幅: 水平の空き。○ は余裕、× は不足の px）",
    `    ${pad("から", 6)}${pad("へ", 6)}${pad("高", 7)}${pad("幅", 6)}` +
      REACH_KINDS.map((k) => pad(REACH_LABEL[k], 11)).join("") +
      (hasCrate ? "箱+二段" : ""),
  );
  for (const t of shown) {
    lines.push(
      `    ${pad(t.from.id, 6)}${pad(t.to.id, 6)}${pad((t.rise > 0 ? "+" : "") + t.rise, 7)}${pad(String(t.gap), 6)}` +
        REACH_KINDS.map((k) => pad(cell(t.verdicts[k]), 11)).join("") +
        (t.withCrate ? cell(t.withCrate) : ""),
    );
  }
  if (drops.length > 0) {
    lines.push(`    降りるだけ（誰でも届く）: ${drops.map((t) => `${t.from.id}→${t.to.id}`).join(" ")}`);
  }
  const hidden = table.length - shown.length - drops.length;
  if (hidden > 0) {
    lines.push(`    （ほか ${hidden} 組は、どの跳び方でも ${nearMiss}px を超えて届かないので省略。--all で表示）`);
  }
  lines.push(
    "    ○ は到達力の範囲内（上限。天井・壁・助走・2人が並べるかは見ていない）。× は届かない。",
    "    ブースト／二段の横移動は、土台が隙間へ落ちる前提の値。",
  );
  return lines.join("\n");
}
