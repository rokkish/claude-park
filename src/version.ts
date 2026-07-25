/**
 * ビルド識別子。値は buildInfo.ts が define でコンパイル時に差し込む。
 * 実行時にファイルを読むわけではないので、配信物に余計なリクエストは増えない。
 */
declare const __APP_VERSION__: string;
declare const __BUILD_SHA__: string;

export const APP_VERSION = __APP_VERSION__;
export const BUILD_SHA = __BUILD_SHA__;

/** 画面に出す表記。どのコミットが動いているかを特定できるようにする。 */
export const VERSION_LABEL = `v${APP_VERSION} (${BUILD_SHA})`;
