/**
 * キーボード入力 (SPEC §2.2)。
 *
 * 「押下中フラグ」ではなくエッジを含む PlayerInput を返す。
 * jumpPressed は「このステップで新たに押された」で、keydown の
 * オートリピートは repeat フラグで弾く。
 */

export interface PlayerInput {
  left: boolean;
  right: boolean;
  jumpHeld: boolean;
  /** このステップの立ち上がりエッジ。消費するまで true を保つ。 */
  jumpPressed: boolean;
}

export interface KeyMap {
  left: string[];
  right: string[];
  jump: string[];
}

/** プレイヤーを増やすときはここにエントリを足すだけでよい。 */
export const DEFAULT_KEYMAPS: KeyMap[] = [
  { left: ["KeyA"], right: ["KeyD"], jump: ["KeyW", "Space"] },
  { left: ["ArrowLeft"], right: ["ArrowRight"], jump: ["ArrowUp"] },
];

/** 将来 Gamepad を足す場合は、この面の別実装を差し込む。 */
export interface InputSource {
  /** 固定ステップ 1 回分の入力を取り出す。 */
  sample(playerIndex: number): PlayerInput;
  /** ステップ末尾でエッジを消費する。 */
  endStep(): void;
  isPressed(code: string): boolean;
  /** このステップ中に押されたか（グローバルキー用）。 */
  wasPressed(code: string): boolean;
  dispose(): void;
}

export class KeyboardInput implements InputSource {
  private held = new Set<string>();
  private pressedThisStep = new Set<string>();
  private readonly keymaps: KeyMap[];

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.isBound(e.code)) e.preventDefault();
    if (e.repeat) return; // オートリピートはエッジではない
    this.held.add(e.code);
    this.pressedThisStep.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };

  /** タブが非アクティブになると keyup を取り逃すので、そこで全解除する。 */
  private readonly onBlur = (): void => {
    this.held.clear();
  };

  private readonly target: EventTarget;

  constructor(keymaps: KeyMap[] = DEFAULT_KEYMAPS, target: EventTarget = window) {
    this.keymaps = keymaps;
    this.target = target;
    target.addEventListener("keydown", this.onKeyDown as EventListener);
    target.addEventListener("keyup", this.onKeyUp as EventListener);
    target.addEventListener("blur", this.onBlur);
  }

  private isBound(code: string): boolean {
    return this.keymaps.some(
      (m) => m.left.includes(code) || m.right.includes(code) || m.jump.includes(code),
    );
  }

  sample(playerIndex: number): PlayerInput {
    const map = this.keymaps[playerIndex];
    if (!map) return { left: false, right: false, jumpHeld: false, jumpPressed: false };
    const any = (codes: string[], set: Set<string>): boolean => codes.some((c) => set.has(c));
    return {
      left: any(map.left, this.held),
      right: any(map.right, this.held),
      jumpHeld: any(map.jump, this.held),
      jumpPressed: any(map.jump, this.pressedThisStep),
    };
  }

  isPressed(code: string): boolean {
    return this.held.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressedThisStep.has(code);
  }

  endStep(): void {
    this.pressedThisStep.clear();
  }

  dispose(): void {
    this.target.removeEventListener("keydown", this.onKeyDown as EventListener);
    this.target.removeEventListener("keyup", this.onKeyUp as EventListener);
    this.target.removeEventListener("blur", this.onBlur);
  }
}

/** テストやリプレイ用。手で組み立てた入力を流し込む。 */
export class ScriptedInput implements InputSource {
  constructor(public inputs: PlayerInput[] = []) {}

  sample(playerIndex: number): PlayerInput {
    return (
      this.inputs[playerIndex] ?? {
        left: false,
        right: false,
        jumpHeld: false,
        jumpPressed: false,
      }
    );
  }

  endStep(): void {
    for (const i of this.inputs) i.jumpPressed = false;
  }

  isPressed(): boolean {
    return false;
  }

  wasPressed(): boolean {
    return false;
  }

  dispose(): void {}
}
