import { defineConfig } from "vitest/config";
import { buildDefines } from "./buildInfo";

export default defineConfig({
  // vite.config.ts と同じ埋め込みが要る。片方だけだとテストで落ちる。
  define: buildDefines(),
  test: {
    // 物理はヘッドレスで検証する（DOM を要求しない設計になっている）
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
