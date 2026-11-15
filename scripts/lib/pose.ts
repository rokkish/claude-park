import type { AABB } from "../../src/engine/aabb";
import { idleInput, type ScriptedInput } from "../../src/engine/input";
import type { Game } from "../../src/game/game";
import type { Gimmick } from "../../src/game/gimmicks/types";
import { DT, PLAYER_H, PLAYER_W, TILE } from "../../src/game/tuning";

/**
 * preview-stage.ts の引数と、そこから作るポーズ。
 *
 * 以前はポーズ（誰をどこに置いて何ステップ進めるか）をスクリプトに直接書いており、
 * ステージを足すたびにスクリプトを編集していた。ここでは引数で指定できるようにする。
 * Node に依存しない（fs も process も触らない）ので、テストから直接呼べる。
 */

export const USAGE = `使い方:
  npx vite-node scripts/preview-stage.ts <out.png> [stage] [options]

stage（既定 1）:
  ラベル (2-4) / id (stage-11) / 配列での順番 (8) / .json のパス（未登録のステージ）

ポーズ（書いた順に実行する。何度でも書ける）:
  --place pN=X,Y        プレイヤー N をタイル (X,Y) に置く。小数可（4.5,15 は半タイル右）
  --ride pN=TARGET      TARGET の上に乗せる。p1 / p2 / platform / platform:1 / crate:0 / gate
  --press pN=KEYS:STEPS 実際の入力で STEPS ステップ動かす。KEYS は left / right / jump を + でつなぐ
  --hold STEPS          何もせず STEPS ステップ進める（足場やゲートが動き終わるのを待つ）

画面:
  --select              ワールド選択画面を焼く
  --touch               操作説明をタッチ用にする
  --camera fit|follow   fit はステージ全体（既定）、follow は実際の追従カメラ
  --zoom N              拡大率（既定 2）
  --settle STEPS        最後に進めるステップ数（既定 10。ゲートの開閉を落ち着かせる）

例:
  preview-stage.ts out.png 1-1 --place p1=12,15 --ride p2=p1
  preview-stage.ts out.png 2-4 --place p1=2.33,15 --place p2=9,14 --hold 150
  preview-stage.ts out.png 1-1 --place p1=25,15 --hold 5 --place p1=35,15 --place p2=36.25,15
  preview-stage.ts out.png 3-2 --place p1=11,15 --press p1=left:240`;

export type RideTarget =
  | { kind: "player"; player: number }
  | { kind: "gimmick"; type: string; index: number };

export type PoseAction =
  | { kind: "place"; player: number; x: number; y: number }
  | { kind: "ride"; player: number; target: RideTarget }
  | { kind: "press"; player: number; left: boolean; right: boolean; jump: boolean; steps: number }
  | { kind: "hold"; steps: number };

export interface PreviewArgs {
  out: string;
  /** ステージの指定（未解決の文字列）。 */
  stage: string;
  select: boolean;
  touch: boolean;
  camera: "fit" | "follow";
  zoom: number;
  settle: number;
  actions: PoseAction[];
}

function fail(message: string): never {
  throw new Error(`${message}\n\n${USAGE}`);
}

function count(flag: string, raw: string | undefined, min = 0): number {
  const n = Number(raw);
  if (raw === undefined || raw === "" || !Number.isInteger(n) || n < min) {
    fail(`${flag} には ${min} 以上の整数を渡す（受け取った値: ${raw ?? "なし"}）`);
  }
  return n;
}

/** "p2" → 1。 */
function playerIndex(flag: string, raw: string): number {
  const m = /^p([1-9])$/.exec(raw);
  if (!m) fail(`${flag}: プレイヤーは p1 / p2 の形で書く（受け取った値: ${raw}）`);
  return Number(m[1]) - 1;
}

/** "p1=..." を分ける。 */
function assignment(flag: string, raw: string | undefined): { player: number; value: string } {
  const eq = raw?.indexOf("=") ?? -1;
  if (raw === undefined || eq < 0) fail(`${flag} は pN=... の形で書く（受け取った値: ${raw ?? "なし"}）`);
  return { player: playerIndex(flag, raw.slice(0, eq)), value: raw.slice(eq + 1) };
}

function parsePlace(raw: string | undefined): PoseAction {
  const { player, value } = assignment("--place", raw);
  const parts = value.split(",");
  const [x, y] = parts.map(Number);
  if (parts.length !== 2 || parts.some((p) => p.trim() === "") || !Number.isFinite(x) || !Number.isFinite(y)) {
    fail(`--place は pN=X,Y の形で書く（受け取った値: ${raw}）`);
  }
  return { kind: "place", player, x: x!, y: y! };
}

function parseRide(raw: string | undefined): PoseAction {
  const { player, value } = assignment("--ride", raw);
  if (/^p[1-9]$/.test(value)) {
    const target = playerIndex("--ride", value);
    if (target === player) fail(`--ride: 自分の上には乗れない（${raw}）`);
    return { kind: "ride", player, target: { kind: "player", player: target } };
  }
  const m = /^([a-z]+)(?::(\d+))?$/.exec(value);
  if (!m) fail(`--ride の相手は p1 / platform / crate:1 のように書く（受け取った値: ${raw}）`);
  return {
    kind: "ride",
    player,
    target: { kind: "gimmick", type: m[1]!, index: Number(m[2] ?? 0) },
  };
}

function parsePress(raw: string | undefined): PoseAction {
  const { player, value } = assignment("--press", raw);
  const [keys, steps, ...rest] = value.split(":");
  if (!keys || steps === undefined || rest.length > 0) {
    fail(`--press は pN=KEYS:STEPS の形で書く（受け取った値: ${raw}）`);
  }
  const names = keys.split("+");
  for (const k of names) {
    if (!["left", "right", "jump"].includes(k)) {
      fail(`--press のキーは left / right / jump（受け取った値: ${k}）`);
    }
  }
  return {
    kind: "press",
    player,
    left: names.includes("left"),
    right: names.includes("right"),
    jump: names.includes("jump"),
    steps: count("--press", steps, 1),
  };
}

/** process.argv.slice(2) を解釈する。書き間違いは使い方を添えて throw する。 */
export function parsePreviewArgs(argv: readonly string[]): PreviewArgs {
  const args: PreviewArgs = {
    out: "stage-preview.png",
    stage: "1",
    select: false,
    touch: false,
    camera: "fit",
    zoom: 2,
    settle: 10,
    actions: [],
  };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const value = (): string | undefined => argv[++i];
    switch (a) {
      case "--place":
        args.actions.push(parsePlace(value()));
        break;
      case "--ride":
        args.actions.push(parseRide(value()));
        break;
      case "--press":
        args.actions.push(parsePress(value()));
        break;
      case "--hold":
        args.actions.push({ kind: "hold", steps: count("--hold", value(), 1) });
        break;
      case "--select":
        args.select = true;
        break;
      case "--touch":
        args.touch = true;
        break;
      case "--camera": {
        const v = value();
        if (v !== "fit" && v !== "follow") fail(`--camera は fit か follow（受け取った値: ${v ?? "なし"}）`);
        args.camera = v;
        break;
      }
      case "--zoom":
        args.zoom = count("--zoom", value(), 1);
        break;
      case "--settle":
        args.settle = count("--settle", value());
        break;
      case "--help":
      case "-h":
        fail("preview-stage: ステージを PNG に焼き出す");
        break;
      default:
        if (a.startsWith("--")) fail(`未知のオプション: ${a}`);
        positional.push(a);
    }
  }

  // 位置引数: out.png [stage] [start|select] [touch]。3つ目以降は旧形式との互換。
  const [out, stage, pose, touch, ...extra] = positional;
  if (out !== undefined) args.out = out;
  if (stage !== undefined) args.stage = stage;
  if (pose === "select") args.select = true;
  else if (pose !== undefined && pose !== "start") {
    fail(`ポーズ名 "${pose}" は廃止した。--place / --ride / --hold で指定する`);
  }
  if (touch === "touch") args.touch = true;
  else if (touch !== undefined) fail(`余分な引数: ${touch}`);
  if (extra.length > 0) fail(`余分な引数: ${extra.join(" ")}`);
  if (args.select && args.actions.length > 0) fail("--select とポーズ指定は同時に使えない");
  return args;
}

// ---------------------------------------------------------------------------
// ヘッドレスでゲームを動かす部品。tests/helpers/stage.ts も同じものを使う
// （プレビューで見たポーズと、テストで作った配置が食い違わないように）。
// ---------------------------------------------------------------------------

type Player = Game["players"][number];

/** タイル (tx, ty) に置く。小数可。dx は px のずらし。 */
export function placeOnTile(player: Player, tx: number, ty: number, dx = 0): void {
  player.teleport(tx * TILE + dx, ty * TILE);
}

/** 矩形の上の中央に乗せる。 */
export function rideOnBox(player: Player, box: AABB): void {
  player.teleport(box.x + Math.round((box.w - PLAYER_W) / 2), box.y - PLAYER_H);
}

/** type が一致する n 番目（0始まり）のギミック。無ければ、何があるかを添えて throw する。 */
export function nthGimmick(game: Game, type: string, n = 0): Gimmick {
  const found = game.stage.gimmicks.filter((g) => g.type === type)[n];
  if (!found) {
    const types = [...new Set(game.stage.gimmicks.map((g) => g.type))].join(", ");
    throw new Error(`${type}:${n} が無い（このステージにあるのは ${types || "なし"}）`);
  }
  return found;
}

export interface Keys {
  left?: boolean;
  right?: boolean;
  jump?: boolean;
}

/**
 * 実際の入力で最大 steps ステップ動かし、入力を離す。until が真になったら止まる。
 * jump は押し続け、最初のステップで踏み切る。進めたステップ数を返す。
 */
export function pressKeys(
  game: Game,
  input: ScriptedInput,
  playerIndex: number,
  keys: Keys,
  steps: number,
  until?: () => boolean,
): number {
  let done = 0;
  while (done < steps) {
    // endStep が jumpPressed を書き換えるので、毎ステップ新しく作る
    input.inputs[playerIndex] = {
      left: keys.left ?? false,
      right: keys.right ?? false,
      jumpHeld: keys.jump ?? false,
      jumpPressed: (keys.jump ?? false) && done === 0,
    };
    game.step(DT);
    done++;
    if (until?.()) break;
  }
  input.inputs[playerIndex] = idleInput();
  return done;
}

/** 「p1=(4.0,15.0) p2=...」。位置はタイル座標。 */
export function describePlayers(game: Game, digits = 1): string {
  const ts = game.stage.data.tileSize;
  return game.players
    .map((p) => `p${p.index + 1}=(${(p.box.x / ts).toFixed(digits)},${(p.box.y / ts).toFixed(digits)})`)
    .join(" ");
}

/**
 * ポーズを実際のゲームに適用する。game.start() 済みであること。
 * 入力は渡された ScriptedInput（game に渡したのと同じもの）へ流す。
 */
export function applyPose(game: Game, input: ScriptedInput, actions: readonly PoseAction[]): void {
  const player = (index: number): Player => {
    const p = game.players[index];
    if (!p) throw new Error(`p${index + 1} は居ない（このステージは ${game.players.length} 人）`);
    return p;
  };

  for (const a of actions) {
    switch (a.kind) {
      case "place":
        placeOnTile(player(a.player), a.x, a.y);
        break;
      case "ride": {
        const t = a.target;
        const box = t.kind === "player" ? player(t.player).box : nthGimmick(game, t.type, t.index).aabb;
        rideOnBox(player(a.player), box);
        break;
      }
      case "press":
        player(a.player);
        pressKeys(game, input, a.player, a, a.steps);
        break;
      case "hold":
        for (let i = 0; i < a.steps; i++) game.step(DT);
        break;
    }
  }
}
