#!/usr/bin/env node

// -------------------------------
// Node.js core (ESM)
// -------------------------------
import http from 'node:http';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import path, { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs, { existsSync, writeFileSync, constants } from 'node:fs';
import { access, readdir, readFile } from 'node:fs/promises';
import { MessageChannel } from 'worker_threads';

// -------------------------------
// Third-party
// -------------------------------
import Bottleneck from 'bottleneck';
import express from 'express';
import open from 'open';
import Piscina from 'piscina';
import uniqid from 'uniqid';
import { Server as IOServer } from 'socket.io';
import { centroid, featureCollection, hexGrid, polygon, buffer, bboxPolygon, bbox as turfbbox, booleanIntersects } from '@turf/turf';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// -------------------------------
// Local modules
// -------------------------------
import { loadPlugins } from './lib/pluginLoader.js';
import paletteGenerator from './lib/paletteGenerator.js';
import { dfsObject, bboxSize, saveGeoJsonObjectAsStream, buildPluginsOptions, loadAPIKey } from '#lib/splatone';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const VIZ_BASE = resolve(__dirname, "visualizer");
const app = express();
const port = 3000;
const title = 'Splatone - Multi-Layer Composite Heatmap Viewer';
let pluginsOptions = {};
const flickrLimiter = new Bottleneck({
  maxConcurrent: 5,
  minTime: 350, // 約3req/sec
});

try {

  // Plugin 読み込み
  const api = {
    log: (...a) => console.log('[app]', ...a),
    emit: (topic, payload) => bus.emit(topic, payload), // 重要
    getPlugin: (id) => plugins.get(id),
  };

  const plugins = await loadPlugins({
    dir: './plugins',
    api,
    optionsById: {},
  });
  // Visualizer読み込み
  const all_visualizers = {};  // { [name: string]: class }
  // クラス判定の小ヘルパ
  const isClass = (v) =>
    typeof v === 'function' && /^class\s/.test(Function.prototype.toString.call(v));
  // 1) node.js を import して、クラスを all_visualizers[:name] に格納（公開はしない）
  async function loadVisualizerClasses() {
    const dirs = await readdir(VIZ_BASE, { withFileTypes: true });
    for (const ent of dirs) {
      if (!ent.isDirectory()) continue;
      const name = ent.name;
      const modPath = resolve(VIZ_BASE, name, 'node.js');
      try {
        await access(modPath);
        const mod = await import(pathToFileURL(modPath).href);
        // デフォルト or named export どちらでも拾えるように
        let Cls = null;
        if (isClass(mod.default)) Cls = mod.default;
        else {
          for (const v of Object.values(mod)) {
            if (isClass(v)) { Cls = v; break; }
          }
        }
        if (!Cls) {
          console.warn(`[visualizer] ${name}/node.js にクラスが見つかりません。スキップ`);
          continue;
        }
        all_visualizers[name] = Cls;
        //console.log(`[visualizer] loaded class for "${name}"`);
      } catch (e) {
        // node.js が無ければスキップ
        console.log(e)
      }
    }
  }
  await loadVisualizerClasses();
  // --- 2) node.js への直接アクセスを 404（保険）
  app.use('/visualizer', (req, res, next) => {
    if (/\/node\.js(?:$|\?)/.test(req.path)) return res.sendStatus(404);
    next();
  });
  // --- 3) web.js のみ直リンクで配信（ホワイトリスト式）
  app.get('/visualizer/:name/web.js', async (req, res) => {
    const file = resolve(VIZ_BASE, req.params.name, 'web.js');
    try { await access(file); res.sendFile(file); }
    catch (e) { console.log(e); res.sendStatus(404); }
  });
  // --- 4) 追加アセットは /public/ 以下だけ静的配信（必要なものだけ公開）
  app.use('/visualizer/:name/public', (req, res, next) => {
    // :name を取り出して、そのフォルダの /public だけ公開する
    const name = req.params?.name || (req.url.split('/')[1] || '');
    req.url = req.originalUrl.replace(`/visualizer/${name}/public`, '') || '/';
    express.static(resolve(VIZ_BASE, name, 'public'))(req, res, next);
  });
  // コマンド例
  // node crawler.js -p flickr -o '{"flickr":{"API_KEY":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}' -k "商業=shop,souvenir,market,supermarket,pharmacy,store,department|食べ物=food,drink,restaurant,cafe,bar|美術 館=museum,art,exhibition,expo,sculpture,heritage|公園=park,garden,flower,green,pond,playground" --vis-bulky
  // node crawler.js -p flickr -k "水域=canal,channel,waterway,river,stream,watercourse,sea,ocean,gulf,bay,strait,lagoon,offshore|橋梁=bridge,overpass,flyover,aqueduct,trestle|通路=street,road,thoroughfare,roadway,avenue,boulevard,lane,alley,roadway,carriageway,highway,motorway|ランドマーク=church,sanctuary,chapel,cathedral,basilica,minster,abbey,temple,shrine" --vis-bulky

  // node crawler.js -p flickr -k "水辺=sea,ocean,beach,river,delta,lake,coast,creek|緑地=forest,woods,turf,lawn,jungle,trees,rainforest,grove,savanna,steppe|砂漠=desert,dune,outback,barren,wasteland" --vis-bulky --filed --p-flickr-Haste --p-flickr-DateMode=taken

  // node crawler.js -p flickr -k "商業=shop,souvenir,market,supermarket,pharmacy,drugstore,store,department,kiosk,bazaar,bookstore,cinema,showroom|飲食=bakery,food,drink,restaurant,cafe,bar,beer,wine,whiskey|文化施設=museum,gallery,theater,concert,library,monument,exhibition,expo,sculpture,heritage|公園=park,garden,flower,green,pond,playground" --vis-bulky --p-flickr-Hates --p-flickr-DateMode=taken

  let yargv = await yargs(hideBin(process.argv))
    .strict()                        // 未定義オプションはエラー
    .usage('使い方: $0 [options]')
    .option('plugin', {
      group: 'Basic Options',
      alias: 'p',
      choices: plugins.list(),
      demandOption: true,
      describe: '実行するプラグイン',
      type: 'string'
    })
    .option('options', {
      group: 'Basic Options',
      alias: 'o',
      default: '{}',
      describe: 'プラグインオプション',
      type: 'string'
    })
    .option('keywords', {
      group: 'Basic Options',
      alias: 'k',
      type: 'string',
      default: 'nature,tree,flower|building,house|water,sea,river,pond',
      description: '検索キーワード(|区切り)'
    }).option('filed', {
      group: 'Basic Options',
      alias: 'f',
      type: 'boolean',
      default: true,
      description: '大きなデータをファイルとして送受信する'
    }).option('chopped', {
      group: 'Basic Options',
      alias: 'c',
      type: 'boolean',
      default: false,
      deprecate: true,
      description: '大きなデータを細分化して送受信する'
      //    }).option('debug-save', {
      //      group: 'Debug',
      //      type: 'boolean',
      //      default: false,
      //      description: 'サーバ側にクロールデータを保存'
    }).option('debug-verbose', {
      group: 'Debug',
      type: 'boolean',
      default: false,
      description: 'デバッグ情報出力'
    })
    .version()
    .coerce({
      options: ((name) => (v) => {
        try { return JSON.parse(v); }
        catch (e) { throw new Error(`--${name}: JSON エラー: ${e.message}`); }
      })()
    });
  plugins.list().forEach(async (plug) => {
    yargv = await plugins.call(plug, "yargv", yargv);
  })
  Object.keys(all_visualizers).forEach((vis) => {
    yargv = yargv.option('vis-' + vis, {
      group: 'Visualization (最低一つの指定が必須です)',
      type: 'boolean',
      default: false,
      description: all_visualizers[vis].description
    })
  });
  yargv = yargv.check(async (argv, options) => {
    if (Object.keys(all_visualizers).filter(v => argv["vis-" + v]).length == 0) {
      throw new Error('可視化ツールの指定がありません。最低一つは指定してください。');
    }
    if (argv.filed && argv.chopped) {
      console.warn("--filedと--choppedが両方指定されています。--filedが優先されます。");
      argv.chopped = false;
    }
    pluginsOptions = buildPluginsOptions(argv, plugins.list())
    pluginsOptions[argv.plugin] = await plugins.call(argv.plugin, 'check', pluginsOptions[argv.plugin]);
    return true;
  });

  const argv = await yargv.parseAsync();

  const visualizers = {};
  for (const vis of Object.keys(all_visualizers).filter(v => argv[`vis-${v}`])) {
    visualizers[vis] = new all_visualizers[vis]();
  }

  /* const plugin_options = argv.options?.[argv.plugin] ?? {}
  try {
    plugin_options.API_KEY = await loadAPIKey("flickr") ?? plugin_options.API_KEY;
  } catch (e) {
    if (!plugin_options.API_KEY) {
      console.error("Error loading API key:", e.message);
    }
    //Nothing to do
  }*/
  //pluginsOptions = buildPluginsOptions(argv, plugins.list());
  await plugins.call(argv.plugin, 'init', pluginsOptions[argv.plugin]);
  if (argv.debugVerbose) {
    console.table([["Visualizer", Object.keys(visualizers)], ["Plugin", argv.plugin]]);
  }


  const processing = {};
  const crawlers = {};
  const targets = {};
  // 初期中心（凱旋門）
  const DEFAULT_CENTER = { lat: 48.873611, lon: 2.294444 };

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

  function unixTimeLocal(year, month, day, hour = 0, minute = 0, second = 0) {
    return Math.round(new Date(year, month - 1, day, hour, minute, second).getTime() / 1000);
  }

  function defaultMaxUploadTime(date = new Date()) {
    return Math.floor(date / 1000) - 360;
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
      defaultCellSize: 0,
      defaultUnits: 'kilometers',
      defaultKeywords: argv.keywords,
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

    socket.emit("welcome", { socketId: socket.id, sessionId: sessionId, time: Date.now(), visualizers: Object.keys(visualizers) });
    //クローリング開始
    socket.on("crawling", async (req) => {

      try {
        if (sessionId !== req.sessionId) {
          console.warn("invalid sessionId:", req.sessionId);
          return;
        }
        const workerOptions = {
          hexGrid: targets[req.sessionId].hex,
          triangles: targets[req.sessionId].triangles,
          sessionId: req.sessionId,
          categories: targets[req.sessionId].categories,
          pluginOptions: pluginsOptions[argv.plugin]
        };
        //console.log(optPlugin);
        await plugins.call(argv.plugin, 'crawl', workerOptions);
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
        if (sessionId !== req.sessionId) {
          console.warn("invalid sessionId:", req.sessionId);
          return;
        }
        let { bbox, drawn, cellSize = 0, units = 'kilometers', tags = 'sea,beach|mountain,forest' } = req.query;
        const boundary = String(bbox).split(',').map(Number);
        if (cellSize == 0) {
          //セルサイズ自動決定
          units = 'kilometers'
          //console.log("[cellSize?]",boundary,units);
          const { width, height } = bboxSize(boundary, units);
          //console.log("","w=",width,"/\th=",height);
          cellSize = Math.max(0.5, width / (3 * 30), height / (30 * Math.sqrt(3)));
          if (cellSize == 0) {
            cellSize = 1;
          }
          const msg = "セルサイズを[ " + cellSize + ' ' + units + " ]に設定しました。";
          if (argv.debugVerbose) {
            console.log("INFO:", msg)
          }
          io.to(sessionId).timeout(5000).emit('toast', {
            text: msg,
            class: "info"
          });
        }
        const fallbackBbox = [139.55, 35.53, 139.92, 35.80];
        let bboxArray = fallbackBbox;

        if (bbox) {
          if (boundary.length !== 4 || !boundary.every(Number.isFinite)) {
            return res.status(400).json({ error: 'bbox must be "minLon,minLat,maxLon,maxLat"' });
          }
          bboxArray = boundary;
        }

        const sizeNum = Number(cellSize);
        if (!Number.isFinite(sizeNum) || sizeNum <= 0) {
          return res.status(400).json({ error: 'cellSize must be a positive number' });
        }

        //カテゴリ生成
        const categorize = (tags) => {
          let cats = {};
          tags.split('|').forEach((tag_set, i) => {
            const key_val = tag_set.split("=", 2);
            const key = (key_val.length == 1) ? key_val[0].split(",")[0] : key_val[0];
            const val = (key_val.length == 1) ? key_val[0] : key_val[1];
            cats[key] = val;
          });
          return cats;
        };
        const categories = categorize(req.query.tags);

        //パレット生成
        const colors = paletteGenerator.generate(
          Object.keys(categories).length, // Colors
          function (color) { // This function filters valid colors
            var hcl = color.hcl();
            return hcl[0] >= 0 && hcl[0] <= 360
              && hcl[1] >= 54.96 && hcl[1] <= 134
              && hcl[2] >= 19.14 && hcl[2] <= 90.23;
          },
          true, // Using Force Vector instead of k-Means
          50, // Steps (quality)
          false, // Ultra precision
          'CMC' // Color distance type (colorblindness)
        );
        // Sort colors by differenciation first
        const palette = paletteGenerator.diffSort(colors, 'Default');
        const splatonePalette = Object.fromEntries(Object.entries(categories).map(([k, v]) => {
          const color = palette.pop()
          const colors = {
            "color": color.hex(),
            "darken": color.darken(2).hex(),
            "brighten": color.brighten(2).hex()
          }
          return [k, colors];
        }));

        // HexGrid 生成
        function expandBbox(b, d, units = 'kilometers') {
          //bbox拡大（指定した範囲を内包させるため）
          if (!d) return b;
          const poly = bboxPolygon(b);
          const buff = buffer(poly, Math.sqrt(3) * d, { units }); // 周囲に d だけバッファ
          return turfbbox(buff); // バッファ後の外接 bbox を返す
        }
        const exbbox = expandBbox(bboxArray, sizeNum, units);
        const fc = hexGrid(exbbox, sizeNum, { units }).features.filter((f => booleanIntersects(f, drawn)));

        fc.forEach((f, i) => {
          f.properties = { hexId: i + 1, triIds: [] };
        });
        let hexFC = featureCollection(fc);
        //console.log(JSON.stringify(hexFC, null, 4));

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
        targets[sessionId] = { hex: hexFC, triangles: trianglesFC, categories, splatonePalette, };
        socket.emit("hexgrid", { hex: hexFC, triangles: trianglesFC });
      } catch (e) {
        console.error(e);
        //res.status(500).json({ error: 'failed to build hexgrid' });
        if (sessionId in targets) delete targets[sessionId];
        socket.emit("error ", { error: 'failed to build hexgrid' });
      }

    });
  });

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

  const statsItems = (crawler, target,) => {
    const stats = [];
    const total = [];
    const crawled = [];
    const progress = [];
    let finish = Object.keys(target.categories).length * target.hex.features.length;
    for (const [hexId, tagsObj] of Object.entries(crawler)) {
      total[hexId] = 0;
      crawled[hexId] = 0;
      for (const [category, items] of Object.entries(tagsObj)) {
        finish -= (items.final === true) ? 1 : 0;
        total[hexId] += items.total;
        crawled[hexId] += items.crawled;
        for (const item of items.items.features) {
          //console.log(item.properties)
          stats[hexId] ??= [];
          stats[hexId][item.properties.splatone_triId] ??= [];
          stats[hexId][item.properties.splatone_triId][category] ??= 0;
          stats[hexId][item.properties.splatone_triId][category] += 1;
        }
      }
      progress[hexId] = {
        percent: total[hexId] == 0 ? 1 : crawled[hexId] / total[hexId],
        crawled: crawled[hexId],
        total: total[hexId]
      };
    }
    //console.table(progress);
    return { stats, progress, finish: (finish == 0) };
  };

  async function runTask_(taskName, data) {
    const { port1, port2 } = new MessageChannel();
    const filename = resolveWorkerFilename(taskName); // ← file URL (href)
    // named export を呼ぶ場合は { name: "関数名" } を追加
    port1.on('message', (workerResults) => {
      // ここでログ／WebSocket通知／DB書き込みなど何でもOK
      const rtn = workerResults.results;
      const workerOptions = workerResults.workerOptions;
      const currentSessionId = workerOptions.sessionId;
      processing[currentSessionId]--;
      //console.log(rtn);
      crawlers[currentSessionId][rtn.hexId] ??= {};
      crawlers[currentSessionId][rtn.hexId][rtn.category] ??= { items: featureCollection([]) };
      crawlers[currentSessionId][rtn.hexId][rtn.category].ids ??= new Set();
      const duplicates = ((A, B) => new Set([...A].filter(x => B.has(x))))(rtn.ids, crawlers[currentSessionId][rtn.hexId][rtn.category].ids);
      crawlers[currentSessionId][rtn.hexId][rtn.category].ids = new Set([...crawlers[currentSessionId][rtn.hexId][rtn.category].ids, ...rtn.ids]);
      crawlers[currentSessionId][rtn.hexId][rtn.category].final = rtn.final;
      crawlers[currentSessionId][rtn.hexId][rtn.category].crawled ??= 0;
      crawlers[currentSessionId][rtn.hexId][rtn.category].total = rtn.final ? crawlers[currentSessionId][rtn.hexId][rtn.category].ids.size : rtn.total + crawlers[currentSessionId][rtn.hexId][rtn.category].crawled;
      crawlers[currentSessionId][rtn.hexId][rtn.category].crawled = crawlers[currentSessionId][rtn.hexId][rtn.category].ids.size;

      if (rtn.photos.features.length >= 250 && rtn.photos.features.length == duplicates.size) {
        console.error("ALL DUPLICATE");
      }
      if (argv.debugVerbose) {
        console.log('INFO:', ` ${rtn.hexId} ${rtn.category} ] dup=${duplicates.size}, out=${rtn.outside}, in=${rtn.photos.features.length}  || ${crawlers[currentSessionId][rtn.hexId][rtn.category].crawled} / ${crawlers[currentSessionId][rtn.hexId][rtn.category].total}`);
      }
      const photos = featureCollection(rtn.photos.features.filter((f) => !duplicates.has(f.properties.id)));
      crawlers[currentSessionId][rtn.hexId][rtn.category].items
        = concatFC(crawlers[currentSessionId][rtn.hexId][rtn.category].items, photos);

      const { stats, progress, finish } = statsItems(crawlers[currentSessionId], targets[currentSessionId]);
      io.to(currentSessionId).emit('progress', { hexId: rtn.hexId, progress });
      if (!rtn.final) {
        // 次回クロール用に更新
        rtn.nextPluginOptions.forEach((nextPluginOptions) => {
          const workerOptions_clone = structuredClone(workerOptions);
          workerOptions_clone.pluginOptions = nextPluginOptions;
          api.emit('splatone:start', workerOptions_clone);
        });
        //} else if (finish) {
      } else if (processing[currentSessionId] == 0) {
        if (argv.debugVerbose) {
          console.table(stats);
        }
        api.emit('splatone:finish', workerOptions);
      }
    });
    const rtn = await piscina.run({ debugVerbose: argv.debugVerbose, port: port2, ...data }, { filename, transferList: [port2] });
    port1.close();
    return rtn;
  }
  const runTask = flickrLimiter.wrap(runTask_);

  const nParallel = Math.max(1, Math.min(12, os.cpus().length))
  const piscina = new Piscina({
    minThreads: nParallel,
    maxThreads: nParallel,
    idleTimeout: 10_000
  });

  await subscribe('splatone:start', async workerOptions => {
    //console.log('[splatone:start]', workerOptions);
    const currentSessionId = workerOptions.sessionId;
    processing[currentSessionId] = (processing[currentSessionId] ?? 0) + 1;
    runTask(workerOptions.plugin, workerOptions);
  });

  await subscribe('splatone:finish', async workerOptions => {
    const currentSessionId = workerOptions.sessionId;
    const resultId = uniqid();
    const result = crawlers[currentSessionId];
    const target = targets[currentSessionId];
    let geoJson = Object.fromEntries(Object.entries(visualizers).map(([vis, v]) => [vis, v.getFutureCollection(result, target)]));

    //console.log('[splatone:finish]');
    try {
      if (argv.chopped || argv.filed) {
        throw new RangeError("Invalid string length");
      }
      await io.to(currentSessionId).timeout(120000).emitWithAck('result', {
        resultId,
        geoJson,
        palette: target["splatonePalette"],
        visualizers: Object.keys(visualizers),
        plugin: argv.plugin
      });
    } catch (e) {
      if (e instanceof RangeError && /Invalid string length/.test(String(e.message))) {
        const msg = ((argv.chopped || argv.filed) ? "ユーザの指定により" : "結果サイズが巨大なので") + (argv.chopped ? "断片化送信" : "保存ファイル送信") + "モードでクライアントに送ります";
        if (argv.debugVerbose) {
          console.warn("[WARN] " + msg);
        }
        io.to(currentSessionId).timeout(5000).emit('toast', {
          text: msg,
          class: "warning"
        });
        if (argv.chopped) {
          //サイズ集計
          const total_features = ((s = 0, st = [geoJson], v, seen = new WeakSet) => { for (; st.length;)if ((v = st.pop()) && typeof v === 'object' && !seen.has(v)) { seen.add(v); if (Array.isArray(v.features)) s += v.features.length; for (const k in v) { const x = v[k]; if (x && typeof x === 'object') st.push(x) } } return s })();
          let current_features = 0
          await dfsObject(geoJson, async ({ path, value, kind, type }) => {
            if (path.length !== 0) {
              if (kind === "primitive" || kind === "null") {
                //console.log(path.join("."), "=>", `(${kind}:${type})`, value);
                const ackrtn = await io.to(currentSessionId).timeout(120000).emitWithAck('result-chunk', {
                  resultId,
                  path,
                  kind,
                  type,
                  value
                });
                //console.log("\tACK", ackrtn);
              } else if (kind === "object") {
                //console.log(path.join("."), "=>", `(${kind}:${type})`);
                if (path.at(-2) == "features" && Number.isInteger(path.at(-1))) {
                  current_features++;
                }
                const ackrtn = await io.to(currentSessionId).timeout(120000).emitWithAck('result-chunk', {
                  resultId,
                  path,
                  kind,
                  type,
                  progress: { current: current_features, total: total_features }
                });
                //console.log("\tACK", ackrtn);
              } else if (kind === "array") {
                //console.log(path.join("."), "=>", `(${kind}:${type})`);              
                const ackrtn = await io.to(currentSessionId).timeout(120000).emitWithAck('result-chunk', {
                  resultId,
                  path,
                  kind,
                  type
                });
                //console.log("\tACK", ackrtn);
              }
            } else {
              //console.log("SKIP---------------------");
            }
          });
          //console.log("finish chunks");
        } else {
          //保存ファイル送信(--filed)
          try {
            const outPath = await saveGeoJsonObjectAsStream(geoJson, 'result.' + resultId + '.json');
            console.log('saved:', outPath);
            const ackrtn = await io.to(currentSessionId).timeout(120000).emitWithAck('result-file', {
              resultId,
            });
          } catch (err) {
            console.error('failed:', err);
            process.exitCode = 1;
          }
        }
        await io.to(currentSessionId).timeout(120000).emitWithAck('result', {
          resultId,
          geoJson: null, /*geoJsonは送らない*/
          palette: target["splatonePalette"],
          visualizers: Object.keys(visualizers),
          plugin: argv.plugin
        });
        console.log("[Done]");
      } else {
        throw e; // 他の例外はそのまま
      }
    }
  });

  server.listen(port, async () => {
    //console.log(`Server running at http://localhost:${port}`);
    await open(`http://localhost:${port}`);
  });

  process.on('SIGINT', async () => { await plugins.stopAll(); process.exit(0); });
} catch (e) {
  console.error("[SPLATONE ERROR]");
  console.error(e);
}