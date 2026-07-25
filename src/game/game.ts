import { applyCamera, fitCamera, type CameraView } from "../engine/camera";
import type { InputSource } from "../engine/input";
import {
  isCrushed,
  isOnGround,
  isRiding,
  moveX,
  moveY,
  sortBottomUp,
  type PhysicsWorld,
} from "../engine/physics";
import type { Renderer } from "../engine/renderer";
import { overlaps } from "../engine/aabb";
import { PALETTE } from "../art/palette";
import { clawdSkin } from "../art/clawd";
import { drawTiles } from "../art/tiles";
import { characterStateOf } from "../art/skin";
import { Player } from "./player";
import { Inventory, SignalBus } from "./signals";
import { loadStage, type Stage } from "./stage";
import type { StageData } from "./stageData";
import type { GimmickContext } from "./gimmicks/types";
import { VIEW_H, VIEW_W } from "./tuning";
// 副作用 import: 全ギミックの registry 登録。loadStage より前に必ず評価される必要がある。
import "./gimmicks/index";

export type GamePhase = "title" | "playing" | "cleared";

export class Game {
  /** ロード済みステージ。HUD と結合テストから参照する。 */
  readonly stage: Stage;
  /** 生きているプレイヤー。配列は再代入せず中身だけ入れ替える。 */
  readonly players: Player[] = [];

  private world: PhysicsWorld;
  private readonly signals = new SignalBus();
  private readonly inventory = new Inventory();
  private readonly view: CameraView;
  private readonly ctx: GimmickContext;

  private _phase: GamePhase = "title";
  /** 描画アニメ用の経過秒。物理には使わない。 */
  private time = 0;

  constructor(
    private readonly input: InputSource,
    stageData: StageData,
  ) {
    this.stage = loadStage(stageData);
    this.world = { grid: this.stage.grid, solidBoxes: [], actors: [] };
    this.view = fitCamera(
      this.stage.grid.widthPx,
      this.stage.grid.heightPx,
      VIEW_W,
      VIEW_H,
    );
    this.ctx = {
      signals: this.signals,
      inventory: this.inventory,
      grid: this.stage.grid,
      players: this.players,
      requestClear: () => {
        this._phase = "cleared";
      },
    };
    this.resetStage();
  }

  private resetStage(): void {
    this.stage.reset();
    this.inventory.clear();
    this.signals.clearFrame();

    this.players.length = 0;
    this.stage.spawnsPx.forEach((s, i) => {
      this.players.push(new Player(i, s.x, s.y));
    });
    this.world.actors.length = 0;
    this.world.actors.push(...this.players);
    this.world.solidBoxes = this.stage.solidBoxes();
  }

  get phase(): GamePhase {
    return this._phase;
  }

  /** タイトルを飛ばして開始する。Enter 押下と結合テストの入口。 */
  start(): void {
    this._phase = "playing";
  }

  step(dt: number): void {
    this.time += dt;

    if (this.input.wasPressed("KeyR")) {
      this.resetStage();
      if (this._phase === "cleared") this._phase = "playing";
    }

    switch (this.phase) {
      case "title":
        if (this.input.wasPressed("Enter")) this.start();
        break;
      case "playing":
        this.simulate(dt);
        break;
      case "cleared":
        // クリア後も落下だけは進めて、絵が止まって見えないようにする
        this.simulate(dt);
        break;
    }

    this.input.endStep();
  }

  /** SPEC §5.3 の更新順序。ここの順番を崩すと1フレーム遅延バグの温床になる。 */
  private simulate(dt: number): void {
    // 1-3. 入力サンプリングと速度更新（移動はまだしない）
    for (const p of this.players) {
      p.updateVelocity(dt, this.input.sample(p.index));
    }

    // 4. ギミック更新。Solid の開閉・移動はここで確定する。
    for (const g of this.stage.gimmicks) g.update(dt, this.ctx);
    // 開閉が反映された後の Solid 集合を物理に渡す。
    this.world.solidBoxes = this.stage.solidBoxes();

    // 5. 移動。土台から順に解決すれば、塔になっていても破綻しない (SPEC §3.4)。
    for (const actor of sortBottomUp(this.world)) {
      moveX(this.world, actor, actor.vx * dt);
      moveY(this.world, actor, actor.vy * dt);
    }

    for (const p of this.players) {
      p.postMove(dt, isOnGround(this.world, p));
      // 頭に誰か乗っているか。表情に反映される (SPEC §6.2)。
      p.carrying = this.players.some((o) => o !== p && isRiding(o, p));
      // 閉じたゲートと壁に挟まれたら、その1人だけスポーンに戻す (SPEC §3.5)。
      if (isCrushed(this.world, p)) p.respawn();
    }

    // 6. シグナルの白紙化は「重なり通知の直前」でなければならない。
    //    ステップ先頭に置くと、前ステップの手順7で発信側が立てた値を
    //    受信側（手順4のギミック更新）が読む前に消してしまい、
    //    感圧板の信号がゲートに一度も届かなくなる。
    this.signals.clearFrame();

    // 7. 重なり通知。感圧板がシグナルを立てるのはここ。
    for (const g of this.stage.gimmicks) {
      if (!g.onOverlap) continue;
      for (const p of this.players) {
        if (overlaps(p.box, g.aabb)) g.onOverlap(p, this.ctx);
      }
    }
    // 受信側（ゲート）は次ステップの手順4でこのシグナルを読む。
    // 板を踏んでから扉が通れるようになるまで 1 フレーム(16ms)の遅れが出るが、
    // 知覚できない差であり、扉が開いた瞬間に押し出されて挟まる事故が起きない
    // 利点の方が大きい。
  }

  render(r: Renderer): void {
    r.clear(PALETTE.letterbox);

    r.save();
    applyCamera(r.ctx, this.view);

    r.rect(0, 0, this.stage.grid.widthPx, this.stage.grid.heightPx, PALETTE.background);
    drawTiles(r, this.stage.grid);
    for (const g of this.stage.gimmicks) g.draw(r);
    for (const p of this.players) clawdSkin.draw(r, characterStateOf(p, this.time));

    r.restore();

    this.renderHud(r);
  }

  private renderHud(r: Renderer): void {
    if (this._phase === "title") {
      r.setAlpha(0.82);
      r.rect(0, 0, VIEW_W, VIEW_H, "#000000");
      r.setAlpha(1);
      r.text("CLAUDE PARK", VIEW_W / 2, VIEW_H / 2 - 40, {
        color: PALETTE.accent,
        size: 44,
        align: "center",
      });
      r.text("2人で協力しないとクリアできません", VIEW_W / 2, VIEW_H / 2 + 2, {
        color: PALETTE.textPrimary,
        size: 16,
        align: "center",
      });
      r.text("P1: A / D / W    P2: ← / → / ↑    R: やり直し", VIEW_W / 2, VIEW_H / 2 + 32, {
        color: PALETTE.textDim,
        size: 14,
        align: "center",
      });
      r.text("Enter でスタート", VIEW_W / 2, VIEW_H / 2 + 70, {
        color: PALETTE.textPrimary,
        size: 18,
        align: "center",
      });
      return;
    }

    r.text(this.stage.data.name, 14, 26, {
      color: PALETTE.textDim,
      size: 14,
    });

    if (this._phase === "cleared") {
      r.setAlpha(0.55);
      r.rect(0, 0, VIEW_W, VIEW_H, "#000000");
      r.setAlpha(1);
      r.text("STAGE CLEAR", VIEW_W / 2, VIEW_H / 2 - 6, {
        color: PALETTE.accent,
        size: 40,
        align: "center",
      });
      r.text("R でもう一度", VIEW_W / 2, VIEW_H / 2 + 30, {
        color: PALETTE.textPrimary,
        size: 16,
        align: "center",
      });
    }
  }
}
