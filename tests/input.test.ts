import { describe, expect, it } from "vitest";
import { CompositeInput, ScriptedInput, type PlayerInput } from "../src/engine/input";

/**
 * キーボードとタッチを束ねる層。ここが壊れると全操作が死ぬ割に、
 * 実機でしか気付けないのでテストで固定しておく。
 */

function inp(over: Partial<PlayerInput> = {}): PlayerInput {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false, ...over };
}

describe("CompositeInput", () => {
  it("どちらかの入力源が押していれば押下として扱う", () => {
    const a = new ScriptedInput([inp({ left: true }), inp()]);
    const b = new ScriptedInput([inp({ jumpHeld: true }), inp({ right: true })]);
    const c = new CompositeInput([a, b]);

    expect(c.sample(0)).toEqual(inp({ left: true, jumpHeld: true }));
    expect(c.sample(1)).toEqual(inp({ right: true }));
  });

  it("両方が同時に押していても二重に効かない", () => {
    const a = new ScriptedInput([inp({ right: true, jumpPressed: true })]);
    const b = new ScriptedInput([inp({ right: true, jumpPressed: true })]);

    expect(new CompositeInput([a, b]).sample(0)).toEqual(
      inp({ right: true, jumpPressed: true }),
    );
  });

  it("誰も押していなければ全て false", () => {
    const c = new CompositeInput([new ScriptedInput([inp()]), new ScriptedInput([inp()])]);
    expect(c.sample(0)).toEqual(inp());
  });

  it("範囲外のプレイヤー番号でも落ちない", () => {
    const c = new CompositeInput([new ScriptedInput([inp({ left: true })])]);
    expect(c.sample(5)).toEqual(inp());
  });

  it("endStep は全ての入力源に伝播する（ジャンプのエッジが残り続けない）", () => {
    const a = new ScriptedInput([inp({ jumpPressed: true })]);
    const b = new ScriptedInput([inp({ jumpPressed: true })]);
    const c = new CompositeInput([a, b]);

    expect(c.sample(0).jumpPressed).toBe(true);
    c.endStep();
    expect(c.sample(0).jumpPressed).toBe(false);
  });

  it("グローバルキーはいずれかの入力源が押していれば真", () => {
    const keyish: ScriptedInput = Object.assign(new ScriptedInput([inp()]), {
      wasPressed: (code: string) => code === "KeyR",
    });
    const c = new CompositeInput([new ScriptedInput([inp()]), keyish]);

    expect(c.wasPressed("KeyR")).toBe(true);
    expect(c.wasPressed("Enter")).toBe(false);
  });
});
