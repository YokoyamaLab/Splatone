# Splatone - Multi-layer Composite Heatmap

# 概要

SNSのジオタグ付きポストをキーワードに基づいて収集するツールです。キーワードは複数指定し、それぞれのキーワードの出現分布を地図上にマップします。現在は以下のSNSに対応しています。

- Flickr

集めたデータはキーワード毎に色分けされ地図上で可視化されます。以下の可視化手法に対応しています。

- Bulky: クロールした全てのジオタグを小さな点で描画する
- Marker Cluster: 密集しているジオタグをクラスタリングしてまとめて表示する
- Majority Hex: HexGridの各セルをセル内で最頻出するカテゴリの色で彩色
- Pie Charts: Hexセル中心にカテゴリ割合のPie Chartを描画し、カテゴリごとに半径を可変化
- Voronoi: HexGrid単位で集約したジオタグからVoronoiセルを生成し、各Hexのポリゴンでクリップして表示
- Heat: ヒートマップ
- Pie Charts: 円グラフグリッド
- DBSCAN: ジオタグをDBSCANクラスタリングし、各クラスタの凸包をポリゴンとして表示

## Change Log

### v0.0.22 → →　v0.0.23

* ブラウズモードの追加
  * ダウンロードした結果ファイルを閲覧するモード
  * ハンバーガーメニューの拡充
    * 結果の統計情報の追加
    * CLIコマンドの表示
* **[可視化モジュール]** `--vis-dbscan` 追加
  * DBSCANクラスタリング結果を凸包ポリゴンで可視化
* カラーパレット生成ツールの改良
  * ブラウザ上でカラーの確認と調整を可能に

### v0.0.18 → →　v0.0.22

* **[可視化モジュール]** ```--vis-voronoi```追加
  * ボロノイ図の生成
* **[可視化モジュール]** ```--vis-pie-charts```追加
  * Hex中心のカテゴリ割合Pie Chart描画
* マイナーBug Fix

### v0.0.17 →　v0.0.18

* **[可視化モジュール]** ```--vis-heat```追加
  * ヒートマップの生成

### v0.0.13 → →　v0.0.17

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
  -p, --plugin       実行するプラグイン    [文字列] [選択してください: "flickr"]
  -k, --keywords     検索キーワード(|区切り)               [文字列] [デフォルト:
                       "nature,tree,flower|building,house|water,sea,river,pond"]
  -f, --filed        大きなデータをファイルとして送受信する
                                                       [真偽] [デフォルト: true]
  -c, --chopped      大きなデータを細分化して送受信する
                                             [非推奨] [真偽] [デフォルト: false]
      --browse-mode  ブラウズ専用モード（範囲描画とクロールを無効化）
                                                      [真偽] [デフォルト: false]

Debug
      --debug-verbose  デバッグ情報出力               [真偽] [デフォルト: false]

UI Defaults
      --ui-cell-size  起動時にUIへ設定するセルサイズ (0で自動)
                                                          [数値] [デフォルト: 0]
      --ui-units      セルサイズの単位 (kilometers/meters/miles)
       [文字列] [選択してください: "kilometers", "meters", "miles"] [デフォルト:
                                                                   "kilometers"]
      --ui-bbox       UI初期表示の矩形範囲。"minLon,minLat,maxLon,maxLat" の形式
                                                                        [文字列]
      --ui-polygon    UI初期表示のポリゴン。Polygon/MultiPolygonを含むGeoJSON文
                      字列                                              [文字列]

For flickr Plugin
      --p-flickr-APIKEY    Flickr ServiceのAPI KEY                      [文字列]
      --p-flickr-Extras    カンマ区切り/保持する写真のメタデータ(デフォルト値は
                           記載の有無に関わらず保持)
       [文字列] [デフォルト: "date_upload,date_taken,owner_name,geo,url_s,tags"]
      --p-flickr-DateMode  利用時間軸(update=Flickr投稿日時/taken=写真撮影日時)
                    [選択してください: "upload", "taken"] [デフォルト: "upload"]
      --p-flickr-Haste     時間軸分割並列処理          [真偽] [デフォルト: true]
      --p-flickr-DateMax   クローリング期間(最大) UNIX TIMEもしくはYYYY-MM-DD
                                               [文字列] [デフォルト: 1763465845]
      --p-flickr-DateMin   クローリング期間(最小) UNIX TIMEもしくはYYYY-MM-DD
                                               [文字列] [デフォルト: 1072882800]

Visualization (最低一つの指定が必須です)
      --vis-bulky           全データをCircleMarkerとして地図上に表示
                                                      [真偽] [デフォルト: false]
      --vis-heat            カテゴリ毎に異なるレイヤのヒートマップで可視化（色=
                            カテゴリ色、透明度=頻度） [真偽] [デフォルト: false]
      --vis-majority-hex    HexGrid内で最も出現頻度が高いカテゴリの色で彩色。Hex
                            apartiteモードで6分割パイチャート表示。透明度は全体
                            で正規化。                [真偽] [デフォルト: false]
      --vis-marker-cluster  マーカークラスターとして地図上に表示
                                                      [真偽] [デフォルト: false]
      --vis-pie-charts      Hex中心にカテゴリ割合のPie
                            Chartを描画するビジュアライザ
                                                      [真偽] [デフォルト: false]
      --vis-voronoi         Hex Grid ボロノイ図       [真偽] [デフォルト: false]

For bulky Visualizer
      --v-bulky-Radius       Point Markerの半径           [数値] [デフォルト: 5]
      --v-bulky-Stroke       Point Markerの線の有無    [真偽] [デフォルト: true]
      --v-bulky-Weight       Point Markerの線の太さ       [数値] [デフォルト: 1]
      --v-bulky-Opacity      Point Markerの線の透明度     [数値] [デフォルト: 1]
      --v-bulky-Filling      Point Markerの塗りの有無  [真偽] [デフォルト: true]
      --v-bulky-FillOpacity  Point Markerの塗りの透明度 [数値] [デフォルト: 0.5]

For heat Visualizer
      --v-heat-Radius      ヒートマップブラーの半径  [数値] [デフォルト: 0.0005]
      --v-heat-MinOpacity  ヒートマップの最小透明度       [数値] [デフォルト: 0]
      --v-heat-MaxOpacity  ヒートマップの最大透明度       [数値] [デフォルト: 1]
      --v-heat-MaxValue    ヒートマップ強度の最大値
                           (未指定時はデータから自動推定)                 [数値]

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

For pie-charts Visualizer
      --v-pie-charts-MaxRadiusScale     Hex内接円半径に対する最大半径スケール
                                        (0-1.5)         [数値] [デフォルト: 0.9]
      --v-pie-charts-MinRadiusScale     最大半径に対する最小半径スケール (0-1)
                                                       [数値] [デフォルト: 0.25]
      --v-pie-charts-StrokeWidth        Pie Chart輪郭線の太さ(px)
                                                          [数値] [デフォルト: 1]
      --v-pie-charts-BackgroundOpacity  最大半径ガイドリングの透明度 (0-1)
                                                        [数値] [デフォルト: 0.2]

For voronoi Visualizer
      --v-voronoi-MaxSitesPerHex        ポワソン分布に基づいて各ヘックス内でサン
                                        プリングされる最大サイト数 (0 = 無制限)
                                                          [数値] [デフォルト: 0]
      --v-voronoi-MinSiteSpacingMeters  各ヘックス内でサンプリングされたサイト間
                                        の最小距離をメートル単位で保証 (0 =
                                        無効)            [数値] [デフォルト: 50]

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
$ npx -y -p splatone@latest crawler -p flickr -k "canal,river|street,alley|bridge" --vis-bulky --p-flickr-APIKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

## ブラウズ専用モード

ダウンロードした結果ファイルをブラウザ上で閲覧するためのモードです。

```bash
npx -y -p splatone@latest browse
```

あるいは

```bash
npx -y -p splatone@latest crawl --browse-mode
```

- ブラウザ上に result*.json（`crawler` が保存したファイル）をドラッグ＆ドロップすると、その場で結果が地図へ描画されます。ズームやパン等Leafletの機能が使えます。
- CLI コマンド生成欄には、この結果を生成したコマンドが表示さるため、同じ条件をベースに新たなクエリを発行できます。
 



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

全ての点を地図上に表示する。

![](assets/screenshot_sea-mountain_bulky.png?raw=true)

#### コマンド例
* クエリは海と山のキーワード検索。上記スクリーンショットは日本のデータ
```shell
$ npx -y -p splatone@latest crawler -p flickr -k "sea,ocean|mountain,mount" --vis-bulky--p-flickr-APIKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
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

全マーカーを表示すると、地図上がマーカーで埋め尽くされる問題に対して、高密度地点のマーカー群を一つにまとめてマーカーとする手法。ズームレベルに応じて自動的にマーカーが集約される。

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

### Heat: ヒートマップ

出現頻度に基づいて点の影響範囲をガウス分布で定め連続的に彩色するヒートマップ。

![](assets/screenshot_venice_heat.png?raw=true)

#### コマンド例

* クエリは水域・緑地・交通・ランドマークを色分けしたもの。上記スクリーンショットはフロリダ半島全体
 
```shell
$ npx -y -p splatone@latest crawler -p flickr -k "水域#0947ff=canal,river,sea,strait,channel,waterway|交通#00a73d=road,street,alley,sidewalk,bridge|宗教施設#ffb724=chapel,church,cathedral,temple,shrine" --vis-heat --p-flickr-APIKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

#### コマンドライン引数

| オプション                | 説明                                                   | 型   | デフォルト |
| :------------------------ | :----------------------------------------------------- | :--- | :--------- |
| ```--v-heat-Radius```     | ヒートマップブラーの半径                               | 数値 | 0.0005     |
| ```--v-heat-MinOpacity``` | ヒートマップの最小透明度                               | 数値 | 0          |
| ```--v-heat-MaxOpacity``` | ヒートマップの最大透明度                               | 数値 | 1          |
| ```--v-heat-MaxValue```   | ヒートマップ強度の最大値(未指定時はデータから自動推定) | 数値 |            |

### Majority Hex: Hexグリッド内の出現頻度に応じた彩色

![](assets/screenshot_florida_hex_majorityr.png?raw=true)

#### コマンド例

* クエリは水域・緑地・交通・ランドマークを色分けしたもの。上記スクリーンショットはフロリダ半島全体


```shell
$ npx -y -p splatone@latest crawler -p flickr -k "水域=canal,channel,waterway,river,stream,watercourse,sea,ocean,gulf,bay,strait,lagoon,offshore|緑地=forest,woods,turf,lawn,jungle,trees,rainforest,grove,savanna,steppe|交通=bridge,overpass,flyover,aqueduct,trestle,street,road,thoroughfare,roadway,avenue,boulevard,lane,alley,roadway,carriageway,highway,motorway|ランドマーク=church,chapel,cathedral,basilica,minster,temple,shrine,neon,theater,statue,museum,sculpture,zoo,aquarium,observatory" --vis-majority-hex --v-majority-hex-Hexapartite --p-flickr-APIKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
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

### Pie Charts: Hex中心にカテゴリ割合Pie Chartを描画

![](assets/screenshot_pie_tokyo.png?raw=true)

Hexセル中心に、カテゴリ比率を角度で、グローバル出現数を半径で示すPie Chartを描画します。カテゴリごとに円弧の半径が異なるため、同じHex内でも「世界的にどのカテゴリが多く集まったか」を直感的に比較できます。Pie Chart自体はHex境界内に収まるよう中央へ配置されます。

ズームイン／アウト時にはLeafletのzoomイベントをフックしてPie Chartを再描画し、現在の縮尺でもHex境界にフィットする半径が自動再計算されます。

#### コマンド例

* クエリは水域・交通・宗教施設・緑地を色分け。Hexサイズに応じて自動計算される最大半径を90%まで、最小半径をその40%に設定しています。

```shell
$ npx -y -p splatone@latest crawler -p flickr -k "水域#0947ff=canal,river,sea,strait,channel,waterway,pond|交通#aaaaaa=road,street,alley,sidewalk,bridge|宗教施設#ffb724=chapel,church,cathedral,temple,shrine|緑地#00a73d=forest,woods,trees,mountain,garden,turf" --vis-pie-charts --v-pie-charts-MaxRadiusScale=0.9 --v-pie-charts-MinRadiusScale=0.4 --p-flickr-APIKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

#### コマンドライン引数

| オプション                               | 説明                                                                                                          | 型   | デフォルト |
| :--------------------------------------- | :------------------------------------------------------------------------------------------------------------ | :--- | :--------- |
| `--v-pie-charts-MaxRadiusScale`          | Hex内接円半径に対する最大Pie半径の倍率(0-1.5)。1.0でHex境界いっぱい、0.9なら10%余白。                             | 数値 | 0.9        |
| `--v-pie-charts-MinRadiusScale`          | 最大半径に対する最小Pie半径の倍率(0-1)。カテゴリが存在する場合に確保する下限割合。                                 | 数値 | 0.25       |
| `--v-pie-charts-StrokeWidth`             | Pie Chart外周・扇形境界の線幅(px)。                                                                             | 数値 | 1          |
| `--v-pie-charts-BackgroundOpacity`       | 最大半径ガイドリングの塗り透明度(0-1)。背景リングの見え方を調整します。                                          | 数値 | 0.2        |

Pie Chartの最大・最小半径は各Hexのジオメトリから算出した内接円半径に基づき動的に決まり、カテゴリごとの扇形半径は「そのHex内カテゴリ出現数 ÷ 全カテゴリ総数」に比例して拡大します。グローバル最大カテゴリのシェアを1として正規化するため、Hex間でもカテゴリ規模を比較できます。

### Voronoi: Hex Gridをベースにしたボロノイ分割

Hex Gridで集約した各セル内のジオタグを種点としてVoronoi分割を行い、生成したポリゴンをHex境界でクリップして表示します。カテゴリカラーと総数はHex集計結果に基づき、最小間隔／最大サイト数の制御で過密な地域も読みやすく整列できます。

![](assets/screenshot_voronoi_tokyo.png?raw=true)

#### コマンド例

* クエリは水域・交通・宗教施設・緑地を色分けしたもの。Hex単位で50m以上離れたサイトだけをVoronoiセルとして採用します。上記の例は東京を範囲としたもの。皇居の緑地や墨田川の水域がよく現れている。

```shell
$ npx -y -p splatone@latest crawler -p flickr -k "水域#0947ff=canal,river,sea,strait,channel,waterway,pond|交通#aaaaaa=road,street,alley,sidewalk,bridge|宗教施設#ffb724=chapel,church,cathedral,temple,shrine|緑地#00a73d=forest,woods,trees,mountain,garden,turf" --vis-voronoi --v-voronoi-MinSiteSpacingMeters=50　--p-flickr-APIKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

#### コマンドライン引数

| オプション                                | 説明                                                                                      | 型   | デフォルト |
| :---------------------------------------- | :---------------------------------------------------------------------------------------- | :--- | :--------- |
| `--v-voronoi-MaxSitesPerHex`              | 1 HexあたりにPoissonサンプリングで残す最大サイト数。0のときは制限なし。                     | 数値 | 0          |
| `--v-voronoi-MinSiteSpacingMeters`        | Hex内の採用サイト間で確保する最小距離 (メートル)。ジオタグが密集していても空間的に均等化しつつ、MinSiteSpacingMeters範囲内で出現数の多いカテゴリを優先して残す。 | 数値 | 50         |

MinSiteSpacingMetersによる間引きは、各サイト周辺 (MinSiteSpacingMeters以内) の同カテゴリ出現数を優先度として利用するため、同距離内で競合した場合も局所的に密度の高いカテゴリのサイトが採用されやすくなります。一方で密度は低いが他の場所に比べて顕著に出現するカテゴリを見逃す可能性があります。なお、Voronoi図の作成は消費メモリが大きい為、デフォルトでは50m間隔に間引きます。厳密解が必要な場合は```--v-voronoi-MinSiteSpacingMeters=0```を指定してください。ただし、その場合はヒープを使い果たしてクラッシュする可能性があります。マシンパワーに余裕がある場合は```npx --node-options='--max-old-space-size=10240'```のようにヒープサイズを拡大して実行する事も可能です。もう一つのオプション```--v-voronoi-MaxSitesPerHex```はHex内の最大アイテム数を制限するものです。ポワソンサンプリングに基づいてアイテムを間引きます。MinSiteSpacingMetersと共に、適切な結果が得られるよう調整してください。

### DBSCAN: KDE等値線ポリゴンでクラスタを表示

HexGridに集約されたジオタグをカテゴリ毎にDBSCANクラスタリングし、そのクラスタ内部の点群に対してカーネル密度推定（KDE）を実施、指定した密度レベルの等値線を抽出してポリゴン化します。凸包よりも外形を忠実に再現しやすく、Eps/MinPtsでクラスタ粒度を、KernelScale/GridSize/ContourPercentで輪郭の滑らかさや閾値を制御できます。輪郭および塗りのスタイルも調整可能です。このVisualizerはクラスタの等高線を表示するだけですので、Bulkyと併用する事でジオタグも表示できます。

![](assets/screenshot_dbscan_kyoto.png?raw=true)

#### コマンド例
 
```shell
$ npx -y -p splatone@latest crawler -p flickr -k "水域#0947ff=canal,river,sea,strait,channel,waterway,pond|交通#aaaaaa=road,street,alley,sidewalk,bridge|宗教施設#ffb724=chapel,church,cathedral,temple,shrine|緑地#00a73d=forest,woods,trees,mountain,garden,turf" --vis-dbscan --v-dbscan-Eps=0.25　--v-dbscan-MinPts=4 --v-dbscan-KernelScale=0.4 --v-dbscan-GridSize=30 --v-dbscan-ContourPercent=0.05 --vis-bulky --p-flickr-APIKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

#### コマンドライン引数

| オプション | 説明 | 型 | デフォルト |
| :-- | :-- | :-- | :-- |
| `--v-dbscan-Eps` | DBSCANのeps（距離半径）。Unitsで指定した単位を使用 | 数値 | 0.6 |
| `--v-dbscan-MinPts` | クラスタとして扱うために必要な最小ポイント数 | 数値 | 6 |
| `--v-dbscan-Units` | epsの距離単位（kilometers/meters/miles） | 文字列 | kilometers |
| `--v-dbscan-StrokeWidth` | ポリゴン輪郭の太さ | 数値 | 2 |
| `--v-dbscan-StrokeOpacity` | ポリゴン輪郭の透明度 | 数値 | 0.9 |
| `--v-dbscan-FillOpacity` | ポリゴン塗りの透明度 | 数値 | 0.35 |
| `--v-dbscan-DashArray` | LeafletのdashArray指定（例: `"4 6"`）。空文字で実線 | 文字列 | (空) |
| `--v-dbscan-KernelScale` | KDEカーネル半径をepsの何倍にするか（0.1〜10） | 数値 | 1 |
| `--v-dbscan-GridSize` | KDEグリッドの長辺方向セル数（8〜256） | 数値 | 80 |
| `--v-dbscan-ContourPercent` | 最大密度に対する等値線レベル（0.05〜0.95） | 数値 | 0.4 |

## キーワード指定方法

キーワードとはソーシャルデータを検索する単語の事で、複数のキーワードをしていする事で、地理的な出現頻度・分散を比較できます。

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
npx -y -p splatone@latest color <count> <sets>
# 例: 6色を3セット生成（ターミナルに色付きで表示）
npx -y -p splatone@latest color 6 3
```

- ブラウザでプレビューするか聞かれるのでYとすると、ブラウザ上で実際の色が確認できます。
  - カラーピッカーになっていますので、微調整も可能です。
  - カラーコードをクリックするとコピーされます。

![](assets/screenshot_color_picker.png?raw=true)

- オプション:
  - `--no-ansi` : ANSI カラーシーケンスを出力せず、プレーンなカンマ区切りの HEX を出力します（パイプやログ向け）。

```bash
npx -y -p splatone@latest color --no-ansi 6 3
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
### 広範囲なデータ収集例

* クエリ数はおおよそ1 query/secに調整されますので、時間はかかりますが大量のデータを収集する事も可能です。

![](/assets/screenshot_massive_points_bulky.png)