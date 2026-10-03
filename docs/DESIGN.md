# モデル契約と設計

## 入出力

Product はブラウザの ES modules + Web Worker。入力は JSON のみで、HTML / JS / URLs を実行・取得しない。Node と Vite は同梱された固定 fixture のビルド・試験にだけ利用する。

`parseManifest(text)` → Map。Vite の `file`, `src`, `name`, `names`, `isEntry`, `isDynamicEntry`, `imports`, `dynamicImports`, `css`, `assets` を型検査。未知 field と未解決 chunk 参照を拒否。空の新 manifest は全置換消失の説明に使用できる。旧側は選択可能な `isEntry:true` が必要。

`parseInventory(text)` → Map。`{files:[{path,bytes?,sha256?}]}`。SHA-256 は小文字16進64文字、bytes は0〜10^12の整数。元データの測定・真正性はこのアプリでは確認しない。

`traceManifest(map,entry)` は検証済み Map 専用の内部 API。`rehearse(...)` は検証済み両 manifest / optional inventory / entry / policy / retained を受け取る。ブラウザ公開境界は常に strict parser を通る。Map を直接渡すコードは、その検証済み契約に従う必要がある。

## 可用性の根拠

Inventory がある側では、manifest が宣言する全 file / css / asset が一覧内にあることを要求する。完全性を実ディレクトリと照合する機能ではなく、不完全な入力を黙って補完しないための契約。Inventory なしでは manifest 由来の集合に限定する。両者の出所はレポート内で明示。

新集合を N、旧集合を O、指定保持を S とすると、配信可能と申告された集合は以下。

- replacement: N
- retain-all: N ∪ O
- retain-subset: N ∪ (O ∩ S)

同一パス衝突では新側優先。旧から到達する各パスを次に分類。

- `missing`: 選択方針の集合にない
- `retained`: 新側になく、旧側を保持する宣言
- `same-content`: 新側に同じパスがあり、申告された両 SHA-256 が一致
- `changed-content`: 新側に同じパスがあり、両 SHA-256 が不一致
- `unknown-content`: 新側に同じパスがあるが、いずれかの SHA-256 がない

SHA-256 は入力の信用に依存する。`retained` も実サーバーにその bytes が存在する証明ではない。`retained` 配列は retain-subset にのみ影響し、他の方針で残っている UI の値は無視する。

## グラフと証拠

選択旧 entry を始点に BFS。chunk 間の imports / dynamicImports を辿り、各 chunk から file / css / assets の端点へ到達する。辺種順序と相対パスの Unicode code-point 比較を固定し、挿入順による揺れを排除。循環は visited で停止し、非連結成分は除外。最短とは宣言辺数であり、実時間・ネットワーク順序ではない。

Reachable な `isDynamicEntry:true` または `dynamicImports` の対象を dynamic entry 候補として扱う。その先の不足・内容懸念をまとめる。アプリの routing 情報は含まれない。動的 import が実行されるか、何度呼ばれるか、既に読み込まれたかは不明。

保持チェックリストは到達可能な不足パスの集合。これはモデル上の説明用集合であり、実配信で最適・最小な容量、必要十分な対策とは主張しない。同一パス衝突、API、HTML更新、CDN、Service Worker の調整は別途必要。

## 上限と中断

- 1入力の UTF-8: 524,288 bytes
- JSON nesting: 8
- manifest chunk: 400
- manifest edge + file reference: 3,200
- manifest の固有 file reference: 2,000
- field array: 512
- inventory: 2,000 files
- パス: 240 ASCII文字。保守的な allowlist。絶対パス、URL、`?`, `#`, `%`, backslash、dot segment、空 segment、予約キーを拒否
- JSON duplicate key、`__proto__` / `prototype` / `constructor` key は拒否
- 証拠経路: 先頭80懸念ファイル、各24項目以内。長い経路は省略位置と数を示す
- dynamic entry ごとのパス例: 各カテゴリ8件。完全な件数と省略フラグを別途持つ
- 画面詳細: 各80件。JSON はファイル分類・不足一覧を保持
- JSON出力: 8 MiBまで。Workerは8秒で終了可能

Graph counts は入力宣言を数えた値。実リクエスト数や実ファイル総数ではない。実 inventory の listedFiles と bytes は、提供された inventory からだけ生成。bytes 欠落時は部分和と不明件数を区別。

## UI 状態と入力境界

入力変更で旧 report を無効化し、実行中 Worker を終了する。sequence ID で遅延結果を破棄。成功・タイムアウト・エラー・pagehide を含む終了で token を退役させ、既にキューに積まれた response も受け付けない。pagehide は完成済み report を破棄しない。ファイル読み込みは field ごとに epoch を持ち、古い読み取りが新しい手入力を上書きしない。成功した現在のファイル読込完了時も report を無効化する。

入力由来の文字列は `textContent` / text node で描画し、HTMLとして差し込まない。レポート保存はローカル Blob。外部リンクは固定の Vite 文書だけで、利用者がクリックしたときに開く。
