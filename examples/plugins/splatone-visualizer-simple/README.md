# splatone-visualizer-simple

Splatone の Visualizer プラグイン例です。

- Node 側: `node.js`（Visualizer クラス）
- Web 側: `web.js`（ブラウザで実行される描画ロジック）
- `package.json` の `exports` に `./web` を含めてください（ホストが `${pkg}/web` で解決します）。
