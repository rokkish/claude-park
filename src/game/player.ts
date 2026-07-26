import { Actor } from "../engine/physics";
import type { PlayerInput } from "../engine/input";
import type { PlayerState } from "./entities";
import {
  AIR_FRICTION,
  COYOTE_TIME,
  GRAVITY,
  GROUND_FRICTION,
  JUMP_BUFFER,
  JUMP_CUT_MUL,
  JUMP_VELOCITY,
  MAX_FALL,
  PLAYER_H,
  PLAYER_W,
  RUN_ACCEL,
  RUN_SPEED,
  SQUASH_ON_LAND,
  SQUASH_RECOVERY,
  STRETCH_ON_JUMP,
} from "./tuning";

/**
 * Clawd プレイヤー。Actor（環境に押される）であり、
 * 他プレイヤーにとっては Solid（頭に乗れる）でもある。
 *
 * ここでは速度だけを更新する。実際の移動と衝突解決は
 * SPEC §5.3 の順序に従って game.ts が moveX/moveY を呼んで行う。
 */
export class Player extends Actor implements PlayerState {
  readonly index: number;
  /** 鍵のように「人でないと拾えない」ものが見る。 */
  readonly isPlayer = true as const;
  facing: 1 | -1 = 1;
  squash = 1;
  carrying = false;

  private spawnX: number;
  private spawnY: number;
  private coyote = 0;
  private jumpBufferTimer = 0;
  private wasGrounded = false;

  constructor(index: number, x: number, y: number) {
    super(x, y, PLAYER_W, PLAYER_H);
    this.index = index;
    this.spawnX = Math.round(x);
    this.spawnY = Math.round(y);
  }

  setSpawn(x: number, y: number): void {
    this.spawnX = Math.round(x);
    this.spawnY = Math.round(y);
  }

  respawn(): void {
    this.teleport(this.spawnX, this.spawnY);
    this.squash = 1;
    this.carrying = false;
    this.coyote = 0;
    this.jumpBufferTimer = 0;
    this.wasGrounded = false;
  }

  /** SPEC §5.3 手順3。移動はまだ行わない。 */
  updateVelocity(dt: number, input: PlayerInput): void {
    // --- 横 ---
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0) {
      this.facing = dir > 0 ? 1 : -1;
      this.vx = approach(this.vx, dir * RUN_SPEED, RUN_ACCEL * dt);
    } else {
      const friction = this.grounded ? GROUND_FRICTION : AIR_FRICTION;
      this.vx = approach(this.vx, 0, friction * dt);
    }

    // --- ジャンプ猶予 ---
    this.coyote = this.grounded ? COYOTE_TIME : Math.max(0, this.coyote - dt);
    this.jumpBufferTimer = input.jumpPressed
      ? JUMP_BUFFER
      : Math.max(0, this.jumpBufferTimer - dt);

    if (this.jumpBufferTimer > 0 && this.coyote > 0) {
      this.vy = -JUMP_VELOCITY;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBufferTimer = 0;
      this.squash = STRETCH_ON_JUMP;
    }

    // ボタンを離したら上昇を減衰させる＝可変ジャンプ
    if (!input.jumpHeld && this.vy < 0) {
      this.vy *= JUMP_CUT_MUL;
    }

    // --- 縦 ---
    this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL);
  }

  /** SPEC §5.3 手順5の後。接地の立ち上がりで潰す。 */
  postMove(dt: number, grounded: boolean): void {
    if (grounded && !this.wasGrounded) {
      this.squash = SQUASH_ON_LAND;
    }
    this.wasGrounded = grounded;
    this.grounded = grounded;
    // 指数回復で 1.0 に戻す
    this.squash += (1 - this.squash) * Math.min(1, SQUASH_RECOVERY * dt);
  }
}

/** current から target へ、最大 maxDelta だけ近づける。 */
function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}
