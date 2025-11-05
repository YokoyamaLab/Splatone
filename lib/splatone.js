// 各種関数のまとめ場
// @turf/turf v6/v7 どちらでもOK（rhumbDistanceはv7で統合済み）
import { point, distance, rhumbDistance, bbox as turfBbox } from '@turf/turf';
import { createWriteStream } from 'node:fs';
import { mkdir, constants, access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline as pipelineCb } from 'node:stream';
import { promisify } from 'node:util';
import { JsonStreamStringify } from 'json-stream-stringify';

/**
 * bbox の幅・高さを指定単位で返す
 * @param {number[]} bbox [minX,minY,maxX,maxY] (経度・緯度, WGS84)
 * @param {"meters"|"kilometers"|"miles"|"nauticalmiles"|"inches"|"yards"|"feet"} units
 * @param {"geodesic"|"rhumb"} method  距離の定義：大円 or 等角航程
 * @returns {{width:number, height:number, units:string}}
 */
export function bboxSize(bbox, units = "kilometers", method = "geodesic") {
  const [minX, minY, maxX, maxY] = bbox;

  // 中央経度・緯度（幅は中緯度、 高さは中経度で測るのが安定）
  const midLat = (minY + maxY) / 2;
  const midLon = (minX + maxX) / 2;

  // 測りたい2点を作成
  const west = point([minX, midLat]);
  const east = point([maxX, midLat]);
  const south = point([midLon, minY]);
  const north = point([midLon, maxY]);

  // 距離関数を選択
  const distFn = method === "rhumb" ? rhumbDistance : distance;

  return {
    width: distFn(west, east, { units }),
    height: distFn(south, north, { units }),
    units
  };
}

/**
 * GeoJSON（Feature/FeatureCollection/Geometry）から計算したいときのヘルパー
 */
export function bboxSizeOf(geojson, units = "kilometers", method = "geodesic") {
  return bboxSize(turfBbox(geojson), units, method);
}


// visit({ key, value, path, parent, depth, kind, type, isLeaf, isNull })
//   kind: 'array' | 'object' | 'primitive' | 'null'
//   type: primitive は typeof、配列は 'Array'、オブジェクトは constructor.name
export async function dfsObject(root, visit, options = {}) {
  const {
    includeArrays = true,
    maxDepth = Infinity,
    stopOnTrue = false,
  } = options;

  const meta = describeType(root);

  // root が非オブジェクトの場合も visit だけ呼んで終了
  if (meta.isLeaf) {
    await visit({
      key: undefined,
      value: root,
      path: [],
      parent: null,
      depth: 0,
      ...meta,
    });
    return false;
  }

  const seen = new WeakSet();
  const stack = [
    { key: undefined, value: root, path: /** @type {(string|number)[]} */([]), parent: null, depth: 0 }
  ];

  while (stack.length) {
    const node = stack.pop();
    const { key, value, path, parent } = node;

    const m = describeType(value);
    const depth = path.length; // path 配列の長さをそのまま深さに
    const ret = await visit({ key, value, path, parent, depth, ...m });
    if (stopOnTrue && ret === true) return true;

    if (m.isLeaf) continue;                // primitive/null は展開しない
    if (seen.has(value)) continue;         // 循環参照対策
    seen.add(value);

    if (depth >= maxDepth) continue;

    const isArr = Array.isArray(value);
    if (!includeArrays && isArr) continue; // 配列を辿らない設定

    const entries = isArr
      ? value.map((v, i) => [i, v])               // index は number
      : Object.entries(value);                    // key は string

    // 左→右の自然な DFS にしたいので逆順 push
    for (let i = entries.length - 1; i >= 0; i--) {
      const [k, v] = entries[i]; // k: string|number
      const childPath = path.concat([k]);
      stack.push({
        key: k,
        value: v,
        path: childPath,
        parent: value,
        depth: childPath.length,
      });
    }
  }
  return false;
}

function describeType(value) {
  if (value === null) {
    return { kind: "null", type: "null", isLeaf: true, isNull: true };
  }
  const t = typeof value;
  if (t !== "object") {
    return {
      kind: "primitive",
      type: t, // 'number' | 'string' | 'boolean' | 'bigint' | 'symbol' | 'undefined'
      isLeaf: true,
      isNull: false,
    };
  }
  if (Array.isArray(value)) {
    return { kind: "array", type: "Array", isLeaf: false, isNull: false };
  }
  const ctor = value?.constructor?.name ?? "Object";
  return { kind: "object", type: ctor, isLeaf: false, isNull: false };
}
const pipeline = promisify(pipelineCb);
export async function saveGeoJsonObjectAsStream(geoJsonObject, outfile) {
  const dir = path.join('public', 'out');
  await mkdir(dir, { recursive: true });
  const destPath = path.join(dir, path.basename(outfile));

  // ここでも JSON.stringify は呼ばず、ストリームで直に文字列化
  const src = new JsonStreamStringify(geoJsonObject);
  const dest = createWriteStream(destPath, { flags: 'w' });
  await pipeline(src, dest);
  return destPath;
}

export function buildPluginsOptions(argv, pluginIds) {
  const out = {};
  for (const id of pluginIds) {
    const prefix = `p-${id}`;
    const opts = {};
    for (const [key, val] of Object.entries(argv)) {
      if (key === '_' || key === '$0') continue;
      if (key === prefix) {                 // --p-id=VALUE
        opts.__value = val;
        continue;
      }
      if (key.startsWith(prefix)) {         // --p-id.xxx or --p-id-xxx
        const sep = key[prefix.length];
        if (sep === '.' || sep === '-') {
          let sub = key.slice(prefix.length + 1).replace(/-/g, '.');
          if (sub) setDeep(opts, sub, val);
        }
      }
    }
    if (Object.keys(opts).length) out[id] = opts;
  }
  //return out;
  const lowerRe = /^\p{Ll}/u;

  const out2 = {};
  for (const [k, v] of Object.entries(out)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      // 子がプレーンオブジェクトの場合だけ二階層目をフィルタ
      out2[k] = Object.fromEntries(
        Object.entries(v).filter(([kk]) => kk !== "" && !lowerRe.test(kk))
      );
    } else {
      // それ以外（配列・null・プリミティブ）はそのまま
      out2[k] = v;
    }
  }
  return out2;
}

function setDeep(obj, path, value) {
  const segs = path.split('.');
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const k = segs[i];
    cur = (cur[k] ??= {});
  }
  cur[segs[segs.length - 1]] = value;
}

/* API Key読み込み */
export async function loadAPIKey(plugin = 'flickr') {
  //ファイルチェック→環境変数チェック

  const filePath = ".API_KEY." + plugin;
  const file = path.resolve(filePath);
  //console.log(file);
  // 存在＆読取権限チェック
  let key = null;
  try {
    await access(file, constants.F_OK | constants.R_OK);
    // 読み込み & トリム
    const raw = await readFile(file, 'utf8');
    //console.log(`[API KEY (${plugin}})] Read from FILE`);
    key = raw.trim();
  } catch (err) {
    if (Object.prototype.hasOwnProperty.call(process.env, "API_KEY_" + plugin)) {
      //console.log(`[API KEY (${plugin}})] Read from ENV`);
      key = process.env["API_KEY_" + plugin] ?? null;
    } else {
      const code = /** @type {{ code?: string }} */(err).code || 'UNKNOWN';
      throw new Error(`APIキーのファイルもしくは環境変数にアクセスできません: ${file} (msg=${err.message})`);
    }
  }
  if (!key) {
    throw new Error(`APIキーのファイルが空です: ${file}`);
  }
  // ※任意: Flickr APIキーの緩い形式チェック（英数32+文字）
  // 公式に厳格仕様が明示されていないため、緩めのガードに留めます。
  if (!/^[A-Za-z0-9]{32,}$/.test(key)) {
    // 形式が怪しい場合は警告だけにするなら console.warn に変更
    throw new Error(`APIキーの形式が不正の可能性があります（英数字32文字以上を想定）: ${file}`);
  }
  return key;
}

/*
export default {
  dfsObject, bboxSize, saveGeoJsonObjectAsStream, buildPluginsOptions, loadAPIKey
};*/
//const {width,height} = bboxSize(b, "kilometers", "geodesic");