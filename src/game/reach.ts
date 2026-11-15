import { ScriptedInput, type PlayerInput } from "../engine/input";
import { Game } from "./game";
import type { GimmickParams } from "./gimmicks/types";
import type { StageData } from "./stageData";
import { DT, GRAVITY, JUMP_VELOCITY, PLAYER_H, TILE } from "./tuning";

/**
 * 到達力（どこまで跳べるか）の一次ソース。
 *
 * ステージの成立はこの数値に掛かっている。以前は SPEC の検算表と設計者の記憶に
 * しかなく、参照するたびに手で再計算していた。ここでは
 *
 * - `REACH`          … 設計とステージ検査 (stageCheck.ts) が参照する定数
 * - `measureReach()` … 実際の `Game` をヘッドレスで走らせて同じ量を測る関数
 *
 * を並べて置き、tests/reach.test.ts が両者の一致を固定する。物理や tuning.ts を
 * 変えるとテストが落ちるので、定数だけが古くなることが無い。
 *
 * ⚠ 実測値は解析値 (`REACH_ANALYTIC`) と一致しない。
 *   - 高さ: 固定ステップ積分（重力を先に足してから動かす）と整数 px 丸めのため、
 *     単独ジャンプは v²/2g = 62.5px ではなく 58px しか上がらない。解析値は
 *     実測の上界なので、「この高さなら届かない」の根拠としては安全側。
 *   - 水平: 解析値（滞空時間 × 走る速さ ≒ 80〜100px）は**危険側**で、実際はずっと遠い。
 *     単独でも、崖際のコヨーテタイムと当たり判定の幅 (20px) で 106px 届く。
 *     2人なら、上の人は土台の頭に乗ったまま運ばれ、その間ずっと「接地」扱いなので、
 *     土台が跳んだ弧の終わりで跳べば弧2本ぶん（206px）進む。
 *   隙間で縛る設計は必ず `REACH.*.gap` と比べること。
 */

/** 跳び方。boost と double はどちらも「相方の頭に乗った側」の到達力。 */
export type ReachKind = "solo" | "boost" | "double";

export const REACH_KINDS: readonly ReachKind[] = ["solo", "boost", "double"];

export const REACH_LABEL: Record<ReachKind, string> = {
  solo: "単独",
  boost: "ブースト",
  double: "二段",
};

/**
 * 実測に一致する到達力 (px)。
 *
 * - rise: 立っている面から足元が上がる高さの最大。その高さ以下の面には登れる。
 * - gap : 同じ高さの面へ跳び移れる隙間（面の端から端までの空き）の最大。
 *         地形の隙間はタイル単位なので、越えられるのは
 *         単独 4タイル(96px) / ブースト 5タイル(120px) / 二段 8タイル(192px) まで。
 *
 * solo   = 1人で走って跳ぶ。
 * boost  = 相方の頭から跳ぶ。相方は跳ばないが、乗せたまま走ってよい。
 * double = 相方の頭に乗り、相方が跳んでいる間に自分も跳ぶ（二段ジャンプ）。
 *          高さは相方の頂点で、距離は相方の弧の終わりで跳ぶと最大になる。
 * crate* = 1タイルの箱の上から同じことをした場合の高さ。
 *
 * boost / double の gap は**土台が隙間へ走り込む**（＝土台は落ちる）操作での値。
 * 渡れるのは上の1人だけなので、隙間が「落ちたら戻れない穴」なら2人とも渡る
 * 手段にはならない。ただし渡った1人が向こう岸で何かを動かせる配置は破られる。
 */
export const REACH = {
  solo: { rise: 58, gap: 106 },
  boost: { rise: 82, gap: 139 },
  double: { rise: 140, gap: 206 },
  crate: { rise: 82 },
  crateBoost: { rise: 106 },
  crateDouble: { rise: 164 },
} as const;

/**
 * tuning.ts から式で出した解析値（SPEC §3.6 / §7 の検算表が使ってきた値）。
 * 高さについては実測の上界なので、「この高さなら届かない」の根拠には使える。
 */
export const REACH_ANALYTIC = {
  solo: (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY),
  boost: TILE + (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY),
  crateBoost: 2 * TILE + (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY),
  double: TILE + (JUMP_VELOCITY * JUMP_VELOCITY) / GRAVITY,
} as const;

// ---------------------------------------------------------------------------
// 実測
// ---------------------------------------------------------------------------

/** 床の上の空き（行）。箱＋二段ジャンプ (164px) と身長が収まる高さ。 */
const HEADROOM = 10;
/** 床の行。上面は FLOOR_ROW * TILE。 */
const FLOOR_ROW = HEADROOM;
const FLOOR_Y = FLOOR_ROW * TILE;

function input(right: boolean, step: number, jumpAt: number): PlayerInput {
  return { left: false, right, jumpHeld: step >= jumpAt, jumpPressed: step === jumpAt };
}

function flatStage(spawns: StageData["spawns"], gimmicks: GimmickParams[]): StageData {
  const cols = 9;
  const grid = [
    "#".repeat(cols),
    ...Array.from({ length: HEADROOM - 1 }, () => `#${".".repeat(cols - 2)}#`),
    "#".repeat(cols),
  ];
  return { id: "reach-flat", name: "reach", world: 0, tileSize: TILE, grid, spawns, gimmicks };
}

/** measureRise の足場。 */
export interface RiseSetup {
  kind: ReachKind;
  /** 1タイルの箱の上から始めるか。 */
  onCrate?: boolean;
}

/**
 * 真上に跳んだとき、床から足元が上がる高さの最大 (px)。
 *
 * 二段ジャンプは「下が跳んでから何フレーム後に上が跳ぶか」を総当たりして最大を採る。
 * 頂点ちょうど、という前提を置かないので、もっと高く跳べるタイミングがあれば拾える。
 */
export function measureRise(setup: RiseSetup): number {
  const col = 4;
  const crate = setup.onCrate ? 1 : 0;
  const pair = setup.kind !== "solo";
  // 下から 箱 → (土台) → 跳ぶ人 の順に積む。スポーンを直接積んだ位置にするので
  // テレポートは要らない（足元と頭が厳密に接する）。
  const bottomRow = FLOOR_ROW - 1 - crate;
  const spawns = pair
    ? [
        { x: col, y: bottomRow },
        { x: col, y: bottomRow - 1 },
      ]
    : [{ x: col, y: bottomRow }];
  const gimmicks: GimmickParams[] = crate ? [{ type: "crate", x: col, y: FLOOR_ROW - 1 }] : [];
  const jumper = pair ? 1 : 0;

  // 土台が跳ぶのはフレーム 0。上が跳ぶフレームを総当たりする。
  const offsets = setup.kind === "double" ? Array.from({ length: 45 }, (_, i) => i) : [0];
  let best = 0;
  for (const at of offsets) {
    const src = new ScriptedInput([]);
    const game = new Game(src, flatStage(spawns, gimmicks));
    game.start();
    // 着地の潰れなど、開始直後の状態を落ち着かせる
    for (let i = 0; i < 10; i++) game.step(DT);
    for (let i = 0; i < 120; i++) {
      src.inputs = pair
        ? [input(false, i, setup.kind === "double" ? 0 : Infinity), input(false, i, at)]
        : [input(false, i, at)];
      game.step(DT);
      const box = game.players[jumper]!.box;
      best = Math.max(best, FLOOR_Y - (box.y + box.h));
    }
  }
  return best;
}

/** 崖の手前の助走（タイル）。最高速に乗るには 11px で足りる。 */
const RUNWAY = 2;
/** 崖の左にある床の列数。 */
const LEDGE_COLS = 6;
/** 崖の向こうの穴の幅と深さ（タイル）。落下しながら進む距離より広く取る。 */
const PIT_COLS = 26;
const PIT_ROWS = 24;
/** 崖の右端の x (px)。 */
const EDGE_X = (LEDGE_COLS + 1) * TILE;

function cliffStage(pair: boolean, farCol?: number): StageData {
  const cols = 1 + LEDGE_COLS + PIT_COLS + 1;
  const air = `#${".".repeat(cols - 2)}#`;
  // farCol を渡すと、その列から右を崖と同じ高さの向こう岸で埋める
  const pit = farCol === undefined ? PIT_COLS : farCol - (1 + LEDGE_COLS);
  const ledge = `${"#".repeat(1 + LEDGE_COLS)}${".".repeat(pit)}${"#".repeat(cols - 1 - LEDGE_COLS - pit)}`;
  const grid = [
    "#".repeat(cols),
    ...Array.from({ length: HEADROOM - 1 }, () => air),
    ...Array.from({ length: PIT_ROWS }, () => ledge),
    "#".repeat(cols),
  ];
  const x = LEDGE_COLS + 1 - RUNWAY;
  const spawns = pair
    ? [
        { x, y: FLOOR_ROW - 1 },
        { x, y: FLOOR_ROW - 2 },
      ]
    : [{ x, y: FLOOR_ROW - 1 }];
  return { id: "reach-cliff", name: "reach", world: 0, tileSize: TILE, grid, spawns, gimmicks: [] };
}

/** 崖から跳ぶ1回ぶんの操作。フレームは走り始めからの番号。 */
interface Timing {
  /** 土台（下の人）が跳ぶフレーム。solo では使わない。 */
  carrierAt: number;
  /** 測る人が跳ぶフレーム。 */
  jumpAt: number;
  /**
   * 測る人が右を押し始めるフレーム。頭の上では運ばれるぶんに自分の歩きが
   * 足されるので、早く押すと土台の前端まで出てから跳べる（最大 19px 得をする）。
   * 押すのが早すぎると跳ぶ前に頭から落ちる。
   */
  runFrom: number;
}

const NEVER = Infinity;

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/** 走り続けたとき、最後に崖の上で接地しているフレーム。 */
function edgeFrame(): number {
  const src = new ScriptedInput([]);
  const game = new Game(src, cliffStage(false));
  game.start();
  for (let i = 0; i < 200; i++) {
    src.inputs = [input(true, i, NEVER)];
    game.step(DT);
    if (game.players[0]!.box.x >= EDGE_X) return i;
  }
  throw new Error("reach: 崖の端に着かない");
}

/**
 * 試す操作の一覧。跳ぶのが早すぎる軌道は、同じ軌道を手前へずらしただけなので
 * 省いてよい（最高速に乗った後は平行移動で一致する）。崖の端の前後だけを試す。
 */
function timings(kind: ReachKind): Timing[] {
  const edge = edgeFrame();
  // コヨーテタイム（5フレーム）で、端を過ぎてからも跳べる
  const takeoffs = range(edge - 12, edge + 8);
  const out: Timing[] = [];
  if (kind === "solo") {
    for (const jumpAt of [...takeoffs, NEVER]) out.push({ carrierAt: NEVER, jumpAt, runFrom: 0 });
    return out;
  }
  const carriers = kind === "double" ? takeoffs : [NEVER];
  for (const carrierAt of carriers) {
    // 上の人は、土台が空中にいる間（約30フレーム）ならいつでも跳べる
    const first = carrierAt === NEVER ? edge - 12 : carrierAt - 2;
    for (const jumpAt of range(first, first + 44)) {
      for (const lead of range(0, 9)) out.push({ carrierAt, jumpAt, runFrom: jumpAt - lead });
    }
  }
  return out;
}

function drive(pair: boolean, t: Timing, step: number): PlayerInput[] {
  const jumper = input(step >= t.runFrom, step, t.jumpAt);
  return pair ? [input(true, step, t.carrierAt), jumper] : [jumper];
}

/**
 * 到達包絡線。「踏み切る面より rise だけ高い（負なら低い）面へ、どれだけの隙間を
 * 越えて乗れるか」を返す。
 */
export interface ReachEnvelope {
  readonly kind: ReachKind;
  /** 登れる高さの最大 (px)。 */
  readonly maxRise: number;
  /**
   * rise (px, 上が正) だけ高い面へ跳び移れる隙間の最大 (px)。
   * 届かない高さなら -Infinity。隙間 0 は「面が隣接している／重なっている」。
   */
  gapAt(rise: number): number;
}

/**
 * 崖から右へ走って跳ぶ軌道を総当たりし、各高さで右端がどこまで届くかを記録する。
 *
 * 着地の条件は物理の更新順（横→縦）から決まる。あるステップで足元が
 * `before` から `after` へ下がったとき、その間にある高さ L の面は、横移動を
 * 終えた時点の箱と 1px でも重なっていれば受け止める。つまり面の左端が
 * 「そのステップ後の右端 - 1」以下なら乗れる。崖の端からそこまでが越えられる隙間。
 *
 * 向こう岸の側面に当たる心配は要らない: 最大の隙間では、着地するステップまで
 * 右端が向こう岸に届いていない。より狭い隙間は、同じ軌道をそのぶん手前から
 * 始めれば再現できる。
 */
function sweep(kind: ReachKind): Float64Array {
  const pair = kind !== "solo";
  const data = cliffStage(pair);
  const height = data.grid.length * TILE;
  const reach = new Float64Array(height + 1).fill(-Infinity);
  const jumper = pair ? 1 : 0;

  for (const t of timings(kind)) {
    const src = new ScriptedInput([]);
    const game = new Game(src, data);
    game.start();
    const box = game.players[jumper]!.box;
    for (let i = 0; i < 200; i++) {
      src.inputs = drive(pair, t, i);
      const before = box.y + box.h;
      game.step(DT);
      const after = box.y + box.h;
      const gap = box.x + box.w - 1 - EDGE_X;
      for (let level = before; level < after; level++) {
        if (gap > reach[level]!) reach[level] = gap;
      }
      // 穴の底に着いたら、それ以上は何も起きない
      if (after >= height - TILE) break;
    }
  }
  return reach;
}

const envelopeCache = new Map<ReachKind, ReachEnvelope>();

/** 実測した到達包絡線。総当たりに 1 秒ほど掛かるので結果は使い回す。 */
export function measureEnvelope(kind: ReachKind): ReachEnvelope {
  const cached = envelopeCache.get(kind);
  if (cached) return cached;

  const reach = sweep(kind);
  // 2人でできることには1人でできることが含まれる（土台が動かなければよい）。
  const lower = kind === "double" ? "boost" : kind === "boost" ? "solo" : null;
  const base = lower ? measureEnvelope(lower) : null;

  const lowest = reach.length - 1 - TILE;
  let maxRise = base?.maxRise ?? 0;
  for (let level = 0; level < FLOOR_Y; level++) {
    if (reach[level]! > -Infinity) {
      maxRise = Math.max(maxRise, FLOOR_Y - level);
      break;
    }
  }

  const envelope: ReachEnvelope = {
    kind,
    maxRise,
    gapAt(rise: number): number {
      // 測った穴より深い落下は、底の値で代用する（実際はもう少し遠くへ届く）。
      const level = Math.min(Math.ceil(FLOOR_Y - rise), lowest - 1);
      const own = level < 0 ? -Infinity : reach[level]!;
      return Math.max(own, base?.gapAt(rise) ?? -Infinity);
    },
  };
  envelopeCache.set(kind, envelope);
  return envelope;
}

export interface MeasuredReach {
  solo: { rise: number; gap: number };
  boost: { rise: number; gap: number };
  double: { rise: number; gap: number };
  crate: { rise: number };
  crateBoost: { rise: number };
  crateDouble: { rise: number };
}

/** `REACH` と同じ形の実測値。 */
export function measureReach(): MeasuredReach {
  const both = (kind: ReachKind): { rise: number; gap: number } => ({
    rise: measureRise({ kind }),
    gap: measureEnvelope(kind).gapAt(0),
  });
  return {
    solo: both("solo"),
    boost: both("boost"),
    double: both("double"),
    crate: { rise: measureRise({ kind: "solo", onCrate: true }) },
    crateBoost: { rise: measureRise({ kind: "boost", onCrate: true }) },
    crateDouble: { rise: measureRise({ kind: "double", onCrate: true }) },
  };
}

/**
 * 実際に崖と向こう岸を置いて、隙間を越えられる操作が1つでもあるかを試す。
 * 包絡線（開けた空間の軌道から導く）が、本物の地形で成り立つことの裏取りに使う。
 */
export function canCrossGap(kind: ReachKind, gapTiles: number): boolean {
  const pair = kind !== "solo";
  const farCol = 1 + LEDGE_COLS + gapTiles;
  const data = cliffStage(pair, farCol);
  const jumper = pair ? 1 : 0;

  for (const t of timings(kind)) {
    const src = new ScriptedInput([]);
    const game = new Game(src, data);
    game.start();
    const p = game.players[jumper]!;
    for (let i = 0; i < 150; i++) {
      src.inputs = drive(pair, t, i);
      game.step(DT);
      const feet = p.box.y + p.box.h;
      // 向こう岸の上に立った
      if (p.grounded && feet === FLOOR_Y && p.box.x + p.box.w > farCol * TILE) return true;
      // 穴に落ちた
      if (feet > FLOOR_Y + PLAYER_H) break;
    }
  }
  return false;
}
