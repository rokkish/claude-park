/**
 * 物理と操作感の定数。単位は px / 秒。
 *
 * ⚠ JUMP_VELOCITY と GRAVITY はステージ設計と直結している (SPEC §3.6, §7.5)。
 *   単独ジャンプ到達高 = JUMP_VELOCITY^2 / (2 * GRAVITY) = 62.5px ≒ 2.6 タイル
 *   頭に乗ってから     = TILE + 62.5 = 86.5px ≒ 3.6 タイル
 * 「3タイル(72px)の段差は単独では登れず、2人なら登れる」がステージ1の成立条件。
 * ここを変える場合は SPEC §7.5 の検算表も必ず更新すること。
 */

export const TILE = 24;

/** プレイヤーの当たり判定サイズ。高さはちょうど1タイル（頭に乗る計算を単純に保つため）。 */
export const PLAYER_W = 20;
export const PLAYER_H = 24;

export const GRAVITY = 2000;
export const MAX_FALL = 700;

export const RUN_SPEED = 160;
export const RUN_ACCEL = 1200;
export const GROUND_FRICTION = 1600;
export const AIR_FRICTION = 400;

export const JUMP_VELOCITY = 500;
/** ジャンプボタンを離したときに上昇速度に掛ける係数（可変ジャンプ）。 */
export const JUMP_CUT_MUL = 0.4;

/** 崖から落ちた直後でもジャンプを受け付ける猶予（秒）。 */
export const COYOTE_TIME = 0.08;
/** 着地する少し前のジャンプ入力を保持しておく時間（秒）。 */
export const JUMP_BUFFER = 0.1;

/** シミュレーションの固定タイムステップ。 */
export const DT = 1 / 60;
/** 1フレームで消化する実時間の上限（タブ復帰時のスパイラルを防ぐ）。 */
export const MAX_FRAME_TIME = 0.25;

/** 論理解像度 (SPEC §1.2)。 */
export const VIEW_W = 960;
export const VIEW_H = 432;

/** 着地時の潰れ量と、通常(1.0)へ戻る速さ。 */
export const SQUASH_ON_LAND = 0.7;
export const STRETCH_ON_JUMP = 1.25;
export const SQUASH_RECOVERY = 12;
