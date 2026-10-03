# Release Rehearsal

**新しいリリース。古いタブに、何を残す？**

2つの Vite manifest と保持方針から、旧ビルドの参照がどこで欠けるかをブラウザ内で説明する、小さなデプロイ検討ツールです。

> manifest の宣言にもとづくモデルです。実リクエスト、キャッシュ状態、障害の発生、保持期間、デプロイの安全性は判定しません。

## できること

- 旧 entry から `imports` / `dynamicImports` / `css` / `assets` をたどり、不足する JS・CSS・asset への決定的な最短経路を表示
- 新側のみ / 旧側をすべて保持 / 指定した旧パスを保持、の3方針を比較
- 影響候補の **dynamic entry モジュール** を表示。ルート一覧とは呼ばない
- 不足パスの保持チェックリストと JSON レポートを作成
- 完全なファイル inventory を任意追加。明記された byte 数だけを集計し、両側に SHA-256 があるときだけ同一パスの内容を比較
- 合成デモ3種、日本語のレスポンシブ UI、キーボード操作、Worker のキャンセルとタイムアウト

ブラウザに入力したファイルをサーバーへ送信しません。アプリは入力を保存せず、アカウント・解析 API・外部フォント・トラッカーを使いません。ブラウザ自身のフォーム復元や拡張機能までは制御しません。

## 起動

Node.js 22.12 以降（CI は 24）。表示するだけなら依存インストールは不要です。

```sh
npm start
# http://127.0.0.1:4173
```

`file://` では ES modules / Worker を動かせないため、同梱のローカル HTTP サーバーを使ってください。サーバーは loopback にだけ bind します。

1. 合成デモで挙動を確認するか、旧・新 `.vite/manifest.json` を読み込む
2. 任意で、それぞれの完全な inventory を追加する
3. 旧 manifest を変えたら「入力から entry を更新」し、旧 entry を選ぶ
4. 保持方針を選び、「参照をリハーサル」
5. 根拠と不明点を確認し、必要なら JSON をダウンロード

### Inventory の形式

```json
{"files":[{"path":"assets/main.js","bytes":123,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]}
```

上記の hash は形式説明用です。`bytes` と `sha256` は任意。ファイルパスは必須です。manifest が参照する全ファイルを含む一覧を要求し、部分 inventory は拒否します。余分な実ファイルを含めることはできます。

- inventory なし：可用性の根拠は manifest の宣言だけ
- inventory あり：その一覧を、申告されたファイル集合として使用
- 同一パスで hash 不一致：新側の内容が優先され、旧パスの保持だけでは解決しない
- 同一パスで hash 不足：**内容不明**。ファイル名や bytes 一致だけで内容を推定しない

入力は各 512 KiB。manifest は400項目、3,200参照、2,000固有ファイル。inventory は2,000ファイル。その他の制限は [設計](docs/DESIGN.md) を参照。

## 検証

```sh
npm ci --ignore-scripts --no-fund
npm test
npm run check
npm run fixture:verify
npm audit --audit-level=moderate
```

- 独立した fixed-point oracle と、循環・非連結を含む120個のグラフを比較
- 90個の保持方針比較、同一パスの hash・不明値・bytes・出力上限・悪意ある入力をテスト
- **公式 Vite 8.3.2 を固定**し、小さな old / new / unrelated ビルドを実際に生成
- 実 manifest と測定 inventory の再現性、loopback サーバーの実 HTTP 応答と SHA-256 を照合
- CI には、開いたままの旧タブで lazy import を押し、置換失敗・保持成功・無関係な変更の負の対照を確認する Playwright gate を用意

ブラウザ試験は通常の `npm test` に含めず、レビュー後の CI でだけ実行します。**現時点の実行結果と未実施項目は [VERIFICATION](docs/VERIFICATION.md) を参照してください。** browser gate が通るまでは完成済みの実証とは扱いません。

## 既存製品との差分と限界

[Vercel Skew Protection](https://vercel.com/docs/skew-protection) や [Netlify Skew Protection](https://docs.netlify.com/deploy/deploy-overview/#skew-protection) は、対応する環境でリクエストを適切なデプロイへ向ける実運用の仕組みです。

この作品は、ホスティング環境に依存しないローカルな説明・事前検討に絞っています。単なる変更ファイル一覧ではなく、選択 entry と依存関係から「なぜこの旧ファイルを検討するのか」を辿れます。一方、配信の保護を実装せず、CDN、Service Worker、API、認証、動的 URL、実行時に組み立てられる import はモデル外です。

需要、導入効果、独自性は未検証です。障害予防の実績・顧客獲得・新規発明を主張しません。[調査と仮説](docs/PRODUCT_RESEARCH.md) に、既存解決策と続行・中止条件を記録しています。

## 文書

- [設計・モデル契約](docs/DESIGN.md)
- [検証状況](docs/VERIFICATION.md)
- [公式ビルド fixture](fixtures/README.md)
- [セキュリティとプライバシー](docs/SECURITY.md)
- [面接で説明するための論点](docs/INTERVIEW.md)
- [AI assistance と出典](docs/AI_ASSISTANCE.md)

コード・テスト・文書は AI 支援で制作しました。自分で理解・再現できる部分を確認して説明することを前提にしています。ライセンスはこの作業で新規選択していません。第三者パッケージにはそれぞれのライセンスが適用されます。
