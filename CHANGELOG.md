# Splatone Change Log

## Versions

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
    * デフォルト値:　```date_upload,date_taken,owner_name,geo,url_s,tags```
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