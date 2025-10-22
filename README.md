# Splatone - Multi-layer Composite Heatmap

# 概要

SNSのジオタグ付きポストを収集するツールです。現在は以下のSNSに対応しています。

- Flickr

集めたデータは保存できる他、地図上で可視化する事が出来ます。以下の可視化に対応しています。

- Bulky: クロールした全てのジオタグを小さな点で描画する
- Marker Cluster: 密集しているジオタグをクラスタリングしてまとめて表示する
  
# 使い方

- [Node.js](https://nodejs.org/ja/download)をインストール後、NPXで実行します。


## Helpの表示

```shell
$ npx -y -- splatone@latest crawler --help
使い方: crawler.js [options]

Basic Options
  -p, --plugin    実行するプラグイン
                                   [文字列] [必須] [選択してください: "flickr"]
  -o, --options   プラグインオプション               [文字列] [デフォルト: "{}"]
  -k, --keywords  検索キーワード(|区切り)                  [文字列] [デフォルト:
                       "nature,tree,flower|building,house|water,sea,river,pond"]

Visualization (最低一つの指定が必須です)
      --vis-bulky           全データをCircleMarkerとして地図上に表示
                                                      [真偽] [デフォルト: false]
      --vis-marker-cluster  マーカークラスターとして地図上に表示
                                                      [真偽] [デフォルト: false]

オプション:
      --help     ヘルプを表示                                             [真偽]
      --version  バージョンを表示                                         [真偽] 
```
## クローリングの実行

- 以下のサンプルコマンドを参考に実行してください。
  - FlickrのAPIキーは自身のに置き換える事
- ブラウザが立ち上がるので地図上でポリゴンあるいは矩形で領域選択し、実行ボタンを押すとクロールが開始されます。
  - 指定した範囲を内包するHexGrid(六角形グリッド)が生成され、その内側のみが収集されます。
- 結果が表示された後、結果をGeoJSON形式でダウンロードできます。

### 事例１)　商業施設・飲食施設・文化施設・公園の分類
```
node crawler.js -p flickr -o '{"flickr":{"API_KEY":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}' -k "商業=shop,souvenir,market,supermarket,pharmacy,drugstore,store,department,kiosk,bazaar,bookstore,cinema,showroom|飲食=bakery,food,drink,restaurant,cafe,bar,beer,wine,whiskey|文化施設=museum,gallery,theater,concert,library,monument,exhibition,expo,sculpture,heritage|公園=park,garden,flower,green,pond,playground" --vis-bulky
```
- オプションの **--vis-bulky** を **--vis-marker-cluster** に変更する事でマーカークラスターで可視化できます。

### 事例２）水路・陸路・ランドマーク等の分類
```
node crawler.js -p flickr -o '{"flickr":{"API_KEY":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}' -k "水域=canal,channel,waterway,river,stream,watercourse,sea,ocean,gulf,bay,strait,lagoon,offshore|橋梁=bridge,overpass,flyover,aqueduct,trestle|通路=street,road,thoroughfare,roadway,avenue,boulevard,lane,alley,roadway,carriageway,highway,motorway|ランドマーク=church,sanctuary,chapel,cathedral,basilica,minster,abbey,temple,shrine" --vis-bulky
```
- ベネチア等の水路のある町でやると面白いです