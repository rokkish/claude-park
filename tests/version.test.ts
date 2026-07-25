import { describe, expect, it } from "vitest";
import { APP_VERSION, BUILD_SHA, VERSION_LABEL } from "../src/version";

/**
 * ビルド識別子は define でコンパイル時に差し込まれる。
 * vite.config.ts と vitest.config.ts の両方に同じ define が要るので、
 * 片方に入れ忘れるとここで落ちる（本番だけ壊れる事故を防ぐ）。
 */
describe("バージョン埋め込み", () => {
  it("package.json のバージョンが入っている", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("短縮 SHA が入っている", () => {
    // git の無い環境では "unknown" になる。それも許容する。
    expect(BUILD_SHA).toMatch(/^([0-9a-f]{7}|unknown)$/);
  });

  it("画面表記は v1.2.3 (abc1234) の形", () => {
    expect(VERSION_LABEL).toMatch(/^v\d+\.\d+\.\d+ \(([0-9a-f]{7}|unknown)\)$/);
  });
});
