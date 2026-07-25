import { setupFullscreen } from "./engine/fullscreen";
import { setupShareButton } from "./engine/share";
import { CompositeInput, KeyboardInput } from "./engine/input";
import { GameLoop } from "./engine/loop";
import { Renderer2D } from "./engine/renderer2d";
import { TouchInput, isCoarsePointer, validateTouchButtons } from "./engine/touch";
import { Game } from "./game/game";
import { STAGES } from "./stages/index";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("#game キャンバスが見つかりません");

// data-btn の綴り間違いは起動時に落とす。黙って効かないボタンになる方が厄介。
validateTouchButtons(document.body);

// キーボードとタッチは常に両方生かす。端末判定は「画面上のボタンを出すか」
// にだけ使うので、判定を外しても操作不能にはならない
// （キーボード付きタブレット、2-in-1、デスクトップのタッチパネル）。
const touchMode = isCoarsePointer();
if (touchMode) {
  document.body.classList.add("touch-mode");
  setupFullscreen(document.querySelector<HTMLElement>("#stage-area"));
}

const input = new CompositeInput([
  new KeyboardInput(),
  new TouchInput(document.body),
]);

const renderer = new Renderer2D(canvas);
if (STAGES.length === 0) throw new Error("ステージが1つも登録されていません");

const game = new Game(input, STAGES, { touchMode });

// 全ステージ踏破中だけシェアボタンを出す。状態が変わったときだけ DOM を触る。
const syncShareButton = setupShareButton(() => game.isAllCleared);

const loop = new GameLoop({
  step: (dt) => game.step(dt),
  render: () => {
    game.render(renderer);
    syncShareButton();
  },
});

// ディスプレイをまたいだ移動や端末の回転に解像度を追従させる
window.addEventListener("resize", () => renderer.resize());
window.addEventListener("orientationchange", () => renderer.resize());

loop.start();
