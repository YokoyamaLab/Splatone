// Node core
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, dirname } from 'node:path';

// Third-party
import express from 'express';
import open from 'open';
import Piscina from 'piscina';
import uniqid from 'uniqid';
import { Server as IOServer } from 'socket.io';
import { centroid, featureCollection, hexGrid, polygon } from '@turf/turf';

// Local
import { loadPlugins } from './pluginLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


/* DEBUG用　Flickr API Key読み込み */
async function loadFlickrKey() {
  const raw = await readFile(".API_KEY.Flickr", "utf8");
  const FLICKR_API_KEY = raw.trim(); // 両端の空白・改行を除去
  return FLICKR_API_KEY;
}
const FLICKR_API_KEY = await loadFlickrKey();

const app = express();
const port = 3000;
const title = 'Splatone - Multi-Layer Composite Heatmap Viewer';
const crawlers = {};
const targets = {};
// 初期中心（東京駅）
const DEFAULT_CENTER = { lat: 35.681236, lon: 139.767125 };

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', './views');

const server = http.createServer(app);
const io = new IOServer(server, {
  path: "/socket"
});

// 購読のユーティリティ
const bus = new EventEmitter();
async function subscribe(topic, handler) {
  bus.on(topic, handler);
  return () => bus.off(topic, handler); // unsubscribe
}

// 座標をエッジキー用に丸め＆正規化（無向）
function edgeKey(a, b, digits = 6) {
  const fmt = ([lon, lat]) => `${lon.toFixed(digits)},${lat.toFixed(digits)}`;
  const k1 = `${fmt(a)}|${fmt(b)}`;
  const k2 = `${fmt(b)}|${fmt(a)}`;
  return k1 < k2 ? k1 : k2;
}

function toMySQLDatetime(date = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return [
    date.getFullYear(),
    p(date.getMonth() + 1),
    p(date.getDate())
  ].join('-') + ' ' + [
    p(date.getHours()),
    p(date.getMinutes()),
    p(date.getSeconds())
  ].join(':');
}

function concatFC(fc1, fc2) {
  return featureCollection([
    ...(fc1?.features ?? []),
    ...(fc2?.features ?? []),
  ]);
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

// 画面
app.get('/', (_req, res) => {
  res.render('index', {
    title: title,
    lat: DEFAULT_CENTER.lat,
    lon: DEFAULT_CENTER.lon,
    defaultCellSize: 0.5,
    defaultUnits: 'kilometers',
    defaultKeywords: 'food,drink,restaurant,cafe,bar|museum,art,exhibition,expo,sculpture,heritage|park,garden,flower,green,pond',
  });
});


io.on("connection", (socket) => {
  //console.log("connected:", socket.id);
  const sessionId = uniqid();
  crawlers[sessionId] = {};
  socket.join(sessionId);

  socket.on("disconnecting", () => {
    if (socket.rooms && crawlers.hasOwnProperty(socket.rooms)) {
      //console.log("delete session:", socket.rooms);
      delete crawlers[socket.rooms];
    }
    //console.log("disconnected:", socket.id);
  });

  //console.log("Welcome:", socket.id, "sessionId:", sessionId);
  socket.emit("welcome", { socketId: socket.id, sessionId: sessionId, time: Date.now() });
  //クローリング開始
  socket.on("crawling", async (req) => {
    try {
      if (sessionId !== req.sessionId) {
        console.warn("invalid sessionId:", req.sessionId);
        return;
      }
      await pm.call('flickr', 'crawl', {
        hexGrid: targets[req.sessionId].hex,
        triangles: targets[req.sessionId].triangles,
        sessionId: req.sessionId,
        tags: targets[req.sessionId].tags,
        max_upload_date: toMySQLDatetime(),
      });
    }
    catch (e) {
      console.error(e);
      //res.status(500).json({ error: 'failed to build hexgrid' });
      socket.emit("error ", { error: 'failed to crawling' });
    }
  });
  // クロール範囲指定
  socket.on("target", (req) => {
    try {
      //console.log("target:", req);
      if (sessionId !== req.sessionId) {
        console.warn("invalid sessionId:", req.sessionId);
        return;
      }
      const { bbox, cellSize = '0.5', units = 'kilometers', tags = 'sea,beach|mountain,forest' } = req.query;

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
      //console.log(JSON.stringify(hexFC, null, 2));
      //res.json({ hex: hexFC, triangles: trianglesFC });
      targets[sessionId] = { hex: hexFC, triangles: trianglesFC, tags: tags };
      socket.emit("hexgrid", { hex: hexFC, triangles: trianglesFC });
    } catch (e) {
      console.error(e);
      //res.status(500).json({ error: 'failed to build hexgrid' });
      if (sessionId in targets) delete targets[sessionId];
      socket.emit("error ", { error: 'failed to build hexgrid' });
    }

  });
});

const api = {
  log: (...a) => console.log('[app]', ...a),
  emit: (topic, payload) => bus.emit(topic, payload), // 重要
  getPlugin: (id) => pm.get(id),
};

const pm = await loadPlugins({
  dir: './plugins',
  api,
  optionsById: {
    flickr: { API_KEY: FLICKR_API_KEY }, // プラグイン固有オプションがあれば
  },
});
//console.log('loaded:', pm.list());

const resolvedWorkerFilename = {};
function resolveWorkerFilename(taskName) {
  if (!resolvedWorkerFilename[taskName]) {
    // できれば workers/<taskName>/worker.mjs のように ESM に統一
    const filePath = resolve(__dirname, "plugins", taskName, "worker.js");
    if (!existsSync(filePath)) {
      // URL はログ用途のみ。Piscinaへはこの後 href を渡す
      const url = pathToFileURL(filePath).href;
      throw new Error(`Worker not found for task="${taskName}" at ${url}`);
    }
    // ★ Piscina には file URL を渡す（href 文字列 or URL オブジェクト）
    resolvedWorkerFilename[taskName] = pathToFileURL(filePath).href;
  }
  return resolvedWorkerFilename[taskName];
}

const statsItems = (crawler) => {
  const stats = [];
  for (const [hexId, tagsObj] of Object.entries(crawler)) {
    for (const [tags, items] of Object.entries(tagsObj)) {
      for (const item of items.items.features) {
        //console.log(item.properties)
        stats[hexId] ??= [];
        stats[hexId][item.properties.splatone_triId] ??= [];
        stats[hexId][item.properties.splatone_triId][tags.split(',')[0]] ??= 0;
        stats[hexId][item.properties.splatone_triId][tags.split(',')[0]] += 1;
      }
    }
  }
  return stats;
};

export async function runTask(taskName, data) {
  const filename = resolveWorkerFilename(taskName); // ← file URL (href)
  // named export を呼ぶ場合は { name: "関数名" } を追加
  return piscina.run(data, { filename });
}

const piscina = new Piscina({
  minThreads: 1,
  maxThreads: Math.max(1, Math.min(4, os.cpus().length)),
  idleTimeout: 10_000,
  // 注意：ここで filename は渡さない。run 時に切り替える
});

const off = await subscribe('splatone:start', async p => {
  //console.log('[splatone:start]', p);
  const rtn = await runTask(p.plugin, p);
  //console.log('[splatone:done]', p.plugin, rtn.photos.features.length,"photos are collected in hex",rtn.hexId,"tags:",rtn.tags,"final:",rtn.final);
  crawlers[p.sessionId][rtn.hexId] ??= {};
  crawlers[p.sessionId][rtn.hexId][rtn.tags] ??= {items:featureCollection([])};
  crawlers[p.sessionId][rtn.hexId][rtn.tags].final = rtn.final;
  crawlers[p.sessionId][rtn.hexId][rtn.tags].items = concatFC(crawlers[p.sessionId][rtn.hexId][rtn.tags].items, rtn.photos);
  //console.log(crawlers[p.sessionId]);
  console.table(statsItems(crawlers[p.sessionId]))
  if (!rtn.final) {
    // 次回クロール用に更新
    p.max_upload_date = rtn.next_max_upload_date;
    //console.log("next max_upload_date:", p.max_upload_date);
    api.emit('splatone:start', p);
  }
});

server.listen(port, async () => {
  //console.log(`Server running at http://localhost:${port}`);
  await open(`http://localhost:${port}`);
});

process.on('SIGINT', async () => { await pm.stopAll(); process.exit(0); });