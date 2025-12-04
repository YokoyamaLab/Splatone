# Splatone Examples Viewer

```shell
npx -y -p splatone@latest crawler -p flickr --help
```

## Visualizer比較用コマンドと結果 - 東京タワーとスカイツリー

### DBSCAN

- 問い合わせコマンド
```shell
npx -y -p splatone@latest crawler -p flickr \
-k "東京タワー#FA0000=tokyotower,東京タワー|スカイツリー#2B89EE=skytree,スカイツリー" \
--vis-dbscan \
--v-dbscan-MinPts=30 --v-dbscan-Eps=1 \
--ui-cell-size 1 --ui-units kilometers \
--ui-bbox 139.63829,35.568818,139.950027,35.739825
```

- 結果閲覧コマンド
```shell
npx -y -p splatone@latest browse \
--browse-load-url="https://github.com/YokoyamaLab/Splatone/blob/main/assets/tower-dbscan.json?raw=true"
```