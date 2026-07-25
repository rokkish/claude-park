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
import { P1_PALETTE, P2_PALETTE, PALETTE, type PlayerPalette } from "../art/palette";
import { clawdSkin } from "../art/clawd";
import { drawTiles } from "../art/tiles";
import { characterStateOf } from "../art/skin";
import { Player } from "./player";
import { Inventory, SignalBus } from "./signals";
import { loadStage, type Stage } from "./stage";
import type { StageData } from "./stageData";
import { stageLabel } from "./stageSelect";
import type { GimmickContext } from "./gimmicks/types";
import { VIEW_H, VIEW_W } from "./tuning";
import { formatTime } from "../engine/time";
import { VERSION_LABEL } from "../version";
// 副作用 import: 全ギミックの registry 登録。loadStage より前に必ず評価される必要がある。
import "./gimmicks/index";

export type GamePhase = "title" | "playing" | "cleared";

/** 操作説明の1行ぶん。キーボードとタッチで表示は変わるが、対応は1箇所で持つ。 */
interface ControlRow {
  color: PlayerPalette;
  name: string;
  /** タッチ時、画面下のどちら側のパッドか。 */
  side: string;
  move: [string, string];
  jump: string;
}

/** 操作説明のキーキャップの一辺と間隔 (px)。 */
const CAP = 22;
const CAP_GAP = 5;

export class Game {
  /** ロード済みステージ。HUD と結合テストから参照する。 */
  private _stage: Stage;
  /** 生きているプレイヤー。配列は再代入せず中身だけ入れ替える。 */
  readonly players: Player[] = [];

  /** 全ステージの生データ。単一の StageData を渡した場合も長さ1の配列に正規化する。 */
  private readonly stages: readonly StageData[];
  /** `stages` 内の現在位置。クリア後の Enter で進み、末尾の次は先頭に戻る。 */
  private stageIndex = 0;

  private world: PhysicsWorld;
  private readonly signals = new SignalBus();
  private readonly inventory = new Inventory();
  private view: CameraView;
  private readonly ctx: GimmickContext;

  private _phase: GamePhase = "title";
  /** 描画アニメ用の経過秒。物理には使わない。 */
  private time = 0;

  /**
   * 計測時間。実時間ではなくシミュレーション時間を積む（SPEC §2.1 の固定
   * タイムステップ）。タブを裏に回してもフレーム落ちしても、実際に遊んだ
   * ぶんだけが進み、テストでも再現できる。"playing" の間だけ進行する。
   */
  private stageSeconds = 0;
  private runSeconds = 0;

  /** 画面上のタッチボタンで遊んでいるか。操作説明の文面だけを切り替える。 */
  private readonly touchMode: boolean;

  constructor(
    private readonly input: InputSource,
    stageData: StageData | StageData[],
    opts: { touchMode?: boolean; startIndex?: number } = {},
  ) {
    this.touchMode = opts.touchMode ?? false;
    this.stages = Array.isArray(stageData) ? stageData : [stageData];
    if (this.stages.length === 0) throw new Error("Game: ステージが1つも登録されていません");
    this._stage = loadStage(this.stages[0]!);
    this.world = { grid: this._stage.grid, solidBoxes: [], actors: [] };
    this.view = fitCamera(
      this._stage.grid.widthPx,
      this._stage.grid.heightPx,
      VIEW_W,
      VIEW_H,
    );
    this.ctx = {
      signals: this.signals,
      inventory: this.inventory,
      grid: this._stage.grid,
      players: this.players,
      requestClear: () => {
        this._phase = "cleared";
      },
    };
    this.resetStage();

    // 開始位置の指定。範囲外は黙って先頭に落とす（URL 由来の値が来るため）。
    const start = Math.trunc(opts.startIndex ?? 0);
    if (start > 0 && start < this.stages.length) this.switchToStage(start);
  }

  /** ロード済みステージ。HUD と結合テストから参照する。 */
  get stage(): Stage {
    return this._stage;
  }

  private resetStage(): void {
    // R でのやり直しもここを通る。ステージ計測だけ 0 に戻し、通し計測は
    // 戻さない（やり直したぶんは通しタイムに乗るのが素直）。
    this.stageSeconds = 0;
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

  /**
   * `stages` 内の指定インデックスへ切り替える。ステージごとに TileGrid
   * インスタンスが変わるので、それを参照している world / ctx / view も
   * ここで一緒に張り替えないと、古いステージの当たり判定のまま進んでしまう。
   */
  private switchToStage(index: number): void {
    this.stageIndex = index;
    this._stage = loadStage(this.stages[index]!);
    this.world = { grid: this._stage.grid, solidBoxes: [], actors: [] };
    this.ctx.grid = this._stage.grid;
    this.view = fitCamera(
      this._stage.grid.widthPx,
      this._stage.grid.heightPx,
      VIEW_W,
      VIEW_H,
    );
    this.resetStage();
  }

  /** クリア後、Enter で次のステージへ。最終ステージの次は先頭に戻る (要件: 進行はループ)。 */
  private advanceStage(): void {
    const next = (this.stageIndex + 1) % this.stages.length;
    // 先頭に戻る＝新しい通しの開始なので、通し計測をここで 0 に戻す。
    if (next === 0) this.runSeconds = 0;
    this.switchToStage(next);
    this._phase = "playing";
  }

  get phase(): GamePhase {
    return this._phase;
  }

  private get isLastStage(): boolean {
    return this.stageIndex === this.stages.length - 1;
  }

  /** 全ステージを踏破した直後か。シェアボタンの表示条件。 */
  get isAllCleared(): boolean {
    return this._phase === "cleared" && this.isLastStage;
  }

  /** 現在のステージの経過秒。R でやり直すと 0 に戻る。 */
  get stageSecondsElapsed(): number {
    return this.stageSeconds;
  }

  /** 通し（先頭ステージから）の経過秒。R では戻さない。 */
  get runSecondsElapsed(): number {
    return this.runSeconds;
  }

  get stageCount(): number {
    return this.stages.length;
  }

  /** タイトルを飛ばして開始する。Enter 押下と結合テストの入口。 */
  start(): void {
    this._phase = "playing";
    this.runSeconds = 0;
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
        this.stageSeconds += dt;
        this.runSeconds += dt;
        this.simulate(dt);
        break;
      case "cleared":
        // クリア後も落下だけは進めて、絵が止まって見えないようにする
        this.simulate(dt);
        // タイトルには戻さず、そのまま次のステージへ (SPEC §8.2 のステージ追加を
        // 実際に遊べる形にするための進行)。タッチ環境では #stage-area が
        // タップで Enter を送るので、この分岐だけで両対応になる。
        if (this.input.wasPressed("Enter")) this.advanceStage();
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
      r.text("CLAUDE PARK", VIEW_W / 2, 130, {
        color: PALETTE.accent,
        size: 44,
        align: "center",
      });
      r.text("2人で協力しないとクリアできません", VIEW_W / 2, 164, {
        color: PALETTE.textPrimary,
        size: 16,
        align: "center",
      });
      const bottom = this.drawControlBlock(r, 200);
      const startHint = this.touchMode ? "画面をタップでスタート" : "Enter でスタート";
      r.text(startHint, VIEW_W / 2, bottom + 34, {
        color: PALETTE.textPrimary,
        size: 18,
        align: "center",
      });
      return;
    }

    // 左上は外部リンクのボタンが被りうるので上部中央に置く
    // （リンクは画面座標、こちらは canvas 座標なので、狭い窓では重なる）。
    // Pico Park 風に「ワールド-ステージ」を前置する。ワールドは今は1つしか
    // 無いので固定値。第2ワールドができたら StageData に world フィールドを
    // 足し、stages/index.ts の並び順ではなくそこから持ってくるようにする。
    r.text(`${stageLabel(this.stages, this.stageIndex)}  ${this.stage.data.name}`, VIEW_W / 2, 30, {
      color: PALETTE.textDim,
      size: 14,
      align: "center",
    });

    // 計測を常時見せる。ミリ秒まで出すなら、クリア時だけでなく走っている
    // 最中に見えないと意味がない。等幅にはできないので中央寄せで暴れを抑える。
    r.text(formatTime(this.stageSeconds), VIEW_W / 2, 52, {
      color: PALETTE.textDim,
      size: 13,
      align: "center",
    });

    this.renderControls(r);

    if (this._phase === "cleared") {
      r.setAlpha(0.55);
      // 以下はクリア演出。操作説明の上に重ねる。
      r.rect(0, 0, VIEW_W, VIEW_H, "#000000");
      r.setAlpha(1);
      // 最終ステージだけは「一周した」ことを示す文言にする。Enter (タッチは
      // タップ) は次に進んでも最後は同じキーで先頭ステージに戻るだけなので、
      // 案内文もそれに合わせて変える。
      r.text(this.isLastStage ? "ALL STAGES CLEAR" : "STAGE CLEAR", VIEW_W / 2, VIEW_H / 2 - 20, {
        color: PALETTE.accent,
        size: 40,
        align: "center",
      });

      // 最終ステージでは通しタイム、途中ではそのステージのタイムを出す。
      const label = this.isLastStage ? "TOTAL" : "TIME";
      const seconds = this.isLastStage ? this.runSeconds : this.stageSeconds;
      r.text(`${label}  ${formatTime(seconds)}`, VIEW_W / 2, VIEW_H / 2 + 22, {
        color: PALETTE.textPrimary,
        size: 24,
        align: "center",
      });

      const nextHint = this.touchMode ? "画面をタップで次のステージ" : "Enter で次のステージ";
      const wrapHint = this.touchMode
        ? "画面をタップで最初のステージへ"
        : "Enter で最初のステージへ";
      r.text(this.isLastStage ? wrapHint : nextHint, VIEW_W / 2, VIEW_H / 2 + 58, {
        color: PALETTE.textDim,
        size: 15,
        align: "center",
      });
    }
  }

  /**
   * 操作説明。ステージ1は下5行しか使っていないので、
   * 空いている上部空間をそのまま説明の置き場にする。
   *
   * キーの隣にミニ Clawd を実物と同じ描画コードで並べるので、
   * 「どちらの色がどのキーか」の対応が実機と食い違うことがない。
   */
  private renderControls(r: Renderer): void {
    // 見出しにアクセント色は使わない。アクセントは鍵と解錠済みゴールの
    // 「触れるもの」専用に取っておき、背景の文字と混同させないため。
    r.text("CLAUDE PARK", VIEW_W / 2, 120, {
      color: PALETTE.textDim,
      size: 20,
      align: "center",
    });
    this.drawControlBlock(r, 148);
  }

  /**
   * 操作説明の本体。タイトル画面とゲーム中で共用する。
   * キー一覧を2箇所に書くと必ず片方が古くなるので、必ずここを通す。
   * @returns 描画後の下端 y
   */
  private drawControlBlock(r: Renderer, top: number): number {
    const rows: ControlRow[] = [
      { color: P1_PALETTE, name: "P1", side: "左", move: ["A", "D"], jump: "W" },
      { color: P2_PALETTE, name: "P2", side: "右", move: ["←", "→"], jump: "↑" },
    ];

    // ラベルの描画幅まで含めた実測の総幅。キーキャップやアイコンだけを基準に
    // 中央寄せすると、右に伸びるラベルのぶん左に寄って見える。
    // タッチ時は文言が長くなるので幅が変わる。
    const blockW = this.touchMode ? 195 : 215;
    const x0 = Math.round(VIEW_W / 2 - blockW / 2);
    let y = top;

    for (const row of rows) {
      this.drawControlRow(r, x0, y, row);
      y += 34;
    }

    r.text(this.touchMode ? "右上の R でやり直し" : "R  やり直し", VIEW_W / 2, y + 8, {
      color: PALETTE.textDim,
      size: 13,
      align: "center",
    });

    // 非公式ファン作品である旨は、README だけでなく画面上にも常時出す。
    // 一般公開する以上、リンクを踏まずに開いた人にも伝わる必要がある。
    r.setAlpha(0.55);
    r.text(
      "非公式のファン作品です / Unofficial fan project, not affiliated with Anthropic",
      VIEW_W / 2,
      y + 32,
      { color: PALETTE.textDim, size: 11, align: "center" },
    );

    // バージョンは短縮 SHA 付き。どのビルドが動いているかを特定できないと
    // 「直したはずの不具合」の報告を突き合わせられない。
    r.setAlpha(0.4);
    r.text(VERSION_LABEL, VIEW_W / 2, y + 48, {
      color: PALETTE.textDim,
      size: 10,
      align: "center",
    });
    r.setAlpha(1);

    return y + 60;
  }

  private drawControlRow(r: Renderer, x: number, y: number, row: ControlRow): void {
    // 実物と同じ ClawdSkin を使う。専用アイコンを別に描くと、
    // キャラの見た目を変えたときに説明だけ古いまま取り残される。
    clawdSkin.draw(r, {
      x: x + 3,
      y: y + 2,
      w: 15,
      h: 18,
      facing: 1,
      vx: 0,
      vy: 0,
      grounded: true,
      squash: 1,
      carrying: false,
      color: row.color,
      time: 0,
    });

    const label = (s: string, lx: number): void => {
      r.text(s, lx, y + CAP / 2, {
        color: PALETTE.textDim,
        size: 13,
        baseline: "middle",
      });
    };

    // タッチ操作のときにキーキャップを出すと嘘になる。
    // 実際のボタンは DOM 側にあるので、どちらのパッドが自分かだけを伝える。
    if (this.touchMode) {
      label(`${row.name}  画面下 ${row.side}側のボタン`, x + 36);
      return;
    }

    let cx = x + 36;
    cx = this.drawKeyCap(r, cx, y, row.move[0]);
    cx = this.drawKeyCap(r, cx, y, row.move[1]);
    label("移動", cx + 2);
    cx += 44;
    cx = this.drawKeyCap(r, cx, y, row.jump);
    label("ジャンプ", cx + 2);
  }

  /** キーキャップを1つ描き、次のキャップの x を返す。 */
  private drawKeyCap(r: Renderer, x: number, y: number, key: string): number {
    r.roundRect(x, y, CAP, CAP, 4, PALETTE.tileTop);
    r.text(key, x + CAP / 2, y + CAP / 2 + 1, {
      color: PALETTE.textPrimary,
      size: 13,
      align: "center",
      baseline: "middle",
    });
    return x + CAP + CAP_GAP;
  }
}
