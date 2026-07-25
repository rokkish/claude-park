/**
 * ギミック間を疎結合にするための名前付きチャンネル (SPEC §4)。
 *
 * 発信側（感圧板・レバー）は set するだけ、受信側（ゲート・リフト）は読むだけで、
 * 互いの存在を知らない。これによりスイッチと受信ギミックの組み合わせ爆発を防ぐ。
 *
 * 毎ステップ先頭で clearFrame() され、発信側は「押されている間ずっと」書き続ける。
 * 保持したい場合は受信側の latch オプションで表現する。
 */
export class SignalBus {
  private channels = new Map<string, number>();

  set(name: string, value: number | boolean): void {
    this.channels.set(name, typeof value === "boolean" ? (value ? 1 : 0) : value);
  }

  /** 未定義チャンネルは 0（＝OFF）。存在しない名前を読んでもエラーにしない。 */
  get(name: string): number {
    return this.channels.get(name) ?? 0;
  }

  isOn(name: string): boolean {
    return this.get(name) !== 0;
  }

  clearFrame(): void {
    this.channels.clear();
  }
}

/** 受信側が複数チャンネルをまとめる方法 (SPEC §4)。式パーサを持たずに済ませるための3択。 */
export type SignalMode = "all" | "any" | "none";

export function evaluateSignals(
  bus: SignalBus,
  names: readonly string[],
  mode: SignalMode = "all",
): boolean {
  // 監視対象が無い場合、all/none は真空真、any は偽。
  if (names.length === 0) return mode !== "any";
  switch (mode) {
    case "all":
      return names.every((n) => bus.isOn(n));
    case "any":
      return names.some((n) => bus.isOn(n));
    case "none":
      return !names.some((n) => bus.isOn(n));
  }
}

/** ステージ内で共有される収集物（鍵など）。リセットで空に戻る。 */
export class Inventory {
  private items = new Set<string>();

  add(id: string): void {
    this.items.add(id);
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  hasAll(ids: readonly string[]): boolean {
    return ids.every((id) => this.items.has(id));
  }

  clear(): void {
    this.items.clear();
  }
}
