# Claude Park

Pico Park 風の、ブラウザで動くローカル協力アクションパズル。
**1台のキーボードを2人で共有して遊びます。**

> **非公式のファン作品です。**
> Anthropic とは一切関係がなく、同社に承認・後援されたものでもありません。
> キャラクターは Claude Code のマスコット "Clawd" を作画リファレンスにした
> 個人の非営利ファン作品です。関連する名称・意匠の権利は Anthropic に帰属します。
>
> *This is an unofficial, non-commercial fan project. Not affiliated with,
> endorsed by, or sponsored by Anthropic.*

## 遊び方

**2人用です。** 1台の端末を2人で共有して遊びます。

### PC

|  | 移動 | ジャンプ |
| --- | --- | --- |
| P1 | `A` / `D` | `W` または `Space` |
| P2 | `←` / `→` | `↑` |

`R` でステージをやり直し、`Enter` でスタート。

### スマートフォン・タブレット

画面下のボタンで操作します。左側が P1、右側が P2 で、ボタンの色がキャラの色と対応しています。
**横向きを推奨**します（ステージが横長のため、縦向きだとゲーム画面がかなり小さくなります）。

URL バーを消したい場合:

- **Android / PC**: 右上の ⛶ ボタン、またはゲーム画面を最初にタップした時点で全画面になります。
- **iPhone**: Safari が Fullscreen API に対応していないため、共有メニューから
  **「ホーム画面に追加」**してください。PWA として起動すると URL バーなしの全画面になります。

ステージ1は**単独では絶対にクリアできない**設計です。単独ジャンプの到達高は約2.6タイルで、
道を塞ぐ3タイルの段差には届きません。相手の頭に乗ってから跳べば約3.6タイル届きます。
片方が感圧板を踏み続けている間だけ、もう片方が地上のゲートを通れます。

## 開発

```bash
npm install
npm run dev        # http://localhost:5173/
npm test           # 物理とステージ成立性のテスト
npm run build      # 型検査 + 本番ビルド
```

### 見た目の確認

ヘッドレスブラウザが使えない環境向けに、実際の描画コードを走らせて PNG に焼くツールがあります。

```bash
npx vite-node scripts/preview-clawd.ts out.png              # キャラの各ポーズ
npx vite-node scripts/preview-stage.ts out.png boost        # start|boost|open|clear
```

## 設計

詳細は [docs/SPEC.md](docs/SPEC.md) を参照してください。要点だけ挙げると:

- **ギミック間はシグナルバスで疎結合。** 感圧板は `sw1` に書くだけ、ゲートは `sw1` を読むだけで
  互いを知らないため、スイッチや受信ギミックを足しても組み合わせが爆発しません。
- **ギミック追加は新規ファイル1つ + 登録1行。** エンジンにも他ギミックにも触りません。
- **ステージ追加は JSON 1つ。** 既存ギミックの組み合わせだけなら、コードは1行も書きません。
- **物理は Actor/Solid 分離。** プレイヤーは Actor であり、同時に他プレイヤーにとっては
  Solid（頭に乗れる）でもあります。

`src/game/tuning.ts` の `JUMP_VELOCITY` と `GRAVITY` はステージ設計と直結しています。
変更する場合は SPEC §7.5 の検算表と `tests/stage01.test.ts` を必ず併せて更新してください。

## ライセンス

コードは MIT ライセンスです（[LICENSE](LICENSE)）。
ただしキャラクターの意匠および "Claude" / "Clawd" に関連する名称は
このライセンスの対象外で、Anthropic に帰属します。
