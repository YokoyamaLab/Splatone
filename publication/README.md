# Splatone Preprint (LaTeX Skeleton)

このディレクトリには、Splatone に関する preprint 論文の LaTeX スケルトンが含まれています。

## 構成

- `main.tex` : 論文本体（セクション構成のみ）
- `references.bib` : 文献データベース（例を1件だけ記載）
- `figures/` : 図表用のディレクトリ

## 実行方法（Provider/コマンド例）

Provider（flickr/gmap/overpass）の概要・使い方・実行コマンドは、リポジトリ直下の README に最新情報をまとめています。

- https://github.com/YokoyamaLab/Splatone#readme

## Overleaf で編集する手順

1. この `publication` ディレクトリを ZIP 形式で圧縮します。
2. Overleaf にログインし、`New Project` → `Upload Project` を選択します。
3. 作成した ZIP ファイルをアップロードします。
4. Overleaf 上で `main.tex` を開いて執筆を進めてください。

## ビルド補足（ローカル）

- 本スケルトンは日本語向けの設定を含むため、ローカルビルドは `uplatex` + `dvipdfmx` を想定しています。
- 現在の `main.tex` は図の埋め込みに事前生成PDF（例: `svg-inkscape/overall_svg-raw.pdf`）を利用しているため、通常は `-shell-escape` は不要です。
	- `figures/overall.svg` を編集した場合は、必要に応じてPDFを書き出し直して差し替えてください。

### 最小手順（PDF生成）

```sh
uplatex main.tex
dvipdfmx main.dvi
```

### latexmk を使う場合

このディレクトリには `latexmkrc` を同梱しています。

```sh
latexmk -r latexmkrc main.tex
```

### VS Code（LaTeX Workshop）を使う場合

リポジトリの設定 [.vscode/settings.json](../.vscode/settings.json) に、uplatex向けのビルドツール／レシピを同梱しています。

1. コマンドパレット → `LaTeX Workshop: Set compilation recipe`
2. `ptex2pdf(uplatex)_ja` を選択
3. `LaTeX Workshop: Build LaTeX project`

必要に応じて、クラスファイルや追加パッケージをこのディレクトリに追加し、再度 Overleaf にアップロードまたは Git 連携してください。
