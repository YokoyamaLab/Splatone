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

async function fetchJsonObject(url, { signal } = {}) {
    const res = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        // same-originのときは不要。CORS越えならサーバ側のCORS許可が必要
        signal,
        cache: 'no-cache', // 必要なら更新を強制
    });

    if (!res.ok) {
        // ステータスコード付きで例外
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    }

    // 自動で JSON parse され、JSオブジェクトになる
    return await res.json();
}

/**
 * 指定のサーバ上パス (filePath) から JSON を取得し、
 * ブラウザで downloadFileName という名前でダウンロードさせる。
 *
 * @param {string} downloadFileName - 例: "data.geojson" / "result.json"
 * @param {string} filePath - 例: "/public/out/data.geojson" or "https://example.com/data.json"
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=15000] - タイムアウト(ms)
 * @param {RequestInit} [opts.fetchInit] - fetch の追加オプション（ヘッダ/credentials等）
 */
async function downloadJSONFile(downloadFileName, filePath, opts = {}) {
  const { timeoutMs = 15000, fetchInit = {} } = opts;

  // タイムアウト制御
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error('timeout')), timeoutMs);

  try {
    const res = await fetch(filePath, {
      method: 'GET',
      headers: { 'Accept': 'application/json', ...(fetchInit.headers || {}) },
      signal: ac.signal,
      // CORS が必要なら credentials / mode などを fetchInit で渡す（例: { credentials: 'include' }）
      ...fetchInit,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${filePath}`);
    }

    // そのまま Blob 化（JSON で返ってくる想定）
    // MIME が不正のときもこちらで application/json に寄せる
    const blob = await res.blob();
    const type = res.headers.get('content-type');
    const jsonBlob = type && type.includes('application/json')
      ? blob
      : new Blob([await blob.arrayBuffer()], { type: 'application/json;charset=utf-8' });

    const url = URL.createObjectURL(jsonBlob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadFileName; // ダウンロード名を強制
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      // 生成したオブジェクトURLは必ず破棄
      URL.revokeObjectURL(url);
    }
  } finally {
    clearTimeout(timer);
  }
}
