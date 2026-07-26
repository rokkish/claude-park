import { setupFullscreen } from "./engine/fullscreen";
import { applyLayout, computeLayout, currentViewport } from "./engine/layout";
import { setupShareButton } from "./engine/share";
import { formatTime } from "./engine/time";
import { CompositeInput, KeyboardInput } from "./engine/input";
import { GameLoop } from "./engine/loop";
import { Renderer2D } from "./engine/renderer2d";
import { TouchInput, isCoarsePointer, validateTouchButtons } from "./engine/touch";
import { Game } from "./game/game";
import { STAGES } from "./stages/index";
import { findStageIndex } from "./game/stageSelect";

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

// ?stage=1-2 や ?stage=stage-02 で任意のステージから始められる。
// 動作確認用で、既知のステージに一致しない値は黙って先頭に落とす。
// 指定があった場合だけ選択画面を飛ばす。動作確認で毎回選ばされないため。
const requested = findStageIndex(STAGES, new URLSearchParams(location.search).get("stage"));

const game = new Game(input, STAGES, {
  touchMode,
  startIndex: requested ?? 0,
  skipSelect: requested !== null,
});

// 全ステージ踏破中だけシェアボタンを出す。状態が変わったときだけ DOM を触る。
const syncShareButton = setupShareButton(
  () => game.isAllCleared,
  () => ({
    timeText: formatTime(game.runSecondsElapsed),
    stageCount: game.stageCount,
  }),
);

const loop = new GameLoop({
  step: (dt) => game.step(dt),
  render: () => {
    game.render(renderer);
    syncShareButton();
  },
});

/**
 * 画面寸法を計算し直して CSS に反映する。式は layout.ts が唯一持ち、
 * CSS はその結果を使うだけ。ここを通さないと寸法が既定値のままになる。
 */
function syncLayout(): void {
  applyLayout(
    computeLayout(currentViewport(), touchMode),
    document.documentElement,
    document.body,
  );
}

syncLayout();

// ディスプレイをまたいだ移動や端末の回転に、解像度とレイアウトを追従させる
const onViewportChange = (): void => {
  renderer.resize();
  syncLayout();
};
window.addEventListener("resize", onViewportChange);
window.addEventListener("orientationchange", onViewportChange);
// iOS ではアドレスバーの伸縮が resize を伴わないことがある
window.visualViewport?.addEventListener("resize", onViewportChange);

loop.start();
