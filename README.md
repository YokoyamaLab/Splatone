# Splatone - Multi-layer Composite Heatmap

# 概要

SNSのジオタグ付きポストをキーワードに基づいて収集するツールです。キーワードは複数指定し、それぞれのキーワードの出現分布を地図上にマップします。現在は以下のSNSに対応しています。

- Flickr

集めたデータはキーワード毎に色分けされ地図上で可視化されます。以下の可視化手法に対応しています。

- Bulky: クロールした全てのジオタグを小さな点で描画する
- Marker Cluster: 密集しているジオタグをクラスタリングしてまとめて表示する

## 既知のバグ

- JSON.stringify(json)で変換できる大きさに制限があり、数十万件等の大きな結果を生み出すクエリは、クロール後、結果のブラウザへの転送で失敗します。
  
# 使い方

- [Node.js](https://nodejs.org/ja/download)をインストール後、npxで実行します。
  - npxはnpm上のモジュールをコマンド一つでインストールと実行を行う事ができるコマンドです。

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
  - **FlickrのAPIキーは自身のに置き換える事**
- ブラウザが立ち上がるので地図上でポリゴンあるいは矩形で領域選択し、実行ボタンを押すとクロールが開始されます。
  - 指定した範囲を内包するHexGrid(六角形グリッド)が生成され、その内側のみが収集されます。
- 結果が表示された後、結果をGeoJSON形式でダウンロードできます。

### 事例１)　商業施設・飲食施設・文化施設・公園の分類
```shell
$ node crawler.js -p flickr -o '{"flickr":{"API_KEY":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}' -k "商業=shop,souvenir,market,supermarket,pharmacy,drugstore,store,department,kiosk,bazaar,bookstore,cinema,showroom|飲食=bakery,food,drink,restaurant,cafe,bar,beer,wine,whiskey|文化施設=museum,gallery,theater,concert,library,monument,exhibition,expo,sculpture,heritage|公園=park,garden,flower,green,pond,playground" --vis-bulky
```
- オプションの **--vis-bulky** を **--vis-marker-cluster** に変更する事でマーカークラスターで可視化できます。

### 事例２）水路・陸路・ランドマーク等の分類
```shell
$ node crawler.js -p flickr -o '{"flickr":{"API_KEY":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}' -k "水域=canal,channel,waterway,river,stream,watercourse,sea,ocean,gulf,bay,strait,lagoon,offshore|橋梁=bridge,overpass,flyover,aqueduct,trestle|通路=street,road,thoroughfare,roadway,avenue,boulevard,lane,alley,roadway,carriageway,highway,motorway|ランドマーク=church,sanctuary,chapel,cathedral,basilica,minster,abbey,temple,shrine" --vis-bulky
```
- ベネチア等の水路のある町でやると面白いです

# 詳細説明

## APIキーの与え方

APIキーは以下の３種類の方法で与える事ができます
- ```--option```に含める
  - 上記コマンド例の方法
  - **flickr**の場合は``` -o '{"plugin":{"API_KEY":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}'```になります。
  - [注意] コマンドを他の人と共有する時、APIキーをそのまま渡す事は危険です。
  - **flickr**の場合は``` -o '{"flickr":{"API_KEY":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}'```になります。
- 環境変数で渡す
  - ```API_KEY_plugin```という環境変数に格納する
  - コマンドに毎回含めなくて良くなる。
  - **flickr**の場合は```.API_KEY_flickr```になります。
    - ```plugin```はプラグイン名(flickr等)に置き換えてください。
  - 一時的な環境変数を定義する事も可能です。(bash等)
    - ```API_KEY_flickr="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" node crawler.js -p flickr -k "sea,ocean|mountain,mount" --vis-bulky```
- ファイルで渡す(npxでは不可)
  - ルートディレクトリに```.API_KEY.plugin```というファイルを作成し保存
    - ```plugin```はプラグイン名(flickr等)に置き換えてください。
  - **flickr**の場合は```.API_KEY.flickr```になります。
  - optionや環境変数で与えるよりも優先されます。

## Visualizer (可視化ツール)

### Bulky: 全ての点を地図上にポイントする

![](https://github.com/YokoyamaLab/Splatone/blob/main/assets/screenshot_venice_bulky.png?raw=true)

* クエリは水域と通路・橋梁・ランドマークを色分けしたもの、上記スクリーンショットはベネチア付近のデータ
```shell
$ node crawler.js -p flickr -o '{"flickr":{"API_KEY":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}' -k "水域=canal,channel,waterway,river,stream,watercourse,sea,ocean,gulf,bay,strait,lagoon,offshore|橋梁=bridge,overpass,flyover,aqueduct,trestle|通路=street,road,thoroughfare,roadway,avenue,boulevard,lane,alley,roadway,carriageway,highway,motorway|ランドマーク=church,sanctuary,chapel,cathedral,basilica,minster,abbey" --vis-marker-cluster --vis-bulky
```

### Marker Cluster: 高密度の地点はマーカーをまとめて表示する
![](https://github.com/YokoyamaLab/Splatone/blob/main/assets/screenshot_venice_marker-cluster.png?raw=true)

* クエリは水域と通路・橋梁・ランドマークを色分けしたもの、上記スクリーンショットはベネチア付近のデータ
```shell
$ node crawler.js -p flickr -o '{"flickr":{"API_KEY":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}' -k "水域=canal,channel,waterway,river,stream,watercourse,sea,ocean,gulf,bay,strait,lagoon,offshore|橋梁=bridge,overpass,flyover,aqueduct,trestle|通路=street,road,thoroughfare,roadway,avenue,boulevard,lane,alley,roadway,carriageway,highway,motorway|ランドマーク=church,sanctuary,chapel,cathedral,basilica,minster,abbey" --vis-marker-cluster --vis-marker-cluster
```
## キーワード指定方法

### 比較キーワードの指定

複数のキーワードでジオタグ付きポストを集め分布を比較します。比較キーワードは「|」区切りで指定します。例えばseaとmountainの分布を調べたい場合は以下のようにします。この例では、seaとタグ付けられたポストとmountainとタグ付けられたポストが色分けされて分布を表示します。

```
-k "sea|mountain"
```

### 類語キーワードの指定

seaだけでは集められるポストが限定されるので、同様の意味のキーワードも指定してor検索したいと考えるかもしれません。その場合は「,」で区切ってキーワードを並べる事ができます。これを類語キーワードと呼びます。例えばseaとocean、mountainとmountでor検索したい場合は以下のように指定します。

```
-k "sea,ocean|mountain,mount"
```

### カテゴリ名の指定

複数の類語キーワードを指定した場合、それらをまとめるカテゴリ名を付ける事ができます。たとえはsea,oceanに『海域』、mountain,mountに『山岳』とカテゴリ名をつけるには以下のように指定します。なお、指定は必須ではありません。指定しない場合はそれぞれ１番目のキーワード(seaとmountain)がカテゴリ名になります。

```
-k "海域=sea,ocean|山岳=mountain,mount"
```

### 実行例 (海岸線と山岳の分布)

```shell
$ node crawler.js -p flickr -o '{"flickr":{"API_KEY":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}' -k "sea,ocean|mountain,mount" --vis-bulky
```
![](https://github.com/YokoyamaLab/Splatone/blob/main/assets/screenshot_sea-mountain_bulky.png?raw=true)


## ダウンロード

### 画像のダウンロード

* 結果の地図を画像(PNG形式)としてダウンロードするには、画面右下のアイコンをクリックしてください。

![](https://github.com/YokoyamaLab/Splatone/blob/main/assets/icon_image_download.png?raw=true)

### データのダウンロード

* クロール結果をデータとしてダウンロードしたい場合は凡例の下にあるエクスポートボタンをクリックしてください。

![](https://github.com/YokoyamaLab/Splatone/blob/main/assets/icon_data_export.png?raw=true)

