# Splatone - Multi-layer Composite Heatmap

# 概要

SNSのジオタグ付きポストをキーワードに基づいて収集するツールです。キーワードは複数指定し、それぞれのキーワードの出現分布を地図上にマップします。現在は以下のSNSに対応しています。

- Flickr

集めたデータはキーワード毎に色分けされ地図上で可視化されます。以下の可視化手法に対応しています。

- Bulky: クロールした全てのジオタグを小さな点で描画する
- Marker Cluster: 密集しているジオタグをクラスタリングしてまとめて表示する

## Change Log

### v0.0.13 →　v0.0.14 →　v0.0.15 →　v0.0.16 →　v0.0.17
* **[可視化モジュール]** ```--vis-majority-hex```追加
* 結果の色固定機能追加 (キーワード指定方法を参照の事)
* [Bug Fix] npxが起動しない事象の修正

### v0.0.12 →　v0.0.13
* BulkyのPointMarkerのサイズや透明度を可変に
  * コマンドライン引数で指定 (詳しくは```  npx -y -p splatone@latest crawler --help```)

[これ以前のログ](CHANGELOG.md)


# 使い方

- [Node.js](https://nodejs.org/ja/download)をインストール後、npxで実行します。
  - npxはnpm上のモジュールをコマンド一つでインストールと実行を行う事ができるコマンドです。

## Helpの表示

```shell
$ npx -y -p splatone@latest crawler --help
[app] [plugin] loaded: flickr@1.0.0
使い方: crawler.js [options]

Basic Options
  -p, --plugin    実行するプラグイン[文字列] [必須] [選択してください: "flickr"]   
  -k, --keywords  検索キーワード(|区切り)                  [文字列] [デフォルト:   
                       "nature,tree,flower|building,house|water,sea,river,pond"]   
  -f, --filed     大きなデータをファイルとして送受信する
                                                       [真偽] [デフォルト: true]   
  -c, --chopped   大きなデータを細分化して送受信する
                                             [非推奨] [真偽] [デフォルト: false]   

Debug
      --debug-verbose  デバッグ情報出力               [真偽] [デフォルト: false]   

For flickr Plugin
      --p-flickr-APIKEY    Flickr ServiceのAPI KEY                      [文字列]   
      --p-flickr-Extras    カンマ区切り/保持する写真のメタデータ(デフォルト値は    
                           記載の有無に関わらず保持)
       [文字列] [デフォルト: "date_upload,date_taken,owner_name,geo,url_s,tags"]
      --p-flickr-DateMode  利用時間軸(update=Flickr投稿日時/taken=写真撮影日時)
                    [選択してください: "upload", "taken"] [デフォルト: "upload"]
      --p-flickr-Haste     時間軸分割並列処理          [真偽] [デフォルト: true]
      --p-flickr-DateMax   クローリング期間(最大) UNIX TIMEもしくはYYYY-MM-DD
                                               [文字列] [デフォルト: 1763107393]
      --p-flickr-DateMin   クローリング期間(最小) UNIX TIMEもしくはYYYY-MM-DD
                                               [文字列] [デフォルト: 1072882800]

Visualization (最低一つの指定が必須です)
      --vis-bulky           全データをCircleMarkerとして地図上に表示
                                                      [真偽] [デフォルト: false]
      --vis-majority-hex    HexGrid内で最も出現頻度が高いカテゴリの色で彩色。Hex
                            apartiteモードで6分割パイチャート表示。透明度は全体
                            で正規化。                [真偽] [デフォルト: false]
      --vis-marker-cluster  マーカークラスターとして地図上に表示
                                                      [真偽] [デフォルト: false]

For bulky Visualizer
      --v-bulky-Radius       Point Markerの半径           [数値] [デフォルト: 5]
      --v-bulky-Stroke       Point Markerの線の有無    [真偽] [デフォルト: true]
      --v-bulky-Weight       Point Markerの線の太さ       [数値] [デフォルト: 1]
      --v-bulky-Opacity      Point Markerの線の透明度     [数値] [デフォルト: 1]
      --v-bulky-Filling      Point Markerの塗りの有無  [真偽] [デフォルト: true]
      --v-bulky-FillOpacity  Point Markerの塗りの透明度 [数値] [デフォルト: 0.5]

For majority-hex Visualizer
      --v-majority-hex-Hexapartite  中のカテゴリの頻度に応じて六角形を分割色彩
                                                      [真偽] [デフォルト: false]
      --v-majority-hex-HexOpacity   六角形の線の透明度    [数値] [デフォルト: 1]
      --v-majority-hex-HexWeight    六角形の線の太さ      [数値] [デフォルト: 1]
      --v-majority-hex-MaxOpacity   正規化後の最大塗り透明度
                                                        [数値] [デフォルト: 0.9]
      --v-majority-hex-MinOpacity   正規化後の最小塗り透明度
                                                        [数値] [デフォルト: 0.5]

For marker-cluster Visualizer
      --v-marker-cluster-MaxClusterRadius  クラスタを構成する範囲(半径)
                                                         [数値] [デフォルト: 80]

オプション:
      --help     ヘルプを表示                                             [真偽]
      --version  バージョンを表示                                         [真偽]

cold_@bimota-due MINGW64 /c/GitHub/Splatone (61-可視化メソッドmajorityhex)
$ npx -y -p crawler@latest --help
[app] [plugin] loaded: flickr@1.0.0
使い方: crawler.js [options]

Basic Options
  -p, --plugin    実行するプラグイン[文字列] [必須] [選択してください: "flickr"]
  -k, --keywords  検索キーワード(|区切り)                  [文字列] [デフォルト:
                       "nature,tree,flower|building,house|water,sea,river,pond"]
  -f, --filed     大きなデータをファイルとして送受信する
                                                       [真偽] [デフォルト: true]
  -c, --chopped   大きなデータを細分化して送受信する
                                             [非推奨] [真偽] [デフォルト: false]

Debug
      --debug-verbose  デバッグ情報出力               [真偽] [デフォルト: false]

For flickr Plugin
      --p-flickr-APIKEY    Flickr ServiceのAPI KEY                      [文字列]
      --p-flickr-Extras    カンマ区切り/保持する写真のメタデータ(デフォルト値は
                           記載の有無に関わらず保持)
       [文字列] [デフォルト: "date_upload,date_taken,owner_name,geo,url_s,tags"]
      --p-flickr-DateMode  利用時間軸(update=Flickr投稿日時/taken=写真撮影日時)
                    [選択してください: "upload", "taken"] [デフォルト: "upload"]
      --p-flickr-Haste     時間軸分割並列処理          [真偽] [デフォルト: true]
      --p-flickr-DateMax   クローリング期間(最大) UNIX TIMEもしくはYYYY-MM-DD
                                               [文字列] [デフォルト: 1763107399]
      --p-flickr-DateMin   クローリング期間(最小) UNIX TIMEもしくはYYYY-MM-DD
                                               [文字列] [デフォルト: 1072882800]

Visualization (最低一つの指定が必須です)
      --vis-bulky           全データをCircleMarkerとして地図上に表示
                                                      [真偽] [デフォルト: false]
      --vis-majority-hex    HexGrid内で最も出現頻度が高いカテゴリの色で彩色。Hex
                            apartiteモードで6分割パイチャート表示。透明度は全体
                            で正規化。                [真偽] [デフォルト: false]
      --vis-marker-cluster  マーカークラスターとして地図上に表示
                                                      [真偽] [デフォルト: false]

For bulky Visualizer
      --v-bulky-Radius       Point Markerの半径           [数値] [デフォルト: 5]
      --v-bulky-Stroke       Point Markerの線の有無    [真偽] [デフォルト: true]
      --v-bulky-Weight       Point Markerの線の太さ       [数値] [デフォルト: 1]
      --v-bulky-Opacity      Point Markerの線の透明度     [数値] [デフォルト: 1]
      --v-bulky-Filling      Point Markerの塗りの有無  [真偽] [デフォルト: true]
      --v-bulky-FillOpacity  Point Markerの塗りの透明度 [数値] [デフォルト: 0.5]

For majority-hex Visualizer
      --v-majority-hex-Hexapartite  中のカテゴリの頻度に応じて六角形を分割色彩
                                                      [真偽] [デフォルト: false]
      --v-majority-hex-HexOpacity   六角形の線の透明度    [数値] [デフォルト: 1]
      --v-majority-hex-HexWeight    六角形の線の太さ      [数値] [デフォルト: 1]
      --v-majority-hex-MaxOpacity   正規化後の最大塗り透明度
                                                        [数値] [デフォルト: 0.9]
      --v-majority-hex-MinOpacity   正規化後の最小塗り透明度
                                                        [数値] [デフォルト: 0.5]

For marker-cluster Visualizer
      --v-marker-cluster-MaxClusterRadius  クラスタを構成する範囲(半径)
                                                         [数値] [デフォルト: 80]

オプション:
      --help     ヘルプを表示                                             [真偽]
      --version  バージョンを表示                                         [真偽]
```

## 最小コマンド例

1. *plugin*を一つ、*visualizer*を一つ以上指定し、複数のキーワードでクロールを開始します。
  * plugin: flickr
  * visualizer: bulky
  * キーワード: canal,river|street,alley|bridge
1. コマンドを実行するとWebブラウザで地図表示されるので、地図上の任意の位置に矩形あるいはポリゴンを描く
  * 例えばベネチア
2. Start Crawlingボタンをクリックしクローリング開始

![](assets/screenshot_venice_simple.png?raw=true)

```bash
$ npx -y -- splatone@latest crawler -p flickr -k "canal,river|street,alley|bridge" --vis-bulky --p-flickr-APIKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

# 詳細説明

## Plugin (クローラー)

### Flickr: Flickrのジオタグ付き写真を取得するクローラー

#### コマンドライン引数

| オプション                | 説明                                                                          | 型             | デフォルト   |
| :------------------------ | :---------------------------------------------------------------------------- | :------------- | :----------- |
| ```--p-flickr-APIKEY```   | Flickr ServiceのAPI KEY                                                       | 文字列         |              |
| ```--p-flickr-Extras```   | カンマ区切り/保持する写真のメタデータ(デフォルト値は記載の有無に関わらず保持) | 文字列         | date_upload  |,date_taken,owner_name,geo,url_s,tags
| ```--p-flickr-DateMode``` | 利用時間軸(update=Flickr投稿日時/taken=写真撮影日時)                          | 選択: "upload" | "taken"      |,"upload"
| ```--p-flickr-Haste```    | 時間軸分割並列処理                                                            | 真偽           | true         |
| ```--p-flickr-DateMax```  | クローリング期間(最大) UNIX TIMEもしくはYYYY-MM-DD                            | 文字列         | (動的)現時刻 |
| ```--p-flickr-DateMin```  | クローリング期間(最小) UNIX TIMEもしくはYYYY-MM-DD                            | 文字列         | 1072882800   |

#### Flickr APIキーの与え方

APIキーは以下の３種類の方法で与える事ができます
- ```--option```に含める
  - 上記コマンド例の方法
  - **flickr**の場合は``` --p-flickr-APIKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" ```になります。
  - [注意] コマンドを他の人と共有する時、APIキーをそのまま渡す事は危険です。
- 環境変数で渡す
  - ```API_KEY_plugin```という環境変数に格納する
  - コマンドに毎回含めなくて良くなる。
- ファイルで渡す(npxでは不可)
  - ルートディレクトリに```.API_KEY.plugin```というファイルを作成し保存
    - ```plugin```はプラグイン名(flickr等)に置き換えてください。
  - **flickr**の場合は```.API_KEY.flickr```になります。
  - optionや環境変数で与えるよりも優先されます。

## Visualizer (可視化モジュール)

### Bulky: 全ての点を地図上にポイントする

![](assets/screenshot_sea-mountain_bulky.png?raw=true)

#### コマンド例
* クエリは海と山のキーワード検索。上記スクリーンショットは日本のデータ
```shell
$  npx -y -p splatone@latest crawler -p flickr -k "sea,ocean|mountain,mount" --vis-bulky--p-flickr-APIKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

#### コマンドライン引数

| オプション                  | 説明                       | 型   | デフォルト |
| :-------------------------- | :------------------------- | :--- | :--------- |
| ```--v-bulky-Radius```      | Point Markerの半径         | 数値 | 5          |
| ```--v-bulky-Stroke```      | Point Markerの線の有無     | 真偽 | true       |
| ```--v-bulky-Weight```      | Point Markerの線の太さ     | 数値 | 1          |
| ```--v-bulky-Opacity```     | Point Markerの線の透明度   | 数値 | 1          |
| ```--v-bulky-Filling```     | Point Markerの塗りの有無   | 真偽 | true       |
| ```--v-bulky-FillOpacity``` | Point Markerの塗りの透明度 | 数値 | 0.5        |


### Marker Cluster: 高密度の地点はマーカーをまとめて表示する
![](assets/screenshot_venice_marker-cluster.png?raw=true)

#### コマンド例
* クエリは水域と通路・橋梁・ランドマークを色分けしたもの、上記スクリーンショットはベネチア付近のデータ
```shell
$ npx -y -p splatone@latest crawler -p flickr -k "水域=canal,channel,waterway,river,stream,watercourse,sea,ocean,gulf,bay,strait,lagoon,offshore|橋梁=bridge,overpass,flyover,aqueduct,trestle|通路=street,road,thoroughfare,roadway,avenue,boulevard,lane,alley,roadway,carriageway,highway,motorway|ランドマーク=church,sanctuary,chapel,cathedral,basilica,minster,abbey" --vis-marker-cluster --vis-bulky --p-flickr-APIKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

#### コマンドライン引数

| オプション                                | 説明                         | 型   | デフォルト |
| :---------------------------------------- | :--------------------------- | :--- | :--------- |
| ```--v-marker-cluster-MaxClusterRadius``` | クラスタを構成する範囲(半径) | 数値 | 80         |

### Majority Hex: Hexグリッド内の出現頻度に応じた彩色

![](assets/screenshot_florida_hex_majorityr.png?raw=true)

#### コマンド例
* クエリは水域・緑地・交通・ランドマークを色分けしたもの。上記スクリーンショットはフロリダ半島全体
* 
```shell
$  npx -y -p splatone@latest crawler -p flickr -k "水域=canal,channel,waterway,river,stream,watercourse,sea,ocean,gulf,bay,strait,lagoon,offshore|緑地=forest,woods,turf,lawn,jungle,trees,rainforest,grove,savanna,steppe|交通=bridge,overpass,flyover,aqueduct,trestle,street,road,thoroughfare,roadway,avenue,boulevard,lane,alley,roadway,carriageway,highway,motorway|ランドマーク=church,chapel,cathedral,basilica,minster,temple,shrine,neon,theater,statue,museum,sculpture,zoo,aquarium,observatory" --vis-majority-hex --v-majority-hex-Hexapartite --p-flickr-APIKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

#### コマンドライン引数

| オプション                            | 説明                                       | 型   | デフォルト |
| :------------------------------------ | :----------------------------------------- | :--- | :--------- |
| ```--v-majority-hex-Hexapartite```    | 中のカテゴリの頻度に応じて六角形を分割色彩 | 真偽 | false      |
| ```--v-majority-hex-HexOpacity=1```   | 六角形の線の透明度                         | 数値 | 1          |
| ```--v-majority-hex-HexWeight=1```    | 六角形の線の太さ                           | 数値 | 1          |
| ```--v-majority-hex-MaxOpacity=0.9``` | 正規化後の最大塗り透明度                   | 数値 | 0.9        |
| ```--v-majority-hex-MinOpacity=0.3``` | 正規化後の最小塗り透明度                   | 数値 | 0.5        |

* ```--v-majority-hex-Hexapartite```を指定すると各Hexセルを六分割の荒いPie Chartとして中のカテゴリ頻度に応じて彩色します。

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

### カテゴリ毎の色指定

カテゴリの内容に合わせた色を指定したい場合はコマンドライン引数にて行えます。例えば海域を青に、山岳を緑にしたい場合は、カテゴリ名に続けて**#RRGGBB**で指定します。

```
-k "海域#037dfc=sea,ocean|山岳#7fc266=mountain,mount"
```

色を簡単に探すための小さなコマンドが付属しています。

#### 色セット生成ツール(color.js)の使い方

このリポジトリには、コマンドラインで色のセットを生成する小さなユーティリティ `color.js` が含まれています。用途は以下の通りです。

- 指定した数のカラーパレット（セット）を生成する
- ターミナル上で色サンプルを ANSI Truecolor で確認する
- プレーンなカンマ区切り HEX リストを出力して他ツールに渡す

- 使い方（6色のカラーパレットを2セット作りたい）:

```bash
 npx -y -psplatone@latest colors <count> <sets>
# 例: 6色を3セット生成（ターミナルに色付きで表示）
 npx -y -p splatone@latest colors 6 3
``` 

- オプション:

- `--no-ansi` : ANSI カラーシーケンスを出力せず、プレーンなカンマ区切りの HEX を出力します（パイプやログ向け）。

```bash
 npx -y -p splatone@latest colors --no-ansi 6 3
```

## ダウンロード

### 画像のダウンロード

* 結果の地図を画像(PNG形式)としてダウンロードするには、画面右下のアイコンをクリックしてください。
  * 注意: 画像には凡例が含まれません 

![](assets/icon_image_download.png?raw=true)

### データのダウンロード

* クロール結果をデータとしてダウンロードしたい場合は凡例の下にあるエクスポートボタンをクリックしてください。
  * 指定したビジュアライザ毎にFeature Collectionとして結果が格納されます。
  * クローリングしたデータそのものが欲しい場合はBulky等、単純なビジュアライザを指定してください。

![](assets/icon_data_export.png?raw=true)

### 広範囲なデータ収集例

* クエリ数はおおよそ1 query/secに調整されますので、時間はかかりますが大量のデータを収集する事も可能です。

![](/assets/screenshot_massive_points_bulky.png)