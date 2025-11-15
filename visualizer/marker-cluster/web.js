let booted = false;
export default async function main(map, geojson, options = { palette: {}, visOptions: {} }) {
    if (booted) return;
    booted = true;

    console.log("[VIS OPTIONS]", options.visOptions);

    const urls = [
        'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
        'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
        'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
        './visualizer/marker-cluster/public/style.css',
    ];

    try {
        await Promise.all(urls.map(loadAsset));
        console.log('すべて読み込み完了！');
    } catch (err) {
        console.error('どれかの読み込みに失敗:', err);
    }

    const categoryColors = new Map();
    for (const cat in options.palette) {
        categoryColors.set(cat, options.palette[cat]);
    }

    const clusterByCategory = new Map(); // category -> L.MarkerClusterGroup
    const overlaysForControl = {};
    function getOrCreateCluster(category) {
        if (clusterByCategory.has(category)) return clusterByCategory.get(category);

        const { color, darken, brighten } = categoryColors.get(category);

        // カスタム iconCreateFunction（色違いの泡）
        const group = L.markerClusterGroup({
            chunkedLoading: true,
            disableClusteringAtZoom: 18,
            maxClusterRadius:  options.visOptions.MaxClusterRadius,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            iconCreateFunction: (cluster) => {
                const count = cluster.getChildCount();
                const size = count >= 100 ? 48 : (count >= 10 ? 40 : 32);
                const html = `<div style="
            width:${size}px;height:${size}px;border-radius:50%;border:3px double ${darken};
            background:${color}aa; color:${brighten}; display:flex;
            text-shadow: 1px 1px 0px ${darken}, -1px -1px 0px ${darken},
                        -1px 1px 0px ${darken},  1px -1px 0px ${darken},
                         0px 1px 0px ${darken},  0px -1px 0px ${darken},
                        -1px 0px 0px ${darken},  1px  0px 0px ${darken};
            align-items:center; justify-content:center; font-weight:bold;">
            ${count}</div>`;
                return L.divIcon({
                    html, className: 'marker-cluster cluster-cat', iconSize: L.point(size, size)
                });
            }
        });

        clusterByCategory.set(category, group);
        // レイヤコントロールに追加（カテゴリ名をラベルに）
        overlaysForControl[`MarkerCluster: ${category}`] = group;
        return group;
    }
    // ====== Feature をマーカー（代表点）に変換 ======
    function featureToMarkers(feature) {
        const g = feature.geometry;
        const markers = [];
        if (!g) return markers;

        // マーカーを作るユーティリティ
        const addMarker = (lng, lat) => {
            const props = feature.properties ?? {};
            const name = props.name ?? '(no name)';
            const cat = props.category ?? 'uncategorized';
            const { color, darken, brighten } = categoryColors.get(cat);
            const m = L.marker([lat, lng], {
                // 見た目を点寄りにしたい場合は小さな divIcon にしてもOK
                icon: L.divIcon({
                    className: '', html: `<div style="
                    width:8px;height:8px;border-radius:50%;
                    background:${color}aa;
                    border:1px solid ${darken};"
                ></div>`, iconSize: [8, 8]
                })
            });
            m.bindPopup(`<b>${name}</b><br/>category: ${cat}<br/>${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`);
            markers.push(m);
        };

        switch (g.type) {
            case 'Point': {
                const [lng, lat] = g.coordinates;
                addMarker(lng, lat);
                break;
            }
            case 'MultiPoint': {
                for (const [lng, lat] of g.coordinates) addMarker(lng, lat);
                break;
            }
            default: {
                // Polygon/LineString 系は代表点化（重心が外へ出ることがあるため pointOnFeature を採用）
                try {
                    const pof = turf.pointOnFeature(feature);
                    const [lng, lat] = pof.geometry.coordinates;
                    addMarker(lng, lat);
                } catch (e) {
                    console.warn('pointOnFeature failed:', e, feature);
                }
            }
        }
        return markers;
    }

    // ====== 追加処理：カテゴリ別にクラスタへ投入 ======
    function addFeatureCollectionByCategory(featureCollection, categoryKey = 'category') {
        const bounds = L.latLngBounds();

        for (const f of featureCollection.features ?? []) {
            const category = f.properties.category;
            const cluster = getOrCreateCluster(category);
            const markers = featureToMarkers(f);
            if (markers.length) {
                cluster.addLayers(markers);
                for (const m of markers) bounds.extend(m.getLatLng());
            }
        }

        // まだマップに載っていないクラスターは載せる
        for (const [cat, grp] of clusterByCategory.entries()) {
            //console.log("add map", cat);
            if (!map.hasLayer(grp)) grp.addTo(map);
        }

        /*
                if (!layerControl) {
                    layerControl = L.control.layers({}, overlaysForControl, { collapsed: false }).addTo(map);
                } else {
                    // 既存コントロールにも反映（念のため）
                    layerControl.remove();
                    layerControl = L.control.layers({}, overlaysForControl, { collapsed: false }).addTo(map);
                }
        */
        //if (bounds.isValid()) map.fitBounds(bounds.pad(0.1));
        //renderLegend();
    }

    // ====== 凡例 ======
    function renderLegend() {
        const el = document.getElementById('map_legend');
        el.innerHTML = '<div style="font-weight:700;margin-bottom:4px;">Categories</div>';
        for (const [cat, color] of categoryColors.entries()) {
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.innerHTML = `<span class="legend-swatch" style="background:${color}"></span><span>${cat}</span>`;
            el.appendChild(item);
        }
    }
    let layerControl = null;

    // 実データを投入（fetchで置き換え可）
    for (const cat in geojson) {
        //console.log(cat);
        addFeatureCollectionByCategory(geojson[cat], cat);
    }
    // Mapから単なるObjectへ
    return Object.fromEntries(clusterByCategory);
}