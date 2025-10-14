import express from 'express';
import open from 'open';
import { hexGrid, centroid, featureCollection, polygon } from '@turf/turf';

const app = express();
const port = 3000;

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', './views');

// 初期中心（東京駅）
const DEFAULT_CENTER = { lat: 35.681236, lon: 139.767125 };

// 座標をエッジキー用に丸め＆正規化（無向）
function edgeKey(a, b, digits = 6) {
  const fmt = ([lon, lat]) => `${lon.toFixed(digits)},${lat.toFixed(digits)}`;
  const k1 = `${fmt(a)}|${fmt(b)}`;
  const k2 = `${fmt(b)}|${fmt(a)}`;
  return k1 < k2 ? k1 : k2;
}

/**
 * /api/hexgrid
 *  クエリ:
 *    bbox: "minLon,minLat,maxLon,maxLat"
 *    cellSize: 数値
 *    units: "kilometers" | "meters" | "miles" など
 *
 *  返り値:
 *    {
 *      hex: FeatureCollection<Polygon, { hexId:number, triIds:string[] }>,
 *      triangles: FeatureCollection<Polygon, {
 *        parentHexId:number,
 *        triInHex:number,
 *        triangleId:string,
 *        crossNeighbors:string[],     // 共有辺を持つ他Hexの三角形IDs
 *        neighborHexIds:number[]      // 隣接する他HexのID
 *      }>
 *    }
 */
app.get('/api/hexgrid', (req, res) => {
  try {
    const { bbox, cellSize = '0.5', units = 'kilometers' } = req.query;

    const fallbackBbox = [139.55, 35.53, 139.92, 35.80];
    let bboxArray = fallbackBbox;

    if (bbox) {
      const parts = String(bbox).split(',').map(Number);
      if (parts.length !== 4 || !parts.every(Number.isFinite)) {
        return res.status(400).json({ error: 'bbox must be "minLon,minLat,maxLon,maxLat"' });
      }
      bboxArray = parts;
    }

    const sizeNum = Number(cellSize);
    if (!Number.isFinite(sizeNum) || sizeNum <= 0) {
      return res.status(400).json({ error: 'cellSize must be a positive number' });
    }

    // HexGrid 生成
    const hexFC = hexGrid(bboxArray, sizeNum, { units });
    hexFC.features.forEach((f, i) => {
      f.properties = { hexId: i + 1, triIds: [] };
    });

    // 三角形生成（扇形分割）＋ エッジ索引作成
    const triFeatures = [];
    const edgeToTriangles = new Map(); // edgeKey -> [{ triangleId, parentHexId }]
    for (const f of hexFC.features) {
      if (!f.geometry || f.geometry.type !== 'Polygon') continue;
      const ring = f.geometry.coordinates[0];
      if (!ring || ring.length < 4) continue;

      const c = centroid(f).geometry.coordinates; // [lon,lat]
      const hexId = f.properties.hexId;

      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % (ring.length - 1)];
        const triIndex = i + 1;
        const triangleId = `${hexId}-${triIndex}`;

        // 三角形ポリゴン（a-b-c）
        const tri = polygon([[a, b, c, a]], {
          parentHexId: hexId,
          triInHex: triIndex,
          triangleId
        });

        // 親Hexへ登録
        f.properties.triIds.push(triangleId);
        triFeatures.push(tri);

        // “境界辺”キー（a-b）で索引（cは共有しない）
        const k = edgeKey(a, b);
        if (!edgeToTriangles.has(k)) edgeToTriangles.set(k, []);
        edgeToTriangles.get(k).push({ triangleId, parentHexId: hexId });
      }
    }

    // 交差隣接（共有辺で、かつ他Hexの三角形）を付与
    const triIndex = new Map(triFeatures.map(t => [t.properties.triangleId, t]));
    for (const list of edgeToTriangles.values()) {
      if (list.length < 2) continue; // 共有していなければ隣接なし
      // 同じ辺を共有する全三角形同士で、異なるHexのものを相互に登録
      for (let i = 0; i < list.length; i++) {
        for (let j = 0; j < list.length; j++) {
          if (i === j) continue;
          const a = list[i], b = list[j];
          if (a.parentHexId === b.parentHexId) continue; // 同Hexは除外
          const triA = triIndex.get(a.triangleId);
          const triB = triIndex.get(b.triangleId);
          if (!triA || !triB) continue;

          triA.properties.crossNeighbors ??= [];
          triA.properties.neighborHexIds ??= [];
          if (!triA.properties.crossNeighbors.includes(b.triangleId)) {
            triA.properties.crossNeighbors.push(b.triangleId);
          }
          if (!triA.properties.neighborHexIds.includes(b.parentHexId)) {
            triA.properties.neighborHexIds.push(b.parentHexId);
          }
        }
      }
    }

    const trianglesFC = featureCollection(triFeatures);

    res.json({ hex: hexFC, triangles: trianglesFC });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to build hexgrid' });
  }
});

// 画面
app.get('/', (_req, res) => {
  res.render('index', {
    title: 'Tokyo Hexgrid + Triangle Adjacency (Hamburger Panel)',
    lat: DEFAULT_CENTER.lat,
    lon: DEFAULT_CENTER.lon,
    defaultCellSize: 0.5,
    defaultUnits: 'kilometers'
  });
});

app.listen(port, async () => {
  console.log(`Server running at http://localhost:${port}`);
  await open(`http://localhost:${port}`);
});
