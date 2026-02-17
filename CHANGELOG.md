# Splatone Change Log

## Versions### <a name='v0.0.32v0.0.33'></a>v0.0.32 → v0.0.33

* Google Maps Place APIからvenueをクローリングするProviderを実装: ```-p gmap```
* OpenStreetMap Overpass APIからvenueをクローリングするProviderを実装: ```-p overpass```

### <a name='v0.0.29v0.0.32'></a>v0.0.29 → → v0.0.32

* BrowseモードにURL読み込み機能(デモモード)追加
  * GitHub上に東京タワーとスカイツリーを例としてすべての可視化結果を掲載
* gmapプロバイダ追加: Google Places Text Search APIから地点を取得
* overpassプロバイダ追加: Overpass APIからOpenStreetMapのPOIを取得

### <a name='v0.0.28v0.0.29'></a>v0.0.28 → v0.0.29

* ```--city```の追加
  * ブラウザがデフォルトで表示する都市を指定できます
  * 例: ```--city="Tokyo"```

### <a name='v0.0.23v0.0.28'></a>v0.0.23 → →　v0.0.28

* Flickrプロバイダ
  * GimmeGimmeモード追加: Flickrから画像を指定ディレクトリにダウンロード
* Bulkeyビジュアライザ
  * PointMarkerをクリックしてFlickrの当該写真のページへ飛ぶ
* NPX起動時にproverderやoutが読み込まれない問題を解決

### <a name='v0.0.22v0.0.23'></a>v0.0.22 → →　v0.0.23

* ブラウズモードの追加
  * ダウンロードした結果ファイルを閲覧するモード
  * ハンバーガーメニューの拡充
    * 結果の統計情報の追加
    * CLIコマンドの表示
* **[可視化モジュール]** `--vis-dbscan` 追加
  * DBSCANクラスタリング結果を凸包ポリゴンで可視化
* カラーパレット生成ツールの改良
  * ブラウザ上でカラーの確認と調整を可能に

### <a name='v0.0.18v0.0.22'></a>v0.0.18 → →　v0.0.22

* **[可視化モジュール]** ```--vis-voronoi```追加
  * ボロノイ図の生成
* **[可視化モジュール]** ```--vis-pie-charts```追加
  * Hex中心のカテゴリ割合Pie Chart描画
* **[Bulky]** マーカークリックでFlickr写真ページを別タブで開くように改善
* マイナーBug Fix

### <a name='v0.0.17v0.0.18'></a>v0.0.17 →　v0.0.18

* **[可視化モジュール]** ```--vis-heat```追加
  * ヒートマップの生成

### <a name='v0.0.13v0.0.17'></a>v0.0.13 → →　v0.0.17

* **[可視化モジュール]** ```--vis-majority-hex```追加
* 結果の色固定機能追加 (キーワード指定方法を参照の事)
* [Bug Fix] npxが起動しない事象の修正

### <a name='v0.0.12v0.0.13'></a>v0.0.12 →　v0.0.13

* BulkyのPointMarkerのサイズや透明度を可変に
  * コマンドライン引数で指定 (詳しくは```  npx -y -p splatone@latest crawler --help```)
  
### v0.0.11 →　v0.0.12

* Bottleneckを導入しクエリ間隔を適正値に調整 (3 queries/ 3 sec.)
* 時間軸分割並列処理のデフォルト化
  * 地理的分割に加えて大量の結果がある場所は時間軸でもクエリを分解する
  * 無効にするときは```--no-p-flickr-Haste```を付与

### v0.0.10 →　v0.0.11 

* 時間軸として使用する日付を選択可能に (```--p-flickr-DateMode```)
  * upload: Flickrにアップロードされたタイムスタンプを遡ってクローリング (デフォルト)
  * taken: 写真の撮影日時を遡ってクローリング
* extrasを指定可能に (```--p-flickr-Extras```)
    * https://www.flickr.com/services/api/explore/flickr.photos.search
    * デフォルト値:　```date_upload,date_taken,owner_name,geo,url_sq,tags```
      * これらはコマンドライン引数での指定の有無に関わらず付与されます
* 自動指定時のHexGridの最小サイズを0.5kmに
* [Bug Fix] 時間軸並列機能のバグ修正

### v0.0.8 →　v0.0.9 →　v0.0.10 

* 【重要】**APIキー**の指定方法が変わりました。
  * ```--p-flickr-APIKEY```オプションを使います。
* クエリを時間方向でも分割し効率化しました。(使い方に変更はありません)


### v0.0.7 →　v0.0.8 

* 範囲指定とHexGridの表示・非表示ができるようになりました。
  * デフォルトで非表示
  * 表示したい場合はレイヤコントロールにて切り替えてください

### v0.0.6 →　v0.0.7

* Hexサイズの自動設定モードが実装され、デフォルトとなりました。
  * Web画面のハンバーガーメニューから変更できます。(サイズ0で自動)