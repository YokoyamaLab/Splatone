# Examples

このディレクトリは、Splatone の実行例（結果ファイル）と、拡張用のプラグイン例（Provider/Visualizer）をまとめたものです。

## 含まれるもの

- `bundle-providers/`
  - 可視化結果のサンプル（`tower-*.json`）と、その閲覧/再現コマンド
  - 詳細: [bundle-providers/README.md](bundle-providers/README.md)
- `plugins/`
  - NPM 配布を想定した Provider/Visualizer プラグインの最小サンプル
  - Provider/Visualizerプラグインの解説はこのページに記載しています。

## プラグイン開発者向け（Provider/Visualizer）

Splatone は、NPM パッケージとして配布された Provider / Visualizer を `crawler` 実行時に `--plugin` で明示ロードできます。

- `--plugin <pkg>`: プラグインの「パッケージ名」を指定（複数可）
- Provider を使う: `-p/--provider <id>`
- Visualizer を使う: `--vis-<id>`
- npx 前提の追加導入: `npx -p <pkg>`（インストールせず一時的に利用）

### Provider プラグイン要件

- 推奨パッケージ名: `splatone-provider-<id>`
- ESM を推奨: `"type": "module"`
- エントリ: default export で Provider クラスを公開
  - `ProviderBase` を継承（`import { ProviderBase } from 'splatone/lib/ProviderBase.js'`）
  - `static id = '<id>'` を設定（またはコンストラクタで `this.id` を設定）
- worker（必須）:
  - Piscina で実行される処理を同梱し、`<pkg>/worker` として解決できるようにする
  - `package.json` の `exports` に `"./worker": "./worker.js"` を含める（推奨）

最小の `package.json` 例:

```json
{
  "name": "splatone-provider-hello",
  "type": "module",
  "exports": {
    ".": "./index.js",
    "./worker": "./worker.js"
  },
  "peerDependencies": {
    "splatone": "*"
  }
}
```

### Visualizer プラグイン要件

- 推奨パッケージ名: `splatone-visualizer-<id>`
- エントリ: default export で Visualizer クラスを公開
  - `VisualizerBase` を継承（`import { VisualizerBase } from 'splatone/lib/VisualizerBase.js'`）
  - `static id = '<id>'` を設定（またはコンストラクタで `this.id` を設定）
- Web 側エントリ（推奨）:
  - ブラウザ上で描画する `web.js` を同梱し、`<pkg>/web` として解決できるようにする
  - `package.json` の `exports` に `"./web": "./web.js"` を含める（推奨）
- 任意: `public/` を同梱すると、`/visualizer/<id>/public/*` として配信されます

最小の `package.json` 例:

```json
{
  "name": "splatone-visualizer-simple",
  "type": "module",
  "exports": {
    ".": "./node.js",
    "./web": "./web.js"
  },
  "peerDependencies": {
    "splatone": "*"
  }
}
```

### ローカルでの動作確認（このリポジトリ内のサンプル）

#### サンプルの場所

- Provider サンプル: [plugins/splatone-provider-hello](plugins/splatone-provider-hello)
- Visualizer サンプル: [plugins/splatone-visualizer-simple](plugins/splatone-visualizer-simple)

#### おすすめ手順（`npm pack` → `npx -p <tgz>`）

npm のバージョン差を避けるため、まず `.tgz` に固めてから `npx -p` で読み込みます。

PowerShell 例（Provider）:

```powershell
Push-Location .\examples\plugins\splatone-provider-hello
npm pack
$pkg = (Get-ChildItem -Filter "splatone-provider-hello-*.tgz" | Select-Object -First 1).Name
Pop-Location

npx -y -p splatone@latest -p .\examples\plugins\splatone-provider-hello\$pkg crawler `
  --plugin splatone-provider-hello `
  -p hello `
  -k "A=a|B=b" `
  --vis-bulky
```

PowerShell 例（Visualizer）:

```powershell
Push-Location .\examples\plugins\splatone-visualizer-simple
npm pack
$pkg = (Get-ChildItem -Filter "splatone-visualizer-simple-*.tgz" | Select-Object -First 1).Name
Pop-Location

npx -y -p splatone@latest -p .\examples\plugins\splatone-visualizer-simple\$pkg crawler `
  --plugin splatone-visualizer-simple `
  -p flickr `
  -k "canal,river|street" `
  --vis-simple `
  --p-flickr-APIKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

補足:

- `--plugin` は「ロード」だけを行います。実際に使う Provider/Visualizer は `-p` や `--vis-*` で選びます。
- Provider プラグインは worker が必須です。`exports` の `./worker` を忘れると実行時にエラーになります。

## npm に publish して利用する例

ここでは「自作プラグインを npm に publish し、利用者が npx だけで使う」最短手順を示します。

### 1) publish の前提

- npm アカウントを作成し、ローカルでログインします

```powershell
npm login
```

- パッケージ名は一意である必要があります（例: `splatone-provider-myorg-foo` のようにプレフィックスを付けるのがおすすめ）
- スコープ付き（例: `@myorg/splatone-provider-foo`）で公開する場合は、初回 publish で `--access public` が必要なことがあります

### 2) Provider プラグインを publish

Provider 側は `exports` に `./worker` を含めるのが必須です。

`package.json`（例）

```json
{
  "name": "splatone-provider-foo",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": "./index.js",
    "./worker": "./worker.js"
  },
  "peerDependencies": {
    "splatone": "*"
  }
}
```

publish（例）

```powershell
# プラグインのディレクトリで
npm version patch
npm publish

# スコープ付き & public の例
# npm publish --access public
```

### 3) Visualizer プラグインを publish

Visualizer 側は Web エントリとして `exports` に `./web` を含めるのを推奨します。

`package.json`（例）

```json
{
  "name": "splatone-visualizer-bar",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": "./node.js",
    "./web": "./web.js"
  },
  "peerDependencies": {
    "splatone": "*"
  }
}
```

publish（例）

```powershell
npm version patch
npm publish
```

### 4) 利用者が npx で使う（インストール不要）

利用者は `--plugin` でプラグイン名を渡しつつ、`npx -p` でそのパッケージ自体も同時に取得します。

Provider プラグイン利用例

```powershell
npx -y -p splatone@latest -p splatone-provider-foo crawler `
  --plugin splatone-provider-foo `
  -p foo `
  -k "A=a|B=b" `
  --vis-bulky
```

Visualizer プラグイン利用例

```powershell
npx -y -p splatone@latest -p splatone-visualizer-bar crawler `
  --plugin splatone-visualizer-bar `
  -p flickr `
  -k "canal,river|street" `
  --vis-bar `
  --p-flickr-APIKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

Provider + Visualizer を同時に使う例

```powershell
npx -y -p splatone@latest -p splatone-provider-foo -p splatone-visualizer-bar crawler `
  --plugin splatone-provider-foo --plugin splatone-visualizer-bar `
  -p foo `
  -k "A=a|B=b" `
  --vis-bar
```
