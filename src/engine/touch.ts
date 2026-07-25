import type { InputSource, PlayerInput } from "./input";

/**
 * 画面上のボタンによるタッチ操作 (SPEC §8.3 の InputSource 別実装)。
 *
 * ボタンの位置は DOM と CSS が全て決める。ここは座標を一切持たず、
 * 「触れている点の下にどのボタンがあるか」を elementFromPoint で引くだけ。
 * これにより縦横のレイアウト変更が CSS だけで完結する。
 *
 * 同時押しは最大4点（各プレイヤーが 方向1 + ジャンプ）。
 * iOS Safari で5点、Android Chrome で10点以上扱えるので余裕がある。
 */

/** data-btn 属性の値。player-action か key-<KeyboardEvent.code> の形。 */
const PLAYER_BTN = /^p(\d+)-(left|right|jump)$/;
const KEY_BTN = /^key-(.+)$/;

export class TouchInput implements InputSource {
  private held = new Set<string>();
  private pressedThisStep = new Set<string>();
  private readonly root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    // passive: false でないと preventDefault が効かず、スクロールやズームが走る。
    const opts = { passive: false } as const;
    root.addEventListener("touchstart", this.onTouch, opts);
    root.addEventListener("touchmove", this.onTouch, opts);
    root.addEventListener("touchend", this.onTouch, opts);
    root.addEventListener("touchcancel", this.onTouch, opts);
  }

  /**
   * イベントごとに e.touches から押下集合を作り直す。
   * タッチ識別子を自前で管理するより、ボタン外へのスライドや
   * マルチタッチの取りこぼしに強い。
   */
  private readonly onTouch = (e: TouchEvent): void => {
    // data-native の要素（全画面ボタンなど）はブラウザ既定の挙動に任せる。
    // preventDefault すると click が合成されず、ユーザー操作として扱われない。
    const target = e.target as Element | null;
    if (target?.closest?.("[data-native]")) return;

    e.preventDefault();

    const next = new Set<string>();
    for (const t of Array.from(e.touches)) {
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const btn = el?.closest<HTMLElement>("[data-btn]");
      if (btn?.dataset.btn) next.add(btn.dataset.btn);
    }

    for (const id of next) {
      if (!this.held.has(id)) this.pressedThisStep.add(id);
    }
    this.held = next;
    this.reflectVisualState();
  };

  /** 押されているボタンに .is-pressed を付ける。見た目のフィードバックは必須。 */
  private reflectVisualState(): void {
    for (const el of this.root.querySelectorAll<HTMLElement>("[data-btn]")) {
      const on = el.dataset.btn ? this.held.has(el.dataset.btn) : false;
      el.classList.toggle("is-pressed", on);
    }
  }

  sample(playerIndex: number): PlayerInput {
    const dir = (a: string): boolean => this.held.has(`p${playerIndex}-${a}`);
    return {
      left: dir("left"),
      right: dir("right"),
      jumpHeld: dir("jump"),
      jumpPressed: this.pressedThisStep.has(`p${playerIndex}-jump`),
    };
  }

  /** タッチには物理キーが無いので、data-btn="key-KeyR" のようなボタンで代替する。 */
  isPressed(code: string): boolean {
    return this.held.has(`key-${code}`);
  }

  wasPressed(code: string): boolean {
    return this.pressedThisStep.has(`key-${code}`);
  }

  endStep(): void {
    this.pressedThisStep.clear();
  }

  dispose(): void {
    for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
      this.root.removeEventListener(type, this.onTouch as EventListener);
    }
  }
}

/** data-btn の値が妥当かをロード時に検証する。綴り間違いを黙って無効化させない。 */
export function validateTouchButtons(root: HTMLElement): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-btn]")) {
    const id = el.dataset.btn ?? "";
    if (!PLAYER_BTN.test(id) && !KEY_BTN.test(id)) {
      throw new Error(`不正な data-btn: "${id}" (p<n>-left|right|jump または key-<code>)`);
    }
  }
}

/**
 * タッチ主体の端末か。UA 文字列ではなく入力デバイスの粗さで判定する
 * （UA sniffing はタブレットや2-in-1で外しやすい）。
 */
export function isCoarsePointer(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}
