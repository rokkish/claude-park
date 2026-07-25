import type { Gimmick, GimmickDef, GimmickParams, SpawnContext } from "./types";

const defs = new Map<string, GimmickDef<never>>();

export function registerGimmick<P extends GimmickParams>(def: GimmickDef<P>): void {
  if (defs.has(def.type)) {
    throw new Error(`ギミック type "${def.type}" が二重登録されています`);
  }
  defs.set(def.type, def as unknown as GimmickDef<never>);
}

export function createGimmick(params: GimmickParams, ctx: SpawnContext): Gimmick {
  const def = defs.get(params.type);
  if (!def) {
    const known = [...defs.keys()].sort().join(", ") || "(なし)";
    // ロード時に落とす。プレイ中に静かに消えるより開発時に気付ける方がよい。
    throw new Error(`未登録のギミック type: "${params.type}" / 登録済み: ${known}`);
  }
  return (def as unknown as GimmickDef<GimmickParams>).create(params, ctx);
}

export function registeredTypes(): string[] {
  return [...defs.keys()].sort();
}
