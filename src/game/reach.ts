import { bottom, right } from "../engine/aabb";
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
 * - `REACH`             … 設計者が参照する定数（代表値）
 * - `measureReach()`    … 実際の `Game` をヘッドレスで走らせて同じ量を測る関数
 * - `measureEnvelope()` … 高低差ごとの越えられる隙間。ステージ検査 (stageCheck.ts) が使う
 *
 * を並べて置き、tests/reach.test.ts が定数と実測の一致を固定する。物理や tuning.ts を
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
 * 跳び方ごとの条件。
 * - pair         … 2人で行う（測るのは上に乗った側）
 * - carrierJumps … 土台も跳ぶ
 * - includes     … この跳び方でできることを全て含む、1つ下の跳び方
 *                  （土台が跳ばなければ boost、乗らなければ solo と同じことができる）
 */
const KIND: Record<ReachKind, { pair: boolean; carrierJumps: boolean; includes: ReachKind | null }> = {
  solo: { pair: false, carrierJumps: false, includes: null },
  boost: { pair: true, carrierJumps: false, includes: "solo" },
  double: { pair: true, carrierJumps: true, includes: "boost" },
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

/** 単独ジャンプの頂点の解析値 v²/2g。 */
const APEX = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY);

/**
 * tuning.ts から式で出した解析値（SPEC §3.6 / §7 の検算表が使ってきた値）。
 * 高さについては実測の上界なので、「この高さなら届かない」の根拠には使える。
 */
export const REACH_ANALYTIC = {
  solo: APEX,
  boost: TILE + APEX,
  crateBoost: 2 * TILE + APEX,
  double: TILE + 2 * APEX,
} as const;

// ---------------------------------------------------------------------------
// 実測
// ---------------------------------------------------------------------------

const NEVER = Infinity;

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

function input(right: boolean, step: number, jumpAt: number): PlayerInput {
  return { left: false, right, jumpHeld: step >= jumpAt, jumpPressed: step === jumpAt };
}

/**
 * ステージを最初から走らせ、1ステップごとに onStep を呼ぶ。onStep が true を返すと止まる。
 * feetBefore は、そのステップを進める前の「測る人」の足元。
 */
function run(
  data: StageData,
  maxSteps: number,
  inputsAt: (step: number) => PlayerInput[],
  onStep: (game: Game, step: number, feetBefore: number) => boolean | void,
): void {
  const src = new ScriptedInput([]);
  const game = new Game(src, data);
  game.start();
  // 測るのは常に最後のプレイヤー（1人ならその人、2人なら上に乗った側）
  const box = game.players[game.players.length - 1]!.box;
  for (let i = 0; i < maxSteps; i++) {
    src.inputs = inputsAt(i);
    const before = bottom(box);
    game.step(DT);
    if (onStep(game, i, before)) return;
  }
}

/** 測る人（最後のプレイヤー）の当たり判定。 */
function jumperOf(game: Game) {
  return game.players[game.players.length - 1]!;
}

/** 床の行。上面は FLOOR_Y。その上に、箱＋二段ジャンプ (164px) と身長が収まる空きを取る。 */
const FLOOR_ROW = 10;
const FLOOR_Y = FLOOR_ROW * TILE;

/** 下から 土台 → 測る人 の順に、col の列へ積んだスポーン。 */
function stack(pair: boolean, col: number, bottomRow: number): StageData["spawns"] {
  return pair
    ? [
        { x: col, y: bottomRow },
        { x: col, y: bottomRow - 1 },
      ]
    : [{ x: col, y: bottomRow }];
}

function flatStage(spawns: StageData["spawns"], gimmicks: GimmickParams[]): StageData {
  const cols = 9;
  const grid = [
    "#".repeat(cols),
    ...Array.from({ length: FLOOR_ROW - 1 }, () => `#${".".repeat(cols - 2)}#`),
    "#".repeat(cols),
  ];
  return { id: "reach-flat", name: "reach", world: 0, tileSize: TILE, grid, spawns, gimmicks };
}

/**
 * 真上に跳んだとき、床から足元が上がる高さの最大 (px)。onCrate なら1タイルの箱の上から。
 *
 * 二段ジャンプは「下が跳んでから何フレーム後に上が跳ぶか」を総当たりして最大を採る。
 * 頂点ちょうど、という前提を置かないので、もっと高く跳べるタイミングがあれば拾える。
 */
export function measureRise(kind: ReachKind, onCrate = false): number {
  const { pair, carrierJumps } = KIND[kind];
  const col = 4;
  // スポーンを直接積んだ位置にするので、足元と頭が厳密に接する
  const data = flatStage(
    stack(pair, col, FLOOR_ROW - 1 - (onCrate ? 1 : 0)),
    onCrate ? [{ type: "crate", x: col, y: FLOOR_ROW - 1 }] : [],
  );
  // 開始直後の状態を落ち着かせてから跳ぶ
  const start = 10;
  const carrierAt = carrierJumps ? start : NEVER;

  let best = 0;
  for (const delay of carrierJumps ? range(0, 44) : [0]) {
    const inputsAt = (i: number): PlayerInput[] => {
      const jumper = input(false, i, start + delay);
      return pair ? [input(false, i, carrierAt), jumper] : [jumper];
    };
    run(data, start + 120, inputsAt, (game) => {
      best = Math.max(best, FLOOR_Y - bottom(jumperOf(game).box));
    });
  }
  return best;
}

/** 崖の右端の列と、その x (px)。左は壁1列と床。 */
const EDGE_COL = 7;
const EDGE_X = EDGE_COL * TILE;
/** 走り始める列。最高速に乗るには 11px で足りるので、崖の2タイル手前から。 */
const START_COL = EDGE_COL - 2;
/** 崖の向こうの穴の幅と深さ（タイル）。落下しながら進む距離より広く取る。 */
const PIT_COLS = 26;
const PIT_ROWS = 24;

/** 崖のステージ。farCol を渡すと、その列から右を崖と同じ高さの向こう岸で埋める。 */
function cliffStage(pair: boolean, farCol = EDGE_COL + PIT_COLS): StageData {
  const cols = EDGE_COL + PIT_COLS + 1;
  const air = `#${".".repeat(cols - 2)}#`;
  const ledge = `${"#".repeat(EDGE_COL)}${".".repeat(farCol - EDGE_COL)}${"#".repeat(cols - farCol)}`;
  const grid = [
    "#".repeat(cols),
    ...Array.from({ length: FLOOR_ROW - 1 }, () => air),
    ...Array.from({ length: PIT_ROWS }, () => ledge),
    "#".repeat(cols),
  ];
  const spawns = stack(pair, START_COL, FLOOR_ROW - 1);
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
   */
  runFrom: number;
}

/** 走り続けたとき、崖の端を越えるフレーム。 */
function edgeFrame(): number {
  let frame = -1;
  run(cliffStage(false), 200, (i) => [input(true, i, NEVER)], (game, i) => {
    if (game.players[0]!.box.x < EDGE_X) return false;
    frame = i;
    return true;
  });
  if (frame < 0) throw new Error("reach: 崖の端に着かない");
  return frame;
}

/**
 * 頭の上で右を押し始めてから跳ぶまでのフレーム数。押さない (0) か、前端まで出切る (9) か。
 * 中間は両端の間に収まる（総当たりで包絡線が変わらないことを確認済み）。
 */
const HEAD_WALK_LEADS = [0, 9];

/**
 * 試す操作の一覧。跳ぶのが早すぎる軌道は、同じ軌道を手前へずらしただけなので
 * 省いてよい（最高速に乗った後は平行移動で一致する）。崖の端の前後だけを試す。
 */
function timings(kind: ReachKind): Timing[] {
  const { pair, carrierJumps } = KIND[kind];
  const edge = edgeFrame();
  // コヨーテタイム（5フレーム）で、端を過ぎてからも跳べる
  const takeoffs = range(edge - 12, edge + 8);
  if (!pair) {
    return [...takeoffs, NEVER].map((jumpAt) => ({ carrierAt: NEVER, jumpAt, runFrom: 0 }));
  }
  const out: Timing[] = [];
  for (const carrierAt of carrierJumps ? takeoffs : [NEVER]) {
    // 上の人は、土台が空中にいる間（約30フレーム）ならいつでも跳べる
    const first = carrierAt === NEVER ? edge - 12 : carrierAt - 2;
    for (const jumpAt of range(first, first + 44)) {
      for (const lead of HEAD_WALK_LEADS) out.push({ carrierAt, jumpAt, runFrom: jumpAt - lead });
    }
  }
  return out;
}

/** 崖のステージで、全ての操作を1つずつ走らせる。onStep が true を返すとその操作を打ち切る。 */
function runCliff(
  kind: ReachKind,
  data: StageData,
  maxSteps: number,
  onStep: (game: Game, feetBefore: number) => boolean | void,
): void {
  const { pair } = KIND[kind];
  for (const t of timings(kind)) {
    const inputsAt = (i: number): PlayerInput[] => {
      const jumper = input(i >= t.runFrom, i, t.jumpAt);
      return pair ? [input(true, i, t.carrierAt), jumper] : [jumper];
    };
    run(data, maxSteps, inputsAt, (game, _i, before) => onStep(game, before));
  }
}

/**
 * 到達包絡線。「踏み切る面より rise だけ高い（負なら低い）面へ、どれだけの隙間を
 * 越えて乗れるか」を返す。
 */
export interface ReachEnvelope {
  /** 登れる高さの最大 (px)。 */
  readonly maxRise: number;
  /**
   * rise (px, 上が正) だけ高い面へ跳び移れる隙間の最大 (px)。
   * 届かない高さなら -Infinity。隙間 0 は「面が隣接している／重なっている」。
   */
  gapAt(rise: number): number;
}

/**
 * 崖から右へ走って跳ぶ軌道を総当たりし、各高さ（足元の y）で越えられる隙間を記録する。
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
  const data = cliffStage(KIND[kind].pair);
  // 足元が取り得るのは穴の底の上面まで
  const pitFloor = (data.grid.length - 1) * TILE;
  const reach = new Float64Array(pitFloor).fill(-Infinity);

  runCliff(kind, data, 200, (game, before) => {
    const box = jumperOf(game).box;
    const after = bottom(box);
    const gap = right(box) - 1 - EDGE_X;
    for (let level = before; level < after; level++) {
      if (gap > reach[level]!) reach[level] = gap;
    }
    // 穴の底に着いたら、それ以上は何も起きない
    return after >= pitFloor;
  });
  return reach;
}

const envelopeCache = new Map<ReachKind, ReachEnvelope>();

/** 実測した到達包絡線。総当たりに時間が掛かるので結果は使い回す。 */
export function measureEnvelope(kind: ReachKind): ReachEnvelope {
  const cached = envelopeCache.get(kind);
  if (cached) return cached;

  const reach = sweep(kind);
  const includes = KIND[kind].includes;
  const base = includes ? measureEnvelope(includes) : null;

  const highest = reach.findIndex((gap) => gap > -Infinity);
  const envelope: ReachEnvelope = {
    maxRise: Math.max(base?.maxRise ?? 0, highest < 0 ? 0 : FLOOR_Y - highest),
    gapAt(rise: number): number {
      // 測った穴より深い落下は、底の値で代用する（実際はもう少し遠くへ届く）。
      const level = Math.min(Math.ceil(FLOOR_Y - rise), reach.length - 1);
      const own = level < 0 ? -Infinity : reach[level]!;
      return Math.max(own, base?.gapAt(rise) ?? -Infinity);
    },
  };
  envelopeCache.set(kind, envelope);
  return envelope;
}

/** `REACH` と同じ形の実測値。 */
export type MeasuredReach = {
  [K in keyof typeof REACH]: { [F in keyof (typeof REACH)[K]]: number };
};

export function measureReach(): MeasuredReach {
  const both = (kind: ReachKind): { rise: number; gap: number } => ({
    rise: measureRise(kind),
    gap: measureEnvelope(kind).gapAt(0),
  });
  return {
    solo: both("solo"),
    boost: both("boost"),
    double: both("double"),
    crate: { rise: measureRise("solo", true) },
    crateBoost: { rise: measureRise("boost", true) },
    crateDouble: { rise: measureRise("double", true) },
  };
}

/**
 * 実際に崖と向こう岸を置いて、隙間を越えられる操作が1つでもあるかを試す。
 * 包絡線（開けた空間の軌道から導く）が、本物の地形で成り立つことの裏取りに使う。
 */
export function canCrossGap(kind: ReachKind, gapTiles: number): boolean {
  const farX = (EDGE_COL + gapTiles) * TILE;
  let crossed = false;
  runCliff(kind, cliffStage(KIND[kind].pair, EDGE_COL + gapTiles), 150, (game) => {
    if (crossed) return true;
    const p = jumperOf(game);
    const feet = bottom(p.box);
    // 向こう岸の上に立った
    if (p.grounded && feet === FLOOR_Y && right(p.box) > farX) crossed = true;
    // 渡ったか、穴に落ちたら、この操作は終わり
    return crossed || feet > FLOOR_Y + PLAYER_H;
  });
  return crossed;
}
