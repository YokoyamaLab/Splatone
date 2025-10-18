# Splatone - Multi-layer Composite Heatmap

# 概要

SNSのジオタグ付きポストを収集するツールです。現在は以下のSNSに対応しています。

- Flickr

集めたデータは保存できる他、地図上で可視化する事が出来ます。以下の可視化に対応しています。

- Marker
  
# 使い方

- ローカルにCloneしてから以下のコマンドで依存ライブラリをインストール。

```
npm install
```

- 以下のサンプルコマンドを参考に実行してください。(FlickrのAPIキーは自身のに置き換える事)

```
node crawler.js -p flickr -o '{"flickr":{"API_KEY":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}' -k "商業=shop,souvenir,market,supermarket,pharmacy,store,department|食べ物=food,drink,restaurant,cafe,bar|美術館=museum,art,exhibition,expo,sculpture,heritage|公園=park,garden,flower,green,pond,playground" --vN
```

- ブラウザが立ち上がるので地図上でポリゴンあるいは矩形で領域選択し、実行ボタンを押すとクロールが開始されます。
  - 指定した範囲を内包するHexGrid(六角形グリッド)が生成され、その内側のみが収集されます。
