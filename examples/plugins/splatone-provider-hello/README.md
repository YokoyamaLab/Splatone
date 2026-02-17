# splatone-provider-hello

Splatone の Provider プラグイン例です。外部 API を使わず、Hex×カテゴリごとにダミーのポイントを生成します。

- エントリ: `index.js`（Provider クラス）
- worker: `worker.js`（Piscina で実行される処理）
- `package.json` の `exports` に `./worker` を必ず含めてください（ホストが `${pkg}/worker` で解決します）。
