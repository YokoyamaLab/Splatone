# Splatone Examples Viewer

このページでは実行済み可視化例を掲載している。

- 問い合わせコマンド: APIKEYを差し替える事でご自身でクローリングから行えます。
- 結果閲覧コマンド: すでにクローリングした結果を閲覧するコマンドです。APPIKEYは必要ありません。
- 結果スクリーンショット: 可視化結果のスクリーンショットです。インタラクティブな操作はできません。

## Visualizer比較用コマンドと結果 - 東京タワーとスカイツリー

### Bulky Cluster

- 問い合わせコマンド
```shell
npx -y -p splatone@latest crawler -p flickr \
-k "東京タワー#FA0000=tokyotower,東京タワー|スカイツリー#2B89EE=skytree,スカイツリー" \
--vis-bulky \
--ui-cell-size 1 --ui-units kilometers \
--ui-bbox 139.63829,35.568818,139.950027,35.739825 \
--p-flickr-APIKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

- 結果閲覧コマンド
```shell
npx -y -p splatone@latest browse \
--browse-load-url="https://raw.githubusercontent.com/YokoyamaLab/Splatone/refs/heads/main/examples/tower-bulky.json"
```

- 結果スクリーンショット

![](tower-bulky.png)

### Marker Cluster

- 問い合わせコマンド
```shell
npx -y -p splatone@latest crawler -p flickr \
-k "東京タワー#FA0000=tokyotower,東京タワー|スカイツリー#2B89EE=skytree,スカイツリー" \
--vis-marker-cluster \
--ui-cell-size 1 --ui-units kilometers \
--ui-bbox 139.63829,35.568818,139.950027,35.739825 \
--p-flickr-APIKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

- 結果閲覧コマンド
```shell
npx -y -p splatone@latest browse \
--browse-load-url="https://raw.githubusercontent.com/YokoyamaLab/Splatone/refs/heads/main/examples/tower-cluster.json"
```

- 結果スクリーンショット

![](tower-cluster.png)



### Voronoi

- 問い合わせコマンド
```shell
npx -y -p splatone@latest crawler -p flickr \
-k "東京タワー#FA0000=tokyotower,東京タワー|スカイツリー#2B89EE=skytree,スカイツリー" \
--vis-voronoi \
--ui-cell-size 1 --ui-units kilometers \
--ui-bbox 139.63829,35.568818,139.950027,35.739825 \
--p-flickr-APIKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

- 結果閲覧コマンド
```shell
npx -y -p splatone@latest browse \
--browse-load-url="https://raw.githubusercontent.com/YokoyamaLab/Splatone/refs/heads/main/examples/tower-voronoi.json"
```

- 結果スクリーンショット

![](tower-voronoi.png)



### Pie Charts

- 問い合わせコマンド
```shell
npx -y -p splatone@latest crawler -p flickr \
-k "東京タワー#FA0000=tokyotower,東京タワー|スカイツリー#2B89EE=skytree,スカイツリー" \
--vis-pie-charts \
--ui-cell-size 1 --ui-units kilometers \
--ui-bbox 139.63829,35.568818,139.950027,35.739825 \
--p-flickr-APIKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

- 結果閲覧コマンド
```shell
npx -y -p splatone@latest browse \
--browse-load-url="https://raw.githubusercontent.com/YokoyamaLab/Splatone/refs/heads/main/examples/tower-pie.json"
```

- 結果スクリーンショット

![](tower-pie.png)


### Majority Hex

- 問い合わせコマンド
```shell
npx -y -p splatone@latest crawler -p flickr \
-k "東京タワー#FA0000=tokyotower,東京タワー|スカイツリー#2B89EE=skytree,スカイツリー" \
--vis-majority-hex \
--ui-cell-size 1 --ui-units kilometers \
--ui-bbox 139.63829,35.568818,139.950027,35.739825 \
--p-flickr-APIKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

- 結果閲覧コマンド
```shell
npx -y -p splatone@latest browse \
--browse-load-url="https://raw.githubusercontent.com/YokoyamaLab/Splatone/refs/heads/main/examples/tower-hex.json"
```

- 結果スクリーンショット

![](tower-hex.png)

### Majority Hex (Hexapartite)

- 問い合わせコマンド
```shell
npx -y -p splatone@latest crawler -p flickr \
-k "東京タワー#FA0000=tokyotower,東京タワー|スカイツリー#2B89EE=skytree,スカイツリー" \
--vis-majority-hex --v-majority-hex-Hexapartite \
--ui-cell-size 1 --ui-units kilometers \
--ui-bbox 139.63829,35.568818,139.950027,35.739825 \
--p-flickr-APIKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

- 結果閲覧コマンド
```shell
npx -y -p splatone@latest browse \
--browse-load-url="https://raw.githubusercontent.com/YokoyamaLab/Splatone/refs/heads/main/examples/tower-hexapartite.json"
```

- 結果スクリーンショット

![](tower-hexapartite.png)


### Heatmap

- 問い合わせコマンド
```shell
npx -y -p splatone@latest crawler -p flickr \
-k "東京タワー#FA0000=tokyotower,東京タワー|スカイツリー#2B89EE=skytree,スカイツリー" \
--vis-heat \
--v-heat-Radius=250 \
--ui-cell-size 1 --ui-units kilometers \
--ui-bbox 139.63829,35.568818,139.950027,35.739825 \
--p-flickr-APIKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

- 結果閲覧コマンド
```shell
npx -y -p splatone@latest browse \
--browse-load-url="https://raw.githubusercontent.com/YokoyamaLab/Splatone/refs/heads/main/examples/tower-heat.json"
```

- 結果スクリーンショット

![](tower-heat.png)



### DBSCAN

- 問い合わせコマンド
```shell
npx -y -p splatone@latest crawler -p flickr \
-k "東京タワー#FA0000=tokyotower,東京タワー|スカイツリー#2B89EE=skytree,スカイツリー" \
--vis-dbscan \
--v-dbscan-MinPts=30 --v-dbscan-Eps=1 \
--ui-cell-size 1 --ui-units kilometers \
--ui-bbox 139.63829,35.568818,139.950027,35.739825 \
--p-flickr-APIKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
```

- 結果閲覧コマンド
```shell
npx -y -p splatone@latest browse \
--browse-load-url="https://raw.githubusercontent.com/YokoyamaLab/Splatone/refs/heads/main/examples/tower-dbscan.json"
```

- 結果スクリーンショット

![](tower-dbscan.png)