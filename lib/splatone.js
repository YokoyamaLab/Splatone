// 各種関数のまとめ場
// @turf/turf v6/v7 どちらでもOK（rhumbDistanceはv7で統合済み）
import { point, distance, rhumbDistance, bbox as turfBbox } from '@turf/turf';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
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
export default {
  dfsObject, bboxSize, saveGeoJsonObjectAsStream
};
//const {width,height} = bboxSize(b, "kilometers", "geodesic");