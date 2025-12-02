#!/usr/bin/env node

// -------------------------------
// Node.js core (ESM)
// -------------------------------
import http from 'node:http';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import path, { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs, { existsSync, writeFileSync, constants, createWriteStream } from 'node:fs';
import { access, readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { pipeline as streamPipeline } from 'node:stream/promises';
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
import { loadProviders } from './lib/providerLoader.js';
import paletteGenerator from './lib/paletteGenerator.js';
import chroma from 'chroma-js';
import { dfsObject, bboxSize, saveGeoJsonObjectAsStream, buildProvidersOptions, loadAPIKey, buildVisualizersOptions, toUnixSeconds } from '#lib/splatone';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const VIZ_BASE = resolve(__dirname, "visualizer");
const PROVIDER_BASE = resolve(__dirname, "providers");
const VIEWS_BASE = resolve(__dirname, "views");
const PUBLIC_BASE = resolve(__dirname, "public");
const app = express();
const port = 3000;
const title = 'Splatone - Multi-Layer Composite Heatmap Viewer';
const CLI_BASE_COMMAND = process.env.SPLATONE_CLI_BASE ?? 'npx -y -p splatone@latest crawler';
let providersOptions = {};
let visOptions = {};

const flickrLimiter = new Bottleneck({
  maxConcurrent: 6,
  minTime: 700,
});

const VALID_UI_UNITS = new Set(['kilometers', 'meters', 'miles']);
const RAW_FILE_BASENAME = (sessionId) => `raw.${sessionId}.json`;
const RAW_FILE_REGEX = /^raw\.[a-zA-Z0-9_-]+\.json$/;

const visualizerOptionSchemas = {};

const FLICKR_URL_PRIORITY = [
  { key: 'url_o', sizeTag: 'o' },
  { key: 'url_l', sizeTag: 'l' },
  { key: 'url_c', sizeTag: 'c' },
  { key: 'url_z', sizeTag: 'z' },
  { key: 'url_n', sizeTag: 'n' },
  { key: 'url_m', sizeTag: 'm' },
  { key: 'url_q', sizeTag: 'q' },
  { key: 'url_s', sizeTag: 's' },
  { key: 'url_t', sizeTag: 't' },
  { key: 'url_sq', sizeTag: 'sq' }
];
const IMAGE_DOWNLOAD_CONCURRENCY = 5;
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

const ensureDirectoryExists = async (dir) => {
  if (!dir) return;
  await mkdir(dir, { recursive: true });
};

const fileExistsAsync = async (filePath) => {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const sanitizeFilenameComponent = (value) => {
  const normalized = String(value ?? '').trim().replace(INVALID_FILENAME_CHARS, '_').replace(/\s+/g, '_');
  if (normalized) {
    return normalized.slice(0, 80);
  }
  return `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const pickFlickrImageSource = (properties = {}) => {
  for (const { key, sizeTag } of FLICKR_URL_PRIORITY) {
    const url = properties[key];
    if (url) {
      return { url, sizeTag };
    }
  }
  return null;
};

const formatCoordinatePart = (value) => {
  if (!Number.isFinite(value)) {
    return 'unknown';
  }
  return value.toFixed(6);
};

const resolveCoordinate = (...candidates) => {
  for (const candidate of candidates) {
    const num = Number(candidate);
    if (Number.isFinite(num)) {
      return num;
    }
  }
  return null;
};

const resolveUnixTimestamp = (properties = {}) => {
  const takenString = properties.datetaken ?? properties.date_taken;
  if (takenString) {
    try {
      const takenUnix = toUnixSeconds(takenString);
      if (Number.isFinite(takenUnix)) {
        return takenUnix;
      }
    } catch {
      // ignore parse errors and fall back to other sources
    }
  }
  const uploadRaw = properties.dateupload ?? properties.date_upload;
  const uploadUnix = Number(uploadRaw);
  if (Number.isFinite(uploadUnix)) {
    return uploadUnix;
  }
  return null;
};

const formatTimestampPart = (value) => {
  if (!Number.isFinite(value)) {
    return 'unknown';
  }
  return Math.floor(value).toString();
};

const writeErrorLog = async (dir, baseName, message) => {
  if (!dir) return;
  await ensureDirectoryExists(dir);
  const logPath = path.join(dir, `${baseName}.txt`);
  const stamp = new Date().toISOString();
  const body = `[${stamp}] ${message}\n`;
  await writeFile(logPath, body, { encoding: 'utf8', flag: 'a' });
};

const downloadImageToFile = async (url, destination) => {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  await ensureDirectoryExists(path.dirname(destination));
  await streamPipeline(response.body, createWriteStream(destination));
};

const downloadFlickrImages = async (features, outputDir, context = {}) => {
  if (!outputDir || !Array.isArray(features) || features.length === 0) {
    return;
  }
  await ensureDirectoryExists(outputDir);
  const queue = [...features];
  const workers = Array.from({ length: Math.min(IMAGE_DOWNLOAD_CONCURRENCY, queue.length) }, () => (async () => {
    while (queue.length) {
      const feature = queue.pop();
      if (!feature) {
        break;
      }
      const properties = feature?.properties ?? {};
      const coords = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : [null, null];
      const [lonRaw, latRaw] = coords;
      const lonValue = resolveCoordinate(lonRaw, properties.longitude, properties.lon);
      const latValue = resolveCoordinate(latRaw, properties.latitude, properties.lat);
      const latPart = formatCoordinatePart(latValue);
      const lonPart = formatCoordinatePart(lonValue);
      const categoryPart = sanitizeFilenameComponent(context.category ?? 'category');
      const idPart = sanitizeFilenameComponent(properties.id ?? 'id');
      const timestampValue = resolveUnixTimestamp(properties);
      const timestampPart = formatTimestampPart(timestampValue);
      const ownerPart = sanitizeFilenameComponent(properties.owner ?? properties.owner_name ?? properties.ownername ?? 'owner');
      const source = pickFlickrImageSource(properties);
      if (!source) {
        const baseNameFallback = `${categoryPart}-${latPart}-${lonPart}-${timestampPart}-${ownerPart}-${idPart}-unknown`;
        const sanitizedFallback = sanitizeFilenameComponent(baseNameFallback);
        await writeErrorLog(outputDir, sanitizedFallback, `画像URLが存在しません (hex=${context.hexId ?? 'n/a'}, category=${context.category ?? 'n/a'})`);
        continue;
      }
      const sizeTag = source.sizeTag ?? 'unknown';
      const baseRaw = `${categoryPart}-${latPart}-${lonPart}-${timestampPart}-${ownerPart}-${idPart}-${sizeTag}`;
      const baseName = sanitizeFilenameComponent(baseRaw);
      const imagePath = path.join(outputDir, `${baseName}.jpg`);
      if (await fileExistsAsync(imagePath)) {
        continue;
      }
      try {
        await downloadImageToFile(source.url, imagePath);
      } catch (err) {
        await writeErrorLog(outputDir, baseName, `ダウンロード失敗: ${source.url} (${err?.message || err})`);
      }
    }
  })());
  await Promise.all(workers);
};

const isSessionFullyComplete = (crawler = {}, target = {}) => {
  const hexFeatures = target?.hex?.features ?? [];
  const categoryKeys = Object.keys(target?.categories ?? {});
  if (hexFeatures.length === 0 || categoryKeys.length === 0) {
    return false;
  }
  for (const feature of hexFeatures) {
    const hexId = feature?.properties?.hexId;
    if (hexId == null) {
      return false;
    }
    const hexEntry = crawler[hexId];
    if (!hexEntry) {
      return false;
    }
    for (const categoryKey of categoryKeys) {
      const categoryEntry = hexEntry[categoryKey];
      if (!categoryEntry?.final) {
        return false;
      }
    }
  }
  return true;
};

function normalizeUiCellSize(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return 0;
  }
  return num;
}

function parseUiBbox(value) {
  if (!value) return null;
  const parts = String(value).split(',').map(v => Number(v.trim()));
  if (parts.length !== 4 || parts.some(part => !Number.isFinite(part))) {
    throw new Error('--ui-bbox must be "minLon,minLat,maxLon,maxLat"');
  }
  const [minLon, minLat, maxLon, maxLat] = parts;
  if (minLon >= maxLon || minLat >= maxLat) {
    throw new Error('--ui-bbox requires min < max for both lon and lat');
  }
  return [minLon, minLat, maxLon, maxLat];
}

function extractPolygonFeature(input) {
  if (!input) return null;
  let parsed;
  try {
    parsed = JSON.parse(input);
  } catch (err) {
    throw new Error(`--ui-polygon must be valid GeoJSON: ${err.message}`);
  }

  const toFeature = (geometry, properties = {}) => ({
    type: 'Feature',
    properties,
    geometry
  });

  if (parsed?.type === 'FeatureCollection') {
    const target = parsed.features?.find(f => ['Polygon', 'MultiPolygon'].includes(f?.geometry?.type));
    if (!target) {
      throw new Error('--ui-polygon FeatureCollection must include at least one Polygon or MultiPolygon');
    }
    return toFeature(target.geometry, target.properties ?? {});
  }

  if (parsed?.type === 'Feature') {
    if (!parsed.geometry || !['Polygon', 'MultiPolygon'].includes(parsed.geometry.type)) {
      throw new Error('--ui-polygon Feature must contain Polygon or MultiPolygon geometry');
    }
    return toFeature(parsed.geometry, parsed.properties ?? {});
  }

  if (parsed?.type === 'Polygon' || parsed?.type === 'MultiPolygon') {
    return toFeature(parsed, {});
  }

  throw new Error('--ui-polygon must be a Polygon/MultiPolygon geometry, Feature, or FeatureCollection');
}

function buildUiDefaults(argv) {
  const cellSize = normalizeUiCellSize(argv['ui-cell-size']);
  const unitsInput = argv['ui-units'];
  const units = VALID_UI_UNITS.has(unitsInput) ? unitsInput : 'kilometers';
  const bbox = parseUiBbox(argv['ui-bbox']);
  const polygon = argv['ui-polygon'] ? extractPolygonFeature(argv['ui-polygon']) : null;
  return {
    cellSize,
    units,
    bbox,
    polygon
  };
}

try {

  // Provider 読み込み
  const api = {
    log: (...a) => console.log('[app]', ...a),
    emit: (topic, payload) => bus.emit(topic, payload), // 重要
    getProvider: (id) => providers.get(id),
  };

  const providers = await loadProviders({
    dir: PROVIDER_BASE,
    api,
    optionsById: {},
  });
  const installedProviderIds = providers.list();

  // Visualizer読み込み
  const all_visualizers = {};  // { [name: string]: class }
  const registerOptionSchema = (name, schema) => {
    if (!name || !schema || typeof schema !== 'object') {
      return;
    }
    visualizerOptionSchemas[name] = schema;
  };
  const extractOptionSchemaFromVisualizer = (VisualizerClass) => {
    if (!VisualizerClass) {
      return null;
    }
    if (typeof VisualizerClass.getOptionSchema === 'function') {
      try {
        return VisualizerClass.getOptionSchema();
      } catch (err) {
        console.warn('[visualizer] failed to read option schema via getOptionSchema:', err?.message || err);
      }
    }
    const schema = VisualizerClass.optionSchema;
    return (schema && typeof schema === 'object') ? schema : null;
  };
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
        const schema = extractOptionSchemaFromVisualizer(Cls);
        if (schema) {
          registerOptionSchema(name, schema);
        }
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
  // node crawler.js -p flickr -o '{"flickr":{"API_KEY":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}' -k "商業=shop,souvenir,market,supermarket,pharmacy,store,department|食べ物=food,drink,restaurant,cafe,bar|美術館=museum,art,exhibition,expo,sculpture,heritage|公園=park,garden,flower,green,pond,playground" --vis-bulky

  // node crawler.js -p flickr -k "水域=canal,channel,waterway,river,stream,watercourse,sea,ocean,gulf,bay,strait,lagoon,offshore|緑地=forest,woods,turf,lawn,jungle,trees,rainforest,grove,savanna,steppe|交通=bridge,overpass,flyover,aqueduct,trestle,street,road,thoroughfare,roadway,avenue,boulevard,lane,alley,roadway,carriageway,highway,motorway|ランドマーク=church,chapel,cathedral,basilica,minster,temple,shrine,neon,theater,statue,museum,sculpture,zoo,aquarium,observatory" --vis-bulky

  // node crawler.js -p flickr -k "水辺=sea,ocean,beach,river,delta,lake,coast,creek|緑地=forest,woods,turf,lawn,jungle,trees,rainforest,grove,savanna,steppe|砂漠=desert,dune,outback,barren,wasteland" --vis-bulky

  // node crawler.js -p flickr -k "商業=shop,souvenir,market,supermarket,pharmacy,drugstore,store,department,kiosk,bazaar,bookstore,cinema,showroom|飲食=bakery,food,drink,restaurant,cafe,bar,beer,wine,whiskey|文化施設=museum,gallery,theater,concert,library,monument,exhibition,expo,sculpture,heritage|公園=park,garden,flower,green,pond,playground" --vis-bulky

  let yargv = await yargs(hideBin(process.argv))
    .strict()                        // 未定義オプションはエラー
    .usage('使い方: $0 [options]')
    .option('provider', {
      group: 'Basic Options',
      alias: 'p',
      choices: installedProviderIds,
      demandOption: false,
      describe: '実行するプロバイダ',
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
    }).option('ui-cell-size', {
      group: 'UI Defaults',
      type: 'number',
      default: 0,
      description: '起動時にUIへ設定するセルサイズ (0で自動)'
    }).option('ui-units', {
      group: 'UI Defaults',
      type: 'string',
      choices: ['kilometers', 'meters', 'miles'],
      default: 'kilometers',
      description: 'セルサイズの単位 (kilometers/meters/miles)'
    }).option('ui-bbox', {
      group: 'UI Defaults',
      type: 'string',
      description: 'UI初期表示の矩形範囲。"minLon,minLat,maxLon,maxLat" の形式'
    }).option('ui-polygon', {
      group: 'UI Defaults',
      type: 'string',
      description: 'UI初期表示のポリゴン。Polygon/MultiPolygonを含むGeoJSON文字列'
    }).option('browse-mode', {
      group: 'Basic Options',
      type: 'boolean',
      default: false,
      description: 'ブラウズ専用モード（範囲描画とクロールを無効化）'
    })
    .version()
    .coerce({
      /*
      options: ((name) => (v) => {
        try { return JSON.parse(v); }
        catch (e) { throw new Error(`--${name}: JSON エラー: ${e.message}`); }
      })()
      */
    });
  installedProviderIds.forEach(async (prov) => {
    yargv = await providers.call(prov, "yargv", yargv);
  })


  const visualizers_ = {};
  await Object.keys(all_visualizers).forEach(async (vis) => {
    yargv = yargv.option('vis-' + vis, {
      group: 'Visualization (最低一つの指定が必須です)',
      type: 'boolean',
      default: false,
      description: all_visualizers[vis].description
    })
    visualizers_[vis] = new all_visualizers[vis]();
    yargv = await visualizers_[vis].yargv(yargv);
  });

  yargv = yargv.check(async (argv, options) => {
    const isBrowseMode = argv['browse-mode'] === true;
    const selectedVisualizers = Object.keys(all_visualizers).filter(v => argv["vis-" + v]);
    if (!isBrowseMode) {
      if (!argv.provider) {
        throw new Error('プロバイダの指定がありません。-p で実行するプロバイダを指定してください。');
      }
      if (selectedVisualizers.length === 0) {
        throw new Error('可視化ツールの指定がありません。最低一つは指定してください。');
      }
      if (argv.filed && argv.chopped) {
        console.warn("--filedと--choppedが両方指定されています。--filedが優先されます。");
        argv.chopped = false;
      }
      providersOptions = buildProvidersOptions(argv, installedProviderIds);
      visOptions = buildVisualizersOptions(argv, Object.keys(visualizers_));
      providersOptions[argv.provider] = await providers.call(argv.provider, 'check', providersOptions[argv.provider]);
    } else {
      providersOptions = {};
      visOptions = {};
      if (argv.filed || argv.chopped) {
        if (argv.debugVerbose) {
          console.warn('[browse-mode] --filed/--chopped は無効化されます。');
        }
        argv.filed = false;
        argv.chopped = false;
      }
      if (selectedVisualizers.length > 0 && argv.debugVerbose) {
        console.warn('[browse-mode] --vis-* オプションは無視されます。');
      }
    }
    return true;
  });

  const argv = await yargv.parseAsync();
  const browseMode = Boolean(argv['browse-mode']);

  let uiDefaults;
  try {
    uiDefaults = buildUiDefaults(argv);
  } catch (err) {
    console.error(err?.message || err);
    process.exit(1);
  }

  const requestedVisualizerNames = Object.keys(visualizers_).filter(v => argv[`vis-${v}`]);
  const effectiveVisualizerNames = browseMode ? Object.keys(visualizers_) : requestedVisualizerNames;

  const visualizers = {};
  if (!browseMode) {
    for (const vis of effectiveVisualizerNames) {
      visualizers[vis] = visualizers_[vis];
    }
  }

  if (!browseMode && argv.provider) {
    await providers.call(argv.provider, 'init', providersOptions[argv.provider]);
  }
  if (argv.debugVerbose) {
    console.table([["Visualizer", browseMode ? effectiveVisualizerNames : Object.keys(visualizers)], ["Provider", argv.provider || '(browse)']]);
  }


  const processing = {};
  const crawlers = {};
  const targets = {};
  const rawSnapshotRegistry = new Map();

  // 初期中心（凱旋門）
  const DEFAULT_CENTER = { lat: 48.873611, lon: 2.294444 };

  app.use(express.json({ limit: '50mb' }));
  app.use(express.static(PUBLIC_BASE));
  app.set('view engine', 'ejs');
  app.set('views', VIEWS_BASE);

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
    const hasSource = Array.isArray(fc2?.features) && fc2.features.length > 0;
    if (!fc1 || !Array.isArray(fc1.features)) {
      return hasSource ? featureCollection([...fc2.features]) : featureCollection([]);
    }
    if (!hasSource) {
      return fc1;
    }
    fc1.features.push(...fc2.features);
    return fc1;
  }

  function formatBytesToMB(bytes) {
    return (bytes / (1024 * 1024)).toFixed(1);
  }

  function logHeapUsage(label = 'heap') {
    try {
      const { rss, heapUsed, heapTotal, external } = process.memoryUsage();
      console.log(
        `[memory] ${label}: heapUsed=${formatBytesToMB(heapUsed)} MB / heapTotal=${formatBytesToMB(heapTotal)} MB / rss=${formatBytesToMB(rss)} MB / external=${formatBytesToMB(external)} MB`
      );
    } catch (err) {
      console.warn('[memory] Failed to read usage stats:', err?.message || err);
    }
  }

  const cloneJsonSafe = (value) => {
    if (value == null) return value;
    if (typeof globalThis.structuredClone === 'function') {
      try {
        return globalThis.structuredClone(value);
      } catch {
        // fall through to JSON fallback
      }
    }
    return JSON.parse(JSON.stringify(value));
  };

  function simplifyCrawlerSnapshot(crawler = {}) {
    const snapshot = {};
    for (const [hexId, categories] of Object.entries(crawler || {})) {
      const hexBucket = {};
      for (const [category, info] of Object.entries(categories || {})) {
        const items = info?.items;
        if (!items || !Array.isArray(items.features)) continue;
        hexBucket[category] = {
          items: cloneJsonSafe(items),
          crawled: info?.crawled ?? (info?.ids instanceof Set ? info.ids.size : undefined),
          total: Number.isFinite(info?.total) ? info.total : undefined,
          remaining: Number.isFinite(info?.remaining) ? info.remaining : undefined
        };
      }
      if (Object.keys(hexBucket).length > 0) {
        snapshot[hexId] = hexBucket;
      }
    }
    return snapshot;
  }

  function buildTargetSnapshot(target = {}) {
    return {
      hex: cloneJsonSafe(target.hex ?? null),
      triangles: cloneJsonSafe(target.triangles ?? null),
      categories: cloneJsonSafe(target.categories ?? {}),
      splatonePalette: cloneJsonSafe(target.splatonePalette ?? {})
    };
  }

  function buildRawPayload(sessionId, crawler, target, argvInput, visualizerNames, visOptionsSnapshot, paletteSnapshot, contextSnapshot) {
    const sanitizedCrawler = simplifyCrawlerSnapshot(crawler);
    const targetSnapshot = buildTargetSnapshot(target ?? {});
    const normalizedVisOptions = cloneJsonSafe(visOptionsSnapshot ?? {});
    const normalizedPalette = cloneJsonSafe(paletteSnapshot ?? {});
    const context = contextSnapshot ?? null;
      return {
        version: 1,
        sessionId,
        provider: argvInput?.provider ?? null,
        generatedAt: context?.generatedAt ?? new Date().toISOString(),
        visualizers: Array.isArray(visualizerNames) ? [...visualizerNames] : [],
        visOptions: normalizedVisOptions,
        palette: normalizedPalette,
        target: targetSnapshot,
        crawler: sanitizedCrawler,
        context
      };
  }

  function formatPublicOutPath(outPath) {
    if (!outPath) return null;
    const relative = path.relative('public', outPath);
    return '/' + relative.replace(/\\/g, '/');
  }

  async function persistRawPayload(sessionId, rawPayload) {
    const fileName = RAW_FILE_BASENAME(sessionId);
    const outPath = await saveGeoJsonObjectAsStream(rawPayload, fileName);
    return {
      fileName,
      absolutePath: outPath,
      publicPath: formatPublicOutPath(outPath)
    };
  }

  async function loadRawPayloadFromDisk(fileName) {
    if (!RAW_FILE_REGEX.test(fileName)) {
      throw new Error('raw file name is invalid');
    }
    const filePath = path.join('public', 'out', fileName);
    const contents = await readFile(filePath, 'utf8');
    return JSON.parse(contents);
  }

  function normalizeRawPayloadShape(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('raw payload must be an object');
    }
    const crawler = payload.crawler;
    if (!crawler || typeof crawler !== 'object') {
      throw new Error('raw payload is missing crawler data');
    }
    const context = payload.context ?? {};
    const target = payload.target ?? {};
    const normalizedTarget = {
      hex: target.hex ?? context.hexGrid ?? null,
      triangles: target.triangles ?? context.triangles ?? null,
      categories: target.categories ?? context.categories ?? {},
      splatonePalette: target.splatonePalette ?? payload.palette ?? {}
    };
    return {
      version: payload.version ?? 1,
      sessionId: payload.sessionId ?? null,
      provider: payload.provider ?? null,
      generatedAt: payload.generatedAt ?? context.generatedAt ?? new Date().toISOString(),
      visualizers: Array.isArray(payload.visualizers) ? payload.visualizers : [],
      visOptions: payload.visOptions ?? {},
      palette: payload.palette ?? normalizedTarget.splatonePalette ?? {},
      target: normalizedTarget,
      crawler,
      context: Object.keys(context).length ? context : {
        generatedAt: payload.generatedAt ?? new Date().toISOString(),
        hexGrid: normalizedTarget.hex,
        triangles: normalizedTarget.triangles,
        categories: normalizedTarget.categories,
        cliOptions: (payload.context && payload.context.cliOptions) ? payload.context.cliOptions : {}
      }
    };
  }

  function cloneTargetForVisualizer(rawPayload) {
    const sourceTarget = rawPayload?.target ?? {};
    return {
      hex: cloneJsonSafe(sourceTarget.hex ?? null),
      triangles: cloneJsonSafe(sourceTarget.triangles ?? null),
      categories: cloneJsonSafe(sourceTarget.categories ?? {}),
      splatonePalette: cloneJsonSafe(sourceTarget.splatonePalette ?? rawPayload?.palette ?? {})
    };
  }

  function mergeVisOptionsSnapshot(baseOptions = {}, overrides = {}) {
    const merged = cloneJsonSafe(baseOptions);
    for (const [visName, override] of Object.entries(overrides || {})) {
      if (!override || typeof override !== 'object') continue;
      merged[visName] = {
        ...(merged[visName] ?? {}),
        ...override
      };
    }
    return merged;
  }

  function buildVisualizerDefaultOptions(visualizerNames = []) {
    if (!Array.isArray(visualizerNames) || visualizerNames.length === 0) {
      return {};
    }
    const defaults = {};
    for (const name of visualizerNames) {
      const schema = visualizerOptionSchemas?.[name];
      const fields = Array.isArray(schema?.fields) ? schema.fields : null;
      if (!fields) continue;
      const fieldDefaults = {};
      for (const field of fields) {
        if (!field || typeof field !== 'object') continue;
        const key = field.key;
        if (!key || field.default === undefined) continue;
        fieldDefaults[key] = field.default;
      }
      if (Object.keys(fieldDefaults).length > 0) {
        defaults[name] = fieldDefaults;
      }
    }
    return Object.keys(defaults).length ? cloneJsonSafe(defaults) : {};
  }

  async function resolveRawPayloadSource({ sessionId, rawFileName, inlineRaw }) {
    if (sessionId && rawSnapshotRegistry.has(sessionId)) {
      const entry = rawSnapshotRegistry.get(sessionId);
      return {
        payload: entry.payload,
        descriptor: {
          type: 'session',
          sessionId,
          fileName: entry.fileInfo?.fileName ?? null,
          filePath: entry.fileInfo?.publicPath ?? null
        }
      };
    }
    if (rawFileName) {
      const payload = await loadRawPayloadFromDisk(rawFileName);
      return {
        payload,
        descriptor: {
          type: 'file',
          fileName: rawFileName,
          filePath: `/out/${rawFileName}`
        }
      };
    }
    if (inlineRaw && typeof inlineRaw === 'object') {
      return {
        payload: inlineRaw,
        descriptor: { type: 'inline', fileName: null, filePath: null }
      };
    }
    return null;
  }

  function generateResultId(prefix = 'raw') {
    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${stamp}-${rand}`;
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
      defaultCellSize: uiDefaults.cellSize,
      defaultUnits: uiDefaults.units,
      defaultKeywords: argv.keywords,
      defaultGeometry: {
        bbox: uiDefaults.bbox,
        polygon: uiDefaults.polygon,
      },
      selectedProvider: browseMode ? null : argv.provider,
      selectedVisualizers: browseMode ? [] : Object.keys(visualizers),
      cliBaseCommand: CLI_BASE_COMMAND,
      browseMode,
      clientVisualizers: browseMode ? Object.keys(all_visualizers) : Object.keys(visualizers)
    });
  });

  app.post('/api/revisualize', async (req, res) => {
    try {
      const body = req.body ?? {};
      const {
        sessionId: bodySessionId,
        rawFile: rawFileName,
        rawPayload: inlineRawPayload,
        visualizers: requestedVisualizers,
        visOptions: overrideVisOptions = {}
      } = body;

      const source = await resolveRawPayloadSource({
        sessionId: bodySessionId,
        rawFileName,
        inlineRaw: inlineRawPayload
      });
      if (!source) {
        return res.status(400).json({ error: 'raw payload is required' });
      }

      const normalizedPayload = normalizeRawPayloadShape(source.payload);
      if (!normalizedPayload.sessionId) {
        normalizedPayload.sessionId = generateResultId('rawsess');
      }

      if (source.descriptor?.type === 'inline' || source.descriptor?.type === 'file') {
        rawSnapshotRegistry.set(normalizedPayload.sessionId, {
          payload: normalizedPayload,
          fileInfo: source.descriptor?.type === 'file'
            ? { fileName: source.descriptor.fileName ?? null, publicPath: source.descriptor.filePath ?? null }
            : null
        });
        source.descriptor.sessionId = normalizedPayload.sessionId;
      }
      const fallbackVisualizers = normalizedPayload.visualizers?.length
        ? normalizedPayload.visualizers
        : Object.keys(all_visualizers);
      const candidateVisualizers = Array.isArray(requestedVisualizers) && requestedVisualizers.length
        ? requestedVisualizers
        : fallbackVisualizers;
      const uniqueVisualizerNames = [...new Set(candidateVisualizers.filter((v) => typeof v === 'string'))]
        .filter((name) => Object.prototype.hasOwnProperty.call(all_visualizers, name));
      if (uniqueVisualizerNames.length === 0) {
        return res.status(400).json({ error: 'no valid visualizers were requested' });
      }

      const defaultVisOptions = buildVisualizerDefaultOptions(uniqueVisualizerNames);
      const baseVisOptions = mergeVisOptionsSnapshot(defaultVisOptions, normalizedPayload.visOptions ?? {});
      const mergedVisOptions = mergeVisOptionsSnapshot(baseVisOptions, overrideVisOptions ?? {});
      const geoJsonOutput = {};
      const errors = {};

      for (const visName of uniqueVisualizerNames) {
        const instance = visualizers_[visName];
        if (!instance || typeof instance.getFutureCollection !== 'function') {
          errors[visName] = `visualizer "${visName}" is not available`;
          continue;
        }
        try {
          const crawlerClone = cloneJsonSafe(normalizedPayload.crawler);
          const targetClone = cloneTargetForVisualizer(normalizedPayload);
          const options = mergedVisOptions[visName] ?? {};
          geoJsonOutput[visName] = instance.getFutureCollection(crawlerClone, targetClone, options);
        } catch (err) {
          console.error(`[api:revisualize] ${visName} failed:`, err);
          errors[visName] = err?.message || String(err);
        }
      }

      if (Object.keys(geoJsonOutput).length === 0) {
        return res.status(500).json({ error: 'visualization failed', details: errors });
      }

      const responseBundle = {
        version: normalizedPayload.version ?? 1,
        resultId: generateResultId('raw'),
        provider: normalizedPayload.provider ?? null,
        visualizers: Object.keys(geoJsonOutput),
        visOptions: mergedVisOptions,
        palette: normalizedPayload.palette ?? {},
        context: normalizedPayload.context ?? null,
        geoJson: geoJsonOutput,
        raw: {
          type: source.descriptor?.type ?? null,
          sessionId: normalizedPayload.sessionId ?? source.descriptor?.sessionId ?? null,
          fileName: source.descriptor?.fileName ?? null,
          filePath: source.descriptor?.filePath ?? null
        }
      };

      return res.json({ ok: true, bundle: responseBundle, errors: Object.keys(errors).length ? errors : undefined });
    } catch (err) {
      console.error('[api:revisualize] failed:', err);
      return res.status(500).json({ error: err?.message || 'failed to re-run visualizer' });
    }
  });


  io.on("connection", (socket) => {
    //console.log("connected:", socket.id);
    const sessionId = uniqid();
    crawlers[sessionId] = {};
    socket.join(sessionId);

    const disposeSession = () => {
      delete crawlers[sessionId];
      delete targets[sessionId];
      delete processing[sessionId];
      rawSnapshotRegistry.delete(sessionId);
    };

    socket.on("disconnecting", () => {
      disposeSession();
      //console.log("disconnected:", socket.id);
    });

    const clientVisualizerNames = browseMode ? Object.keys(all_visualizers) : Object.keys(visualizers);
    socket.emit("welcome", {
      socketId: socket.id,
      sessionId: sessionId,
      time: Date.now(),
      visualizers: clientVisualizerNames,
      optionSchemas: cloneJsonSafe(visualizerOptionSchemas)
    });
    //クローリング開始
    socket.on("crawling", async (req) => {
      if (browseMode) {
        socket.emit('toast', {
          text: 'browseコマンドではクロールできません',
          class: 'warning'
        });
        return;
      }

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
          providerOptions: providersOptions[argv.provider]
        };
        await providers.call(argv.provider, 'crawl', workerOptions);
      }
      catch (e) {
        console.error(e);
        //res.status(500).json({ error: 'failed to build hexgrid' });
        socket.emit("error ", { error: 'failed to crawling' });
      }
    });
    // クロール範囲指定
    socket.on("target", (req) => {
      if (browseMode) {
        socket.emit('toast', {
          text: 'browseコマンドでは範囲を指定できません',
          class: 'warning'
        });
        return;
      }
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
        // キーにカラー指定が含まれている場合 (例: "水域#ff0000=canal,river") は
        // カラー部分をキー名から取り除き、表示用の純粋なラベルをキーとして返す。
        // 明示色があれば explicitColors に記録しておき、後でパレット生成時に利用する。
        const explicitColors = {};
        const categorize = (tags) => {
          let cats = {};
          tags.split('|').forEach((tag_set, i) => {
            const key_val = tag_set.split("=", 2);
            // key_raw は元のキー（色コードを含む可能性あり）
            const key_raw = (key_val.length == 1) ? key_val[0].split(",")[0] : key_val[0];
            const val = (key_val.length == 1) ? key_val[0] : key_val[1];
            // カラー指定を抽出してキー名から除去
            const hexMatch = String(key_raw).match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
            let key = key_raw;
            if (hexMatch) {
              const explicit = hexMatch[0];
              // display label から色コードを除去してトリム
              key = key_raw.replace(explicit, '').trim();
              // store explicit color for this cleaned key
              explicitColors[key] = explicit;
            }
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
          // explicitColors にあればその色を使う（キーは既に色コードを取り除いた表示名）
          if (explicitColors.hasOwnProperty(k)) {
            const explicit = explicitColors[k];
            const colors = {
              color: chroma(explicit).hex(),
              darken: chroma(explicit).darken(2).hex(),
              brighten: chroma(explicit).brighten(2).hex()
            };
            return [k, colors];
          }
          const color = palette.pop();
          const colors = {
            color: color.hex(),
            darken: color.darken(2).hex(),
            brighten: color.brighten(2).hex()
          };
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
        const inflight = processing[sessionId] ?? 0;
        if (inflight > 0) {
          console.warn(`[session ${sessionId}] target reinitialized with ${inflight} tasks still running. Resetting session state.`);
        }
        crawlers[sessionId] = {};
        processing[sessionId] = 0;
        targets[sessionId] = { sessionId, hex: hexFC, triangles: trianglesFC, categories, splatonePalette };
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
      const filePath = resolve(__dirname, "providers", taskName, "worker.js");
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

  const statsItems = (crawler, target) => {
    const progress = [];

    const categoryCount = Object.keys(target?.categories ?? {}).length;
    const hexCount = target?.hex?.features?.length ?? 0;
    let remaining = categoryCount * hexCount;

    for (const [hexId, tagsObj] of Object.entries(crawler)) {
      let total = 0;
      let crawled = 0;
      for (const items of Object.values(tagsObj)) {
        if (items?.final === true && remaining > 0) {
          remaining--;
        }
        total += Number(items?.total) || 0;
        crawled += Number(items?.crawled) || 0;
      }
      const safeTotal = Math.max(1, total);
      progress[hexId] = {
        percent: total === 0 ? 1 : Math.min(1, crawled / safeTotal),
        crawled,
        total
      };
    }
    return { progress, finish: remaining === 0 };
  };

  function sanitizeCliOptions(argvInput) {
    if (!argvInput || typeof argvInput !== 'object') return {};
    const snapshot = {};
    for (const [key, value] of Object.entries(argvInput)) {
      if (key === '_' || key === '$0') continue;
      if (typeof value === 'function') continue;
      snapshot[key] = value;
    }
    return snapshot;
  }

  function summarizeCrawlerProgress(crawler = {}, target = {}) {
    const summary = {
      totals: {
        hexes: target?.hex?.features?.length ?? 0,
        triangles: target?.triangles?.features?.length ?? 0,
        categories: Object.keys(target?.categories ?? {}).length,
        crawled: 0,
        remaining: 0,
        expected: 0,
        percent: 0
      },
      hexes: {}
    };

    for (const [hexId, categories] of Object.entries(crawler ?? {})) {
      const hexStats = {
        categories: {},
        crawled: 0,
        remaining: 0,
        expected: 0,
        percent: 0
      };
      for (const [categoryName, info] of Object.entries(categories ?? {})) {
        const crawled = info?.ids instanceof Set
          ? info.ids.size
          : Number(info?.crawled) || 0;
        const remaining = Number(info?.remaining) || 0;
        const total = Number.isFinite(info?.total)
          ? Number(info.total)
          : crawled + remaining;
        const percent = total === 0 ? 1 : Math.min(1, crawled / Math.max(1, total));
        hexStats.categories[categoryName] = {
          crawled,
          remaining,
          total,
          percent,
          final: info?.final === true
        };
        hexStats.crawled += crawled;
        hexStats.remaining += remaining;
        hexStats.expected += total;
      }
      hexStats.percent = hexStats.expected === 0
        ? 1
        : Math.min(1, hexStats.crawled / Math.max(1, hexStats.expected));
      summary.hexes[hexId] = hexStats;
      summary.totals.crawled += hexStats.crawled;
      summary.totals.remaining += hexStats.remaining;
      summary.totals.expected += hexStats.expected;
    }

    summary.totals.percent = summary.totals.expected === 0
      ? 1
      : Math.min(1, summary.totals.crawled / Math.max(1, summary.totals.expected));

    return summary;
  }

  function buildResultContext(crawler, target, argvInput, visualizerNames = []) {
    return {
      generatedAt: new Date().toISOString(),
      hexGrid: target?.hex ?? null,
      triangles: target?.triangles ?? null,
      categories: target?.categories ?? {},
      visualizers: visualizerNames,
      cliOptions: sanitizeCliOptions(argvInput),
      stats: summarizeCrawlerProgress(crawler, target)
    };
    }

  async function runTask_(taskName, data) {
    const { port1, port2 } = new MessageChannel();
    const filename = resolveWorkerFilename(taskName); // ← file URL (href)
    const workerContext = data;
    // named export を呼ぶ場合は { name: "関数名" } を追加
    port1.on('message', async (workerResults) => {
      try {
        // ここでログ／WebSocket通知／DB書き込みなど何でもOK
        const rtn = workerResults?.results;
        if (!rtn) {
          console.warn('[splatone:start] Received malformed worker payload, skipping chunk.');
          return;
        }
        if (!workerContext) {
          console.warn('[splatone:start] Missing worker context, skipping chunk.');
          return;
        }
        const workerOptions = workerContext;
        const currentSessionId = workerOptions.sessionId;
        const currentProcessing = (processing[currentSessionId] ?? 0) - 1;
        processing[currentSessionId] = Math.max(0, currentProcessing);
        const sessionCrawler = crawlers[currentSessionId];
        if (!sessionCrawler) {
          if (argv.debugVerbose) {
            console.warn(`[session ${currentSessionId}] Received worker result after session disposal. Dropping chunk.`);
          }
          return;
        }
        if (rtn.error) {
          console.warn(`[worker error] hex=${rtn.hexId} category=${rtn.category} code=${rtn.error.code ?? 'n/a'} message=${rtn.error.message ?? 'unknown'}`);
        }
        sessionCrawler[rtn.hexId] ??= {};
        sessionCrawler[rtn.hexId][rtn.category] ??= {};
        sessionCrawler[rtn.hexId][rtn.category].terms ??= {};
        if (!sessionCrawler[rtn.hexId][rtn.category].terms[rtn.TermId]) {
          //一つ上のTermIdを100%に更新。ラベルはPrefixLabelingなのでrtn.TermId.slice(0,-1)となる。
          const prevTermId = rtn.TermId.slice(0, -1);
          if (sessionCrawler[rtn.hexId][rtn.category].terms[prevTermId] && !sessionCrawler[rtn.hexId][rtn.category].terms[prevTermId].final) {
            sessionCrawler[rtn.hexId][rtn.category].terms[prevTermId].final = true;
            sessionCrawler[rtn.hexId][rtn.category].terms[prevTermId].remaining = 0;
          }
        }
        sessionCrawler[rtn.hexId][rtn.category].terms[rtn.TermId] ??= {};
        sessionCrawler[rtn.hexId][rtn.category].items ??= featureCollection([]);
        sessionCrawler[rtn.hexId][rtn.category].ids ??= new Set();

        const currentHex = sessionCrawler[rtn.hexId];
        const currentHexCategory = currentHex[rtn.category];
        const idSet = currentHexCategory.ids;
        let duplicateCount = 0;
        const uniqueFeatures = [];
        for (const feature of rtn.photos.features) {
          const featureId = feature?.properties?.id;
          if (featureId != null && idSet.has(featureId)) {
            duplicateCount++;
            continue;
          }
          if (featureId != null) {
            idSet.add(featureId);
          }
          uniqueFeatures.push(feature);
        }

        currentHexCategory.terms[rtn.TermId].remaining = rtn.remaining;
        currentHexCategory.terms[rtn.TermId].final = rtn.final;
        if (rtn.photos.features.length >= 250 && duplicateCount === rtn.photos.features.length) {
          console.error('[ERROR] ALL DUPLICATE');
        }
        const hexCategoryRemaining = Object.values(currentHexCategory.terms).reduce((sum, term) => sum + (term.remaining || 0), 0);
        currentHexCategory.remaining = hexCategoryRemaining;
        currentHexCategory.total = hexCategoryRemaining + idSet.size;
        currentHexCategory.crawled = idSet.size;
        const allTermsFinal = Object.values(currentHexCategory.terms).every(term => term.final);
        currentHexCategory.final = allTermsFinal && hexCategoryRemaining === 0;

        if (argv.debugVerbose) {
          console.log('INFO:', ` ${rtn.hexId} ${rtn.category} ] dup=${duplicateCount}, out=${rtn.outside}, in=${rtn.photos.features.length}  || ${currentHexCategory.crawled} / ${currentHexCategory.total}`);
        }
        const downloadDir = workerOptions.providerOptions?.GimmeGimme;
        if (downloadDir && uniqueFeatures.length) {
          try {
            await downloadFlickrImages(uniqueFeatures, downloadDir, { hexId: rtn.hexId, category: rtn.category });
          } catch (err) {
            console.error('[flickr downloads] failed:', err?.message || err);
          }
        }
        const uniqueFeatureCollection = featureCollection(uniqueFeatures);
        sessionCrawler[rtn.hexId][rtn.category].items
          = concatFC(sessionCrawler[rtn.hexId][rtn.category].items, uniqueFeatureCollection);
        io.to(currentSessionId).emit('progress', { hexId: rtn.hexId, currentHex });
        if (!rtn.final) {
          rtn.nextProviderOptions?.forEach((nextProviderOptions) => {
            const workerOptionsClone = {
              provider: workerOptions.provider,
              hex: workerOptions.hex,
              triangles: workerOptions.triangles,
              bbox: workerOptions.bbox,
              category: workerOptions.category,
              tags: workerOptions.tags,
              providerOptions: nextProviderOptions,
              sessionId: workerOptions.sessionId
            };
            api.emit('splatone:start', workerOptionsClone);
          });
        } else if (
          processing[currentSessionId] === 0 &&
          isSessionFullyComplete(sessionCrawler, targets[currentSessionId])
        ) {
          api.emit('splatone:finish', workerOptions);
        }
      } catch (err) {
        console.error('[splatone:start] handler failure:', err);
      }
      /*
      sessionCrawler[rtn.hexId][rtn.category].terms[rtn.TermId].final = rtn.final;
      sessionCrawler[rtn.hexId][rtn.category].terms[rtn.TermId].remaining  = rtn.remaining;


      if (rtn.photos.features.length >= 250 && duplicateCount === rtn.photos.features.length) {
        console.error("ALL DUPLICATE");
      }
      if (argv.debugVerbose) {
        console.log('INFO:', ` ${rtn.hexId} ${rtn.category} ] dup=${duplicateCount}, out=${rtn.outside}, in=${rtn.photos.features.length}  || ${sessionCrawler[rtn.hexId][rtn.category].crawled} / ${sessionCrawler[rtn.hexId][rtn.category].total}`);
      }
      const photos = featureCollection(uniqueFeatures);
      sessionCrawler[rtn.hexId][rtn.category].items
        = concatFC(sessionCrawler[rtn.hexId][rtn.category].items, photos);

      const { progress, finish } = statsItems(sessionCrawler, targets[currentSessionId]);
      io.to(currentSessionId).emit('progress', { hexId: rtn.hexId, progress });
      if (!rtn.final) {
        // 次回クロール用に更新
        rtn.nextProviderOptions?.forEach((nextProviderOptions) => {
          const workerOptionsClone = {
            provider: workerOptions.provider,
            hex: workerOptions.hex,
            triangles: workerOptions.triangles,
            bbox: workerOptions.bbox,
            category: workerOptions.category,
            tags: workerOptions.tags,
            providerOptions: nextProviderOptions,
            sessionId: workerOptions.sessionId
          };
          api.emit('splatone:start', workerOptionsClone);
        });
        //} else if (finish) {
      } else if (processing[currentSessionId] == 0) {
        if (argv.debugVerbose) {
          console.table(progress);
        }
        api.emit('splatone:finish', workerOptions);
      }
        */
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

  if (!browseMode) {
    await subscribe('splatone:start', async workerOptions => {
      const currentSessionId = workerOptions.sessionId;
      processing[currentSessionId] = (processing[currentSessionId] ?? 0) + 1;
      const safeOptions = JSON.parse(JSON.stringify(workerOptions, (_, value) => {
        if (typeof value === 'function') return undefined;
        return value;
      }));
      runTask(safeOptions.provider, safeOptions);
    });

    await subscribe('splatone:finish', async workerOptions => {
      const currentSessionId = workerOptions.sessionId;
      logHeapUsage(`after-crawl session=${currentSessionId}`);
      const resultId = uniqid();
      const result = crawlers[currentSessionId];
      const target = targets[currentSessionId];

      const visualizerEntries = Object.entries(visualizers);
      const visualizerNames = visualizerEntries.map(([vis]) => vis);
      const defaultVisOptions = buildVisualizerDefaultOptions(visualizerNames);
      const effectiveVisOptions = mergeVisOptionsSnapshot(defaultVisOptions, visOptions);

      const geoJson = Object.fromEntries(
        visualizerEntries.map(([vis, v]) => [vis, v.getFutureCollection(result, target, effectiveVisOptions[vis] ?? {})])
      );
      const resultContext = buildResultContext(result, target, argv, visualizerNames);
      const palette = target["splatonePalette"];
      const resultBundle = {
        version: 1,
        resultId,
        provider: argv.provider,
        visualizers: visualizerNames,
        visOptions: effectiveVisOptions,
        palette,
        context: resultContext,
        geoJson
      };
      const bundleMeta = {
        version: resultBundle.version,
        resultId,
        provider: resultBundle.provider,
        visualizers: resultBundle.visualizers,
        visOptions: resultBundle.visOptions,
        palette: resultBundle.palette,
        context: resultBundle.context
      };

      const rawPayload = buildRawPayload(
        currentSessionId,
        result,
        target,
        argv,
        visualizerNames,
        effectiveVisOptions,
        palette,
        resultContext
      );
      let rawFileInfo = null;
      try {
        rawFileInfo = await persistRawPayload(currentSessionId, rawPayload);
      } catch (err) {
        console.error('[raw] failed to persist raw payload:', err?.message || err);
      }
      rawSnapshotRegistry.set(currentSessionId, { payload: rawPayload, fileInfo: rawFileInfo });
      const rawMeta = {
        sessionId: currentSessionId,
        fileName: rawFileInfo?.fileName ?? null,
        filePath: rawFileInfo?.publicPath ?? null
      };
      resultBundle.raw = rawMeta;
      bundleMeta.raw = rawMeta;

      //console.log('[splatone:finish]');
      let deliveryMode = 'inline';
      try {
        if (argv.chopped || argv.filed) {
          throw new RangeError("Invalid string length");
        }
        await io.to(currentSessionId).timeout(120000).emitWithAck('result', {
          resultId,
          bundle: resultBundle
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
            deliveryMode = 'chunked';
            //サイズ集計（GeoJSON部分のみカウント）
            const total_features = ((s = 0, st = [resultBundle.geoJson], v, seen = new WeakSet) => { for (; st.length;)if ((v = st.pop()) && typeof v === 'object' && !seen.has(v)) { seen.add(v); if (Array.isArray(v?.features)) s += v.features.length; for (const k in v) { const x = v[k]; if (x && typeof x === 'object') st.push(x) } } return s })();
            let current_features = 0
            await dfsObject(resultBundle, async ({ path, value, kind, type }) => {
              if (path.length !== 0) {
                if (kind === "primitive" || kind === "null") {
                  const ackrtn = await io.to(currentSessionId).timeout(120000).emitWithAck('result-chunk', {
                    resultId,
                    path,
                    kind,
                    type,
                    value
                  });
                } else if (kind === "object") {
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
                } else if (kind === "array") {
                  const ackrtn = await io.to(currentSessionId).timeout(120000).emitWithAck('result-chunk', {
                    resultId,
                    path,
                    kind,
                    type
                  });
                }
              }
            });
          } else {
            deliveryMode = 'file';
            try {
              const outPath = await saveGeoJsonObjectAsStream(resultBundle, 'result.' + resultId + '.json');
              console.log('saved:', outPath);
              await io.to(currentSessionId).timeout(120000).emitWithAck('result-file', {
                resultId,
              });
            } catch (err) {
              console.error('failed:', err);
              process.exitCode = 1;
            }
          }
          await io.to(currentSessionId).timeout(120000).emitWithAck('result', {
            resultId,
            bundle: null,
            meta: bundleMeta
          });
        } else {
          throw e; // 他の例外はそのまま
        }
      }
      console.log(`[Done] resultId=${resultId} mode=${deliveryMode}`);
    });
  }

  server.listen(port, async () => {
    //console.log(`Server running at http://localhost:${port}`);
    await open(`http://localhost:${port}`);
  });

  process.on('SIGINT', async () => { await providers.stopAll(); process.exit(0); });
} catch (e) {
  console.error("[SPLATONE ERROR]");
  console.error(e);
}