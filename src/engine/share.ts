/**
 * クリア結果の共有。
 *
 * バックエンドも API キーも要らない。モバイルでは OS のシェアシートを出せる
 * Web Share API を優先し、非対応環境（デスクトップの多くのブラウザ）では
 * X の Web Intent を新しいタブで開く。
 */

const SHARE_TITLE = "Claude Park";

/**
 * ハッシュタグは付けない。他人の名前空間に投稿を流し込むことになるため。
 * ステージ数もハードコードせず Game から受け取る。
 */
function shareText(timeText: string, stageCount: number): string {
  return `Claude Park の全${stageCount}ステージを ${timeText} でクリアしました！`;
}

/**
 * 配信先の URL。ハードコードせず現在地から組み立てるので、
 * GitHub Pages でもローカルでも、フォークした先でも正しく共有される。
 */
function shareUrl(): string {
  return location.origin + location.pathname;
}

export function openXIntent(text: string): void {
  const u = new URL("https://x.com/intent/post");
  u.searchParams.set("text", text);
  u.searchParams.set("url", shareUrl());
  window.open(u.toString(), "_blank", "noopener,noreferrer");
}

export async function share(timeText: string, stageCount: number): Promise<void> {
  const text = shareText(timeText, stageCount);
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: SHARE_TITLE, text, url: shareUrl() });
      return;
    } catch (e) {
      // ユーザーがシェアシートを閉じた場合も例外になる。その場合は
      // 何もせず終える。intent を開くと「閉じたのに開いた」ことになる。
      if ((e as { name?: string })?.name === "AbortError") return;
      // それ以外（非対応・共有先なしなど）は intent へ落とす。
    }
  }
  openXIntent(text);
}

/**
 * 全ステージ踏破中だけシェアボタンを出す。
 * 毎フレーム DOM を触らないよう、状態が変わったときだけ切り替える。
 */
export function setupShareButton(
  isAllCleared: () => boolean,
  getResult: () => { timeText: string; stageCount: number },
): () => void {
  const btn = document.querySelector<HTMLButtonElement>("#share-button");
  btn?.addEventListener("click", () => {
    const { timeText, stageCount } = getResult();
    void share(timeText, stageCount);
  });

  let shown = false;
  return () => {
    const next = isAllCleared();
    if (next === shown) return;
    shown = next;
    document.body.classList.toggle("all-cleared", shown);
  };
}
