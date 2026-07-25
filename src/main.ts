import { KeyboardInput } from "./engine/input";
import { GameLoop } from "./engine/loop";
import { Renderer2D } from "./engine/renderer2d";
import { Game } from "./game/game";
import { STAGES } from "./stages/index";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("#game キャンバスが見つかりません");

const renderer = new Renderer2D(canvas);
const input = new KeyboardInput();
const stage = STAGES[0];
if (!stage) throw new Error("ステージが1つも登録されていません");

const game = new Game(input, stage);

const loop = new GameLoop({
  step: (dt) => game.step(dt),
  render: () => game.render(renderer),
});

// ディスプレイをまたいで移動した場合などに解像度を追従させる
window.addEventListener("resize", () => renderer.resize());

loop.start();
