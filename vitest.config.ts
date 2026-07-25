import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 物理はヘッドレスで検証する（DOM を要求しない設計になっている）
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
