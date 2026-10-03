# 問題・既存解決策・未検証の仮説

調査日: 2026-10-03。これは需要実証や市場調査の代替ではない。

## 確認できた問題

Vite の公式 troubleshooting は、古いクライアントが新しい配信に存在しない chunk を参照する version skew を、dynamic import 読込失敗の原因として説明している。[公式 Vite](https://vite.dev/guide/troubleshooting.html#version-skew)

実例として、デプロイを跨ぐ dynamic import の失敗が Vite の issue に報告されている。issue の存在は頻度、事業規模、需要の証明ではない。[vitejs/vite #11804](https://github.com/vitejs/vite/issues/11804)

PWA 系 issue では、JS 要求に HTML が返る MIME 問題を含む報告がある。このツールは Service Worker や fallback をモデル化しない。静的ファイル保持だけで一般問題を解決できるとは扱わない。[vite-plugin-pwa #458](https://github.com/vite-pwa/vite-plugin-pwa/issues/458)

## 既存解決策

- [Vercel Skew Protection](https://vercel.com/docs/skew-protection): 対応する framework / platform の deployment identity を使った version locking。配信中の request routing を扱う
- [Netlify Skew Protection](https://docs.netlify.com/deploy/deploy-overview/#skew-protection): client が必要とする deploy へ request を向ける仕組み
- [Vite manifest](https://vite.dev/guide/backend-integration.html): source と出力・依存関係を記述する標準的な基礎情報。自前のスクリプトでも到達性検査は実装可能

上記の有料条件、対応 framework、設定は変わるため、利用時は各公式サイトを確認する。本作品はそれらを置き換えない。

## この作品で試す差分

ホストを接続せず、ローカルの2 manifest と明示 inventory から、選択 entry の依存経路・方針別の不足・同名ファイルの不明点を説明する。変更ファイル一覧とは異なり、旧 entry と無関係な更新を切り分け、共有依存・CSS・asset をつなげて示す。

差分の有用性は仮説。既存ツールの網羅調査、独自性、技術的新規性の主張はしていない。

## 次に検証すべきこと

1. 実際に Vite を配信する開発者が、既存の diff / manifest script と比べて原因説明を速く行えるか
2. 古い entry JS の消失を含む過大近似を、誤った runtime failure 予測と受け取らないか
3. 完全 inventory を用意する負担が、得られる保持根拠に見合うか
4. 既存の skew protection を利用する方が簡単なケースを、正しく除外できるか

実施していない利用者インタビュー、改善率、削減時間、継続利用者数は記載しない。将来の調査は許可された相手・方法で行う。

## 中止・縮小条件

- 正確に説明するために任意の入力 JS 実行が必要なら、この宣言モデルの対象から除外する
- 支持対象の固定 fixture で、保持集合に問題なしとして扱った lazy closure が失敗するなら release gate を止め、契約または実装を修正する
- 比較優位が装飾したファイル差分に留まるなら、製品としての拡張を止め、再現実験・学習資料へ縮小する
- 実利用での要求が CDN / API / Service Worker / retention duration の自動判断に偏るなら、無理にこのツールへ取り込まない
