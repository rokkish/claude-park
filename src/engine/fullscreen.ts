/**
 * 全画面表示。URL バーを消してプレイ領域を稼ぐ。
 *
 * Fullscreen API は Android Chrome とデスクトップでは効くが、
 * iPhone の Safari は非対応（iPad は可）。iOS では manifest と
 * apple-mobile-web-app-capable による「ホーム画面に追加」が唯一の手段なので、
 * ここは対応端末での上積みと割り切り、非対応ならボタンごと隠す。
 */

/** PWA として起動済みか。この場合すでに URL バーが無いのでボタンは不要。 */
export function isStandalone(): boolean {
  const mq = window.matchMedia("(display-mode: fullscreen), (display-mode: standalone)");
  // iOS Safari は display-mode を返さないので navigator.standalone も見る
  const iosStandalone = (navigator as { standalone?: boolean }).standalone === true;
  return mq.matches || iosStandalone;
}

export function isFullscreenSupported(): boolean {
  return typeof document.documentElement.requestFullscreen === "function";
}

export async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    // 画面向きの固定は全画面中しか許可されない。未対応環境では黙って諦める。
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    };
    await orientation?.lock?.("landscape").catch(() => undefined);
  } catch {
    // ユーザー操作起点でない要求や、非対応端末では拒否される。無視してよい。
  }
}

/**
 * 全画面ボタンと、ゲーム画面への初回タップによる自動全画面を仕込む。
 * 自動化は「ユーザー操作の中で呼ぶ」制約を満たすため touchstart に乗せる。
 */
export function setupFullscreen(stageArea: HTMLElement | null): void {
  const btn = document.querySelector<HTMLButtonElement>("#btn-fullscreen");

  if (!btn) return;
  if (!isFullscreenSupported() || isStandalone()) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  btn.addEventListener("click", () => void toggleFullscreen());

  stageArea?.addEventListener(
    "touchstart",
    () => {
      if (!document.fullscreenElement) void toggleFullscreen();
    },
    { once: true },
  );
}
