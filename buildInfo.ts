import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * ビルド識別子をコンパイル時に埋め込むための define を作る。
 * vite.config.ts と vitest.config.ts の両方から使う。片方だけに書くと
 * テスト実行時に未定義の識別子になって落ちるので、必ず共有すること。
 *
 * セマンティックバージョンだけでは「どのビルドが動いているか」が分からない。
 * 継続的にデプロイする以上、実際に動いているコミットを指せることの方が重要。
 */
export function buildDefines(): Record<string, string> {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

  // CI では checkout が浅いクローンになるが GITHUB_SHA が入る。
  // ローカルでは git から引く。git が無い環境（tarball 展開など）でも落とさない。
  let sha = process.env.GITHUB_SHA?.slice(0, 7) ?? "";
  if (!sha) {
    try {
      sha = execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
    } catch {
      sha = "unknown";
    }
  }

  return {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_SHA__: JSON.stringify(sha),
  };
}
