//targets[sessionId] = { hex: hexFC, triangles: trianglesFC, categories, splatonePalette };
//
function addGeoJSONLayer(map, geojson, options = {}) {
    if (!map || !geojson) return null;

    // GeoJSON レイヤを作成
    const geojsonLayer = L.geoJSON(geojson, {
        pointToLayer: options.pointToLayer,
        onEachFeature: options.onEachFeature,
    });
    geojsonLayer.addTo(map);
    return geojsonLayer;
}

function setAt(obj, path, value) {
    if (path.length === 0) return value;
    let cur = obj;
    for (let i = 0; i < path.length - 1; i++) {
        const k = path[i];
        const nextK = path[i + 1];
        if (cur[k] == null) {
            // 次のキーが数値なら []、文字なら {}
            cur[k] = Number.isInteger(nextK) ? [] : {};
        }
        cur = cur[k];
    }
    cur[path[path.length - 1]] = value;
    return obj;
}
/*
使用例:
const layer = addGeoJSONLayer(map, myGeoJSON, {
    style: f => ({ color: f.properties.color || '#3388ff', weight: 2 }),
    popupProperty: f => `name: ${f.properties.name}`,
});
*/

function loadAsset(url) {
    const clean = String(url).split('#')[0].split('?')[0].toLowerCase();

    if (clean.endsWith('.css')) {
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = url;
            link.onload = () => resolve(link);
            link.onerror = () => reject(new Error(`CSS load failed: ${url}`));
            document.head.appendChild(link);
        });
    }

    if (clean.endsWith('.js') || clean.endsWith('.mjs')) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.type = 'module';
            s.src = url;
            s.onload = () => resolve(s);
            s.onerror = () => reject(new Error(`JS load failed: ${url}`));
            document.head.appendChild(s);
        });
    }

    return Promise.reject(new Error(`Unsupported extension: ${url}`));
}