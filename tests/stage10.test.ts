import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game";
import { ScriptedInput, type PlayerInput } from "../src/engine/input";
import { DT, TILE } from "../src/game/tuning";
import type { StageData } from "../src/game/stageData";
import stage10 from "../src/stages/stage-10.json";

/**
 * ステージ1-4「Two Keys」の検証 (docs/SPEC.md §7.20)。
 *
 * 教える2つの洞察:
 * 1. 「橋を架けた人はその橋を渡れない」— 板αが橋（`mode:"none"`の反転ゲート）を
 *    実体化させるが、ラッチゲート（渓谷の先）は α と β の同時押しが要る。β は対岸に
 *    しかないので、板αを踏んだままの人は対岸へ行けず、もう1人が渡って β を踏む必要がある。
 *    対岸にも同じチャンネル `swA` を鳴らす板α2があるので、そこへ持ち手を交代すれば
 *    最初に板αを踏んでいた側も後から渡れる。
 * 2. 「入口と出口が逆位相」— 鍵2の部屋は入口が `mode:"none"`（誰も押していない間だけ通れる）、
 *    出口が `mode:"all"`（押している間だけ通れる）で、どちらも同じチャンネル `swC` を聞く。
 *    部屋の外にある板γ・板δが同じ `swC` を鳴らすので、2人が役割を交代しながら
 *    入って出ることができる。
 *
 * このステージは高さによる制限を一切使わない。World 3 の設計記録（SPEC §7.19, §7.20）で
 * 見つかった「相方の頭に乗った状態で頭側が跳ぶ二段ジャンプは149px届き、箱を使った
 * どんな高さの見積もりも上回ってしまう」という発見があるため、高さで詰みを作る設計は
 * このエンジンでは信頼できない。ここでは幅（渓谷）と信号の位相（部屋の出入り）という
 * 「形」だけで難しさを作っている。
 */

const GROUND_TOP = 13 * TILE; // 312: 全域で共通の地面の上面
const CHASM_LEFT = 10 * TILE; // 240
const FAR_BANK_X = 15 * TILE; // 360: 対岸の左端（= 橋の右端）
const CHASM_FLOOR = 18 * TILE; // 432: グリッド外はSolid扱いなので谷底はグリッド下端

/** gimmicks[] のインデックス。stage-10.json の並び順に対応する。 */
const IDX = {
  plateA: 0,
  bridge: 1,
  plateB: 2,
  plateA2: 3,
  latchGate: 4,
  key1: 5,
  plateC: 6,
  entranceGate: 7,
  key2: 8,
  exitGate: 9,
  plateD: 10,
  goal: 11,
} as const;

function idle(): PlayerInput {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false };
}

function newGame(): { game: Game; input: ScriptedInput } {
  const input = new ScriptedInput([idle(), idle()]);
  const game = new Game(input, stage10 as StageData);
  game.start();
  return { game, input };
}

function run(
  game: Game,
  input: ScriptedInput,
  steps: number,
  each?: (i: number) => void,
): void {
  for (let i = 0; i < steps; i++) {
    each?.(i);
    game.step(DT);
  }
  void input;
}

/** 両者を待機させ、現在位置に留まらせる（板の上ならそのまま踏み続ける）。 */
function settle(game: Game, input: ScriptedInput, steps: number): void {
  run(game, input, steps, () => {
    input.inputs[0] = idle();
    input.inputs[1] = idle();
  });
}

/**
 * 実入力で mover を target まで走らせる。もう片方は現在地で待機させたままにする
 * （＝板を踏み続けさせる）。目標に届く前に maxSteps を使い切ったら、そこで
 * ループを終える（呼び出し側の expect が「どこで詰まったか」を教えてくれる）。
 *
 * 走り込んだ勢い(慣性)は目標に届いた瞬間に打ち切る。そのままにすると、摩擦で
 * 止まりきるまでの数フレームで数px先まで惰性で進んでしまい、すぐ隣にある次の
 * 板を偶然踏んでしまう事故につながる（実際にこのテストで踏んだ）。
 * `teleport(現在地, 現在地)` は位置を変えずに vx/vy だけ 0 にする副作用を使っている。
 */
function driveUntil(
  game: Game,
  input: ScriptedInput,
  mover: 0 | 1,
  targetX: number,
  opts: { dir?: "left" | "right"; maxSteps?: number } = {},
): void {
  const dir = opts.dir ?? (targetX >= game.players[mover]!.box.x ? "right" : "left");
  const maxSteps = opts.maxSteps ?? 400;
  const other = mover === 0 ? 1 : 0;
  for (let i = 0; i < maxSteps; i++) {
    const p = game.players[mover]!;
    const reached = dir === "right" ? p.box.x >= targetX : p.box.x <= targetX;
    if (reached) break;
    input.inputs[mover] = { left: dir === "left", right: dir === "right", jumpHeld: false, jumpPressed: false };
    input.inputs[other] = idle();
    game.step(DT);
  }
  const p = game.players[mover]!;
  p.teleport(p.box.x, p.box.y); // 位置はそのまま、慣性だけ断つ
}

/** solidAABB() の結果。持たないギミック（板・鍵・ゴール）は常に null。 */
function solidOf(game: Game, idx: number): { x: number; y: number; w: number; h: number } | null {
  return game.stage.gimmicks[idx]!.solidAABB?.() ?? null;
}

describe("ステージ1-4のジオメトリ", () => {
  it("スポーンは2人ぶん、地面の上に立っている", () => {
    const { game } = newGame();
    expect(game.players).toHaveLength(2);
    for (const p of game.players) {
      expect(p.box.y + p.box.h).toBe(GROUND_TOP);
    }
  });

  it("グリッドは18行×40列", () => {
    expect(stage10.grid).toHaveLength(18);
    for (const row of stage10.grid) expect(row).toHaveLength(40);
  });
});

describe("渓谷は単独では渡れない", () => {
  it("走ってもジャンプしても対岸(タイル15)には届かず、谷底へ落ちる", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    p2!.teleport(6 * TILE, 12 * TILE); // 隔離（どの板にも触れない）
    p1!.teleport(8 * TILE, 12 * TILE); // 橋の手前、板αには触れない位置

    let maxX = -Infinity;
    run(game, input, 180, (i) => {
      input.inputs[0] = { left: false, right: true, jumpHeld: true, jumpPressed: i === 0 };
      input.inputs[1] = idle();
      maxX = Math.max(maxX, p1!.box.x);
    });

    expect(maxX).toBeLessThan(FAR_BANK_X);
    // 谷底(グリッド下端)へ落ちている
    expect(p1!.box.y + p1!.box.h).toBeGreaterThan(GROUND_TOP);
    expect(p1!.box.y + p1!.box.h).toBeLessThanOrEqual(CHASM_FLOOR);
  });
});

describe("橋（反転ゲート）の開閉", () => {
  it("誰も swA を踏んでいなければ橋は非Solid", () => {
    const { game, input } = newGame();
    run(game, input, 10);
    expect(solidOf(game, IDX.bridge)).toBeNull();
  });

  it("板αを踏むと橋がSolidになり、地面と面一(y=312)で渓谷幅ぴったりになる", () => {
    const { game, input } = newGame();
    const [p1] = game.players;
    p1!.teleport(1 * TILE, 12 * TILE);

    run(game, input, 10);

    const box = solidOf(game, IDX.bridge);
    expect(box).not.toBeNull();
    expect(box!.y).toBe(GROUND_TOP);
    expect(box!.x).toBe(CHASM_LEFT);
    expect(box!.w).toBe(5 * TILE);
  });
});

describe("板βは対岸にあり、橋なしでは到達できない", () => {
  it("板βのアタリ判定は対岸(タイル15以降)にある", () => {
    const { game } = newGame();
    const plateB = game.stage.gimmicks[IDX.plateB]!.aabb;
    expect(plateB.x).toBeGreaterThanOrEqual(FAR_BANK_X);
  });

  it("橋を架けずに走っても板βの位置までは届かない", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    const plateB = game.stage.gimmicks[IDX.plateB]!.aabb;
    p2!.teleport(6 * TILE, 12 * TILE);
    p1!.teleport(8 * TILE, 12 * TILE);

    run(game, input, 180, (i) => {
      input.inputs[0] = { left: false, right: true, jumpHeld: true, jumpPressed: i === 0 };
      input.inputs[1] = idle();
    });

    expect(p1!.box.x).toBeLessThan(plateB.x);
  });
});

describe("ラッチゲート: αとβの同時押しが必要", () => {
  it("swAだけでは閉じたまま", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    p1!.teleport(1 * TILE, 12 * TILE); // α
    p2!.teleport(6 * TILE, 12 * TILE); // 隔離

    run(game, input, 10);

    expect(solidOf(game, IDX.latchGate)).not.toBeNull();
  });

  it("swBだけでは閉じたまま", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    p1!.teleport(15 * TILE, 12 * TILE); // β
    p2!.teleport(6 * TILE, 12 * TILE); // 隔離

    run(game, input, 10);

    expect(solidOf(game, IDX.latchGate)).not.toBeNull();
  });

  it("両方同時に踏むと開き、離してもラッチして開いたまま", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    p1!.teleport(1 * TILE, 12 * TILE); // α
    p2!.teleport(15 * TILE, 12 * TILE); // β

    run(game, input, 10);
    expect(solidOf(game, IDX.latchGate)).toBeNull(); // 開いた

    p1!.teleport(8 * TILE, 12 * TILE); // α から離れる
    p2!.teleport(2 * TILE, 12 * TILE);
    run(game, input, 10);

    expect(solidOf(game, IDX.latchGate)).toBeNull(); // ラッチで開いたまま
  });
});

describe("鍵2の部屋: 入口と出口は逆位相", () => {
  it("swCが0のとき、入口は通れて出口は塞がれている", () => {
    const { game, input } = newGame();
    run(game, input, 10);

    expect(solidOf(game, IDX.entranceGate)).toBeNull(); // 入口は非Solid=通れる
    expect(solidOf(game, IDX.exitGate)).not.toBeNull(); // 出口はSolid=塞がれている
  });

  it("swCが1のとき、入口は塞がれて出口が通れる", () => {
    const { game, input } = newGame();
    const [p1] = game.players;
    p1!.teleport(24 * TILE, 12 * TILE); // 板γ

    run(game, input, 10);

    expect(solidOf(game, IDX.entranceGate)).not.toBeNull();
    expect(solidOf(game, IDX.exitGate)).toBeNull();
  });
});

describe("ゴールは両方の鍵と両プレイヤーを要求する", () => {
  it("鍵1つだけでは、両者がゴールにいてもクリアしない", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    p1!.teleport(22 * TILE, 12 * TILE); // key1
    run(game, input, 5);

    p1!.teleport(36 * TILE, 12 * TILE);
    p2!.teleport(37 * TILE, 12 * TILE);
    run(game, input, 10);

    expect(game.phase).not.toBe("cleared");
  });

  it("両方の鍵があっても、1人しかゴールにいなければクリアしない", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;
    p1!.teleport(22 * TILE, 12 * TILE); // key1
    run(game, input, 5);
    p1!.teleport(29 * TILE, 12 * TILE); // key2
    run(game, input, 5);

    p1!.teleport(36 * TILE, 12 * TILE); // ゴールに入るのは p1 だけ
    p2!.teleport(2 * TILE, 12 * TILE); // p2 は遠くに隔離
    run(game, input, 10);

    expect(game.phase).not.toBe("cleared");
  });
});

/**
 * 通しでクリアできることの証明。
 *
 * 2-2 (Counterweight) が「各部分は全部テストを通ったのに盤面全体としては
 * クリア不能だった」という事故を起こしたため (SPEC §7.14)、このステージでも
 * 想定手順をそのまま踏んで最後まで到達できることを固定する。
 *
 * 渓谷を渡る（洞察1）・入口/出口ゲートが逆位相で開閉する（洞察2）という「肝」の
 * 部分は teleport で飛ばさず、実入力で歩かせて物理に解かせる。それ以外の、
 * 何もない床の上をただ移動するだけの区間は teleport で飛ばす。
 *
 * これは手抜きではない: プレイヤー同士の横方向衝突は「押し合い」であって
 * 通り抜け不能な壁ではないため (SPEC §3.3)、板の上で待機している相方の
 * 真後ろから同じ高さで実入力を当てて走らせると、相方を押し出して信号が
 * 切れてしまう（実際に最初の実装でこの事故が起きた）。実プレイでは
 * このステージのように行1〜10が柱の無い吹き抜けの部屋なら、相方の頭上を
 * 跳び越えるなどして素通りできる。その回避を1回の teleport で表現し、
 * 「橋を渡り切る」「ゲートを実際に通り抜ける」という当たり判定そのものは
 * 必ず実入力の連続ステップで検証する。
 */
describe("想定手順で2人ともゴールに到達できる（洞察1: 橋 → 洞察2: 逆位相の部屋）", () => {
  it("最後まで通しで進めると cleared になる", () => {
    const { game, input } = newGame();
    const [p1, p2] = game.players;

    // 1. P1 が板αに乗る → 橋が実体化する
    p1!.teleport(1 * TILE, 12 * TILE);
    settle(game, input, 10);
    expect(solidOf(game, IDX.bridge)).not.toBeNull();

    // P2 を板αの少し先（開けた部屋なので回り込んで通過できる位置）へ動かす。
    // まだ橋にも渓谷にも触れていない。
    p2!.teleport(9 * TILE, 12 * TILE);

    // 2. P2 が実際に橋を渡って対岸へ（ここが洞察1の核。テレポートで飛ばさない）
    driveUntil(game, input, 1, FAR_BANK_X);
    expect(p2!.box.x).toBeGreaterThanOrEqual(FAR_BANK_X);
    expect(p2!.box.y + p2!.box.h).toBe(GROUND_TOP); // 落ちずに渡り切った
    expect(p1!.box.x).toBe(1 * TILE); // P1 は板αの上から動いていない（押されていない）

    // 3. P2 が板βに乗る（直前に歩いて到達した場所そのもの）
    //    → α+β同時でラッチゲートが開く
    p2!.teleport(15 * TILE, 12 * TILE);
    settle(game, input, 10);
    expect(solidOf(game, IDX.latchGate)).toBeNull();

    // 4. P2 が板α2（同じ swA）に乗り換え、橋を維持したまま持ち手を交代する準備
    p2!.teleport(18 * TILE, 12 * TILE);
    settle(game, input, 10);
    expect(solidOf(game, IDX.bridge)).not.toBeNull(); // 板α2で橋は維持される
    expect(solidOf(game, IDX.latchGate)).toBeNull(); // ラッチは持続する

    // 5. P1 が板αを離れ、実際に渓谷を渡り切る（対岸のP2の板α2の手前で止める。
    //    ここが洞察1の受け渡しの核＝橋は今 P2 が支えている。テレポートで飛ばさない）
    driveUntil(game, input, 0, FAR_BANK_X + 20);
    expect(p1!.box.x).toBeGreaterThanOrEqual(FAR_BANK_X + 20);
    expect(p1!.box.y + p1!.box.h).toBe(GROUND_TOP); // 落ちずに渡り切った
    expect(p2!.box.x).toBe(18 * TILE); // P2 は板α2の上から動いていない
    expect(solidOf(game, IDX.latchGate)).toBeNull(); // ラッチゲートはまだ開いたまま

    // ここから先は渓谷と無関係な開けた床。ラッチゲートは既に開いているので、
    // P1はそのまま鍵1へ進める（板α2からP2が離れても橋はもう誰も必要としない）。
    p1!.teleport(22 * TILE, 12 * TILE); // 鍵1
    settle(game, input, 5);

    // 6. P2 も開けた部屋（入口はまだ開いている＝誰もswCを押していない）へ進み、鍵2を取る
    expect(solidOf(game, IDX.entranceGate)).toBeNull(); // まだ誰もswCを押していない
    p2!.teleport(29 * TILE, 12 * TILE); // 鍵2
    settle(game, input, 5);

    // 7. P1 が板γに乗る → 入口が閉じ、出口が開く
    p1!.teleport(24 * TILE, 12 * TILE);
    settle(game, input, 10);
    expect(solidOf(game, IDX.entranceGate)).not.toBeNull();
    expect(solidOf(game, IDX.exitGate)).toBeNull();

    // 8. P2 が実際に開いた出口を抜けて部屋を出る（洞察2の核。テレポートで飛ばさない）
    driveUntil(game, input, 1, 33 * TILE);
    expect(p2!.box.x).toBeGreaterThanOrEqual(33 * TILE);
    expect(p2!.box.y + p2!.box.h).toBe(GROUND_TOP);
    expect(p1!.box.x).toBe(24 * TILE); // P1 は板γの上から動いていない

    // 9. P1 が板γを離れる → 入口が再び開く
    p1!.teleport(23 * TILE, 12 * TILE);
    settle(game, input, 10);
    expect(solidOf(game, IDX.entranceGate)).toBeNull();
    expect(solidOf(game, IDX.exitGate)).not.toBeNull();

    // 10. P1 が実際に開いた入口から部屋へ入る（洞察2の核。テレポートで飛ばさない）
    driveUntil(game, input, 0, 29 * TILE);
    expect(p1!.box.x).toBeGreaterThanOrEqual(27 * TILE);
    expect(p1!.box.x).toBeLessThan(32 * TILE);

    // 11. P2 が板δに乗る → 出口が再び開く
    p2!.teleport(34 * TILE, 12 * TILE);
    settle(game, input, 10);
    expect(solidOf(game, IDX.exitGate)).toBeNull();

    // 12. P1 が実際に開いた出口から部屋を出る（洞察2の核。テレポートで飛ばさない）
    driveUntil(game, input, 0, 33 * TILE);
    expect(p1!.box.x).toBeGreaterThanOrEqual(33 * TILE);
    expect(p1!.box.y + p1!.box.h).toBe(GROUND_TOP);
    expect(p2!.box.x).toBe(34 * TILE); // P2 は板δの上から動いていない

    // 13. 2人ともゴール(タイル36〜38)へ
    p1!.teleport(36 * TILE, 12 * TILE);
    p2!.teleport(37 * TILE, 12 * TILE);
    settle(game, input, 10);

    expect(game.phase).toBe("cleared");
  });
});
