import { defineConfig } from "vite";
import { buildDefines } from "./buildInfo";

export default defineConfig({
  // 相対パスで出力する。GitHub Pages のプロジェクトページは
  // https://<user>.github.io/claude-park/ というサブパス配信なので、
  // 絶対パス(/assets/...)のままだと必ず 404 になる。
  // "./" にしておけばルート配信・サブパス配信・itch.io のどれでも同じ成果物が動く。
  base: "./",
  define: buildDefines(),
  server: { port: 5173, open: false },
  build: { target: "es2022" },
});
