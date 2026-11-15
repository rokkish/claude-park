import { describe, expect, it } from "vitest";
import { checkStage, formatReport, reachTable, type StageIssue } from "../src/game/stageCheck";
import type { StageData } from "../src/game/stageData";
import { stageLabel } from "../src/game/stageSelect";
import { STAGES } from "../src/stages/index";
import stage01 from "../src/stages/stage-01.json";
import stage07 from "../src/stages/stage-07.json";

/**
 * 全ステージ共通の機械検査。ステージを足すと自動で対象になる。
 * 表で個別に見たいときは `npx vite-node scripts/check-stage.ts <ラベル>`。
 */

// 到達力の実測（総当たり）を1回挟むので、既定の 5 秒では足りないことがある
const SLOW = 60_000;

const errorsOf = (issues: StageIssue[]): string[] =>
  issues.filter((i) => i.level === "error").map((i) => `[${i.code}] ${i.message}`);
const codes = (data: StageData): string[] => checkStage(data).issues.map((i) => i.code);

/** 1-1 を元に、一部だけ壊したステージを作る。 */
function broken(edit: (d: StageData) => void, base: unknown = stage01): StageData {
  const d = structuredClone(base) as StageData;
  edit(d);
  return d;
}

describe("登録済みの全ステージが検査を通る", () => {
  it.each(STAGES.map((s, i) => [stageLabel(STAGES, i), s] as const))(
    "%s に error が無い",
    (_label, data) => {
      expect(errorsOf(checkStage(data).issues)).toEqual([]);
    },
  );

  it.each(STAGES.map((s, i) => [stageLabel(STAGES, i), s] as const))(
    "%s の面と到達力の表が作れる",
    (label, data) => {
      const report = checkStage(data);
      expect(report.surfaces.length).toBeGreaterThan(0);
      const text = formatReport(data, report, label, { table: true });
      expect(text).toContain("面 → 面");
    },
    SLOW,
  );
});

describe("スポーン", () => {
  it("床の1つ上の行でなければ error（宙に浮いている）", () => {
    expect(codes(broken((d) => (d.spawns[0]!.y = 10)))).toContain("spawn-not-on-floor");
  });

  it("壁に埋まっていれば error", () => {
    expect(codes(broken((d) => (d.spawns[0]!.y = 16)))).toContain("spawn-in-wall");
  });

  it("グリッドの外なら error", () => {
    expect(codes(broken((d) => (d.spawns[1]!.x = 40)))).toContain("spawn-out-of-range");
  });

  it("2人が重なっていれば error", () => {
    expect(codes(broken((d) => (d.spawns[1] = { ...d.spawns[0]! })))).toContain("spawn-overlap");
  });

  it("箱の上に立たせるのは床の上として扱う（実際に動かして判定している）", () => {
    // 3-1 の箱は棚の上 (12,12)。その真上 (12,11) は地形だけ見ると宙だが、落ちない。
    const d = broken((s) => (s.spawns[0] = { x: 12, y: 11 }), stage07);
    expect(codes(d)).not.toContain("spawn-not-on-floor");
  });
});

describe("ギミックの範囲", () => {
  it("幅がグリッドからはみ出せば error", () => {
    const d = broken((s) => s.gimmicks.push({ type: "goal", x: 38, y: 15, w: 3 }));
    expect(codes(d)).toContain("gimmick-out-of-range");
  });

  it("足場の終点がはみ出しても error", () => {
    const d = broken((s) =>
      s.gimmicks.push({ type: "platform", x: 5, y: 14, w: 3, to: { x: 5, y: 20 } }),
    );
    expect(codes(d)).toContain("gimmick-out-of-range");
  });
});

describe("配線", () => {
  it("listen しているチャンネルを誰も emit していなければ error（書き間違い）", () => {
    const d = broken((s) => (s.gimmicks[0]!.emit = "sw_1"));
    const report = checkStage(d);
    expect(report.issues.map((i) => i.code)).toContain("listen-without-emit");
    // 取り残された emit 側は warning
    expect(report.issues.find((i) => i.code === "emit-without-listen")?.level).toBe("warning");
  });

  it("gate に listen が無ければ error（実行時に落ちる）", () => {
    const d = broken((s) => delete s.gimmicks[1]!.listen);
    expect(codes(d)).toContain("gate-without-listen");
  });

  it("listen が配列でなければ error", () => {
    expect(codes(broken((s) => (s.gimmicks[1]!.listen = "sw1")))).toContain("bad-listen");
  });

  it("未知の mode は error", () => {
    expect(codes(broken((s) => (s.gimmicks[1]!.mode = "not")))).toContain("bad-mode");
  });
});

describe("鍵とゴール", () => {
  it("goal.requires の鍵が無ければ error", () => {
    const d = broken((s) => (s.gimmicks[3]!.requires = ["key2"]));
    const report = checkStage(d);
    expect(report.issues.map((i) => i.code)).toContain("requires-missing-key");
    expect(report.issues.find((i) => i.code === "key-unused")?.level).toBe("warning");
  });

  it("goal が無ければ error", () => {
    const d = broken((s) => (s.gimmicks = s.gimmicks.filter((g) => g.type !== "goal")));
    expect(codes(d)).toContain("no-goal");
  });
});

describe("地形への埋まり", () => {
  it("板が壁の行にあれば error", () => {
    // 1-1 の板は棚の上 (15,12)。棚そのものの行 13 に置くと埋まる。
    expect(codes(broken((s) => (s.gimmicks[0]!.y = 13)))).toContain("buried");
  });

  it("ゲートが壁に掛かっていれば error", () => {
    // 高さ3にすると床 (行16) に食い込む
    expect(codes(broken((s) => (s.gimmicks[1]!.h = 3)))).toContain("buried");
  });

  it("板の下に床が無ければ warning", () => {
    const report = checkStage(broken((s) => (s.gimmicks[0]!.y = 8)));
    expect(report.issues.find((i) => i.code === "plate-floating")?.level).toBe("warning");
  });
});

describe("ロードできないステージ", () => {
  it("行の長さが揃っていなければ load の error 1件で打ち切る", () => {
    const report = checkStage(broken((s) => (s.grid[3] = "#..#")));
    expect(report.issues.map((i) => i.code)).toEqual(["load"]);
  });

  it("未登録の type も load の error", () => {
    const d = broken((s) => s.gimmicks.push({ type: "lever", x: 3, y: 15 }));
    expect(checkStage(d).issues.map((i) => i.code)).toEqual(["load"]);
  });
});

describe("面と到達力の表", () => {
  const data = stage01 as StageData;
  const report = checkStage(data);
  const find = (id: string) => report.surfaces.find((s) => s.id === id)!;

  it("1-1 の面は 棚・地面・ゲートの上", () => {
    expect(report.surfaces.map((s) => [s.id, s.kind, s.y, s.x0, s.x1])).toEqual([
      ["T1", "terrain", 312, 312, 456],
      ["T2", "terrain", 384, 24, 936],
      ["G1", "gate", 336, 432, 456],
    ]);
  });

  it(
    "地面から棚 (72px) は単独では届かず、ブーストなら届く（1-1 の成立条件）",
    () => {
      const up = reachTable(data, report.surfaces).find(
        (t) => t.from === find("T2") && t.to === find("T1"),
      )!;
      expect(up.rise).toBe(72);
      expect(up.gap).toBe(0);
      expect(up.verdicts.solo).toEqual({ ok: false, px: 14, axis: "rise" });
      expect(up.verdicts.boost).toEqual({ ok: true, px: 10, axis: "rise" });
      expect(up.verdicts.double.ok).toBe(true);
      expect(up.withCrate).toBeNull();
    },
    SLOW,
  );

  it(
    "覆われた面から真上へは届かない扱い",
    () => {
      const t = reachTable(data, report.surfaces).find(
        (x) => x.from === find("G1") && x.to === find("T1"),
      )!;
      expect(t.verdicts.double.axis).toBe("under");
      expect(t.verdicts.double.ok).toBe(false);
    },
    SLOW,
  );

  it(
    "箱があるステージでは「箱+二段」の列が付く",
    () => {
      const d = stage07 as StageData;
      const r = checkStage(d);
      expect(reachTable(d, r.surfaces).every((t) => t.withCrate !== null)).toBe(true);
      expect(formatReport(d, r, "3-1", { table: true })).toContain("箱+二段");
    },
    SLOW,
  );

  it("表を頼まなければ結果の1行だけ", () => {
    expect(formatReport(data, report, "1-1")).toBe('1-1 stage-01 "Boost & Hold": OK');
  });
});
