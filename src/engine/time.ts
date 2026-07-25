/**
 * 計測時間の表示。
 *
 * 時間はシミュレーション時間（固定タイムステップの積算）で測る。
 * performance.now() だと、タブを裏に回したりフレーム落ちしたときに
 * 実際に遊んだ時間とずれるうえ、テストで再現できない。
 */

/** 秒を HH:MM:SS.mmm に整形する。 */
export function formatTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const s = Math.floor(totalMs / 1000) % 60;
  const m = Math.floor(totalMs / 60_000) % 60;
  const h = Math.floor(totalMs / 3_600_000);
  const pad = (n: number, width = 2): string => String(n).padStart(width, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}
