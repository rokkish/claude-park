import { gateDef } from "./gate";
import { goalDef } from "./goal";
import { keyDef } from "./key";
import { plateDef } from "./plate";
import { registerGimmick } from "./registry";
import type { GimmickDef, GimmickParams } from "./types";

// 全ギミックの登録を集約するモジュール (SPEC §1.1, §5.2)。
// 副作用（registerGimmick 呼び出し）のためだけに import される想定なので、
// 何もエクスポートしない。何度 import されても registerGimmick は
// モジュールキャッシュにより一度しか実行されないので安全。
//
// ギミックを追加する場合は、この配列に1行足すだけでよい (SPEC §8.1)。
const allDefs: GimmickDef<GimmickParams>[] = [plateDef, gateDef, keyDef, goalDef];
allDefs.forEach((def) => registerGimmick(def));
