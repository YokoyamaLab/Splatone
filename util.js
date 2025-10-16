// tri-grid-utils.mjs
// Utilities for triangular lattices on a triangle polygon (GeoJSON) using Turf.js.
// Exports:
//  - triangleLatticeByDivisions(triangle, divisions, { interiorOnly })
//  - divisionsForClosestCount(N, { interiorOnly })
//  - incircleDiameter(triangle)
//
// npm i @turf/turf @turf/helpers @turf/invariant
import { featureCollection, point } from '@turf/helpers';
import { area, distance } from '@turf/turf';
import { getCoords } from '@turf/invariant';

/**
 * @typedef {import('geojson').Position} Position
 * @typedef {import('geojson').Feature<import('geojson').Polygon>} PolygonFeature
 * @typedef {import('geojson').FeatureCollection<import('geojson').Point>} PointFC
 */

/** 内部で使う: 三角形ポリゴンから3頂点を取り出す（[lng,lat]×3） */
function extractTriangleVertices(triangle /** @type {PolygonFeature} */) {
    let ring = getCoords(triangle)[0];
    // 閉ループ (v0 == v_last) の場合は末尾を落とす
    if (
        ring.length === 4 &&
        ring[0][0] === ring[3][0] &&
        ring[0][1] === ring[3][1]
    ) {
        ring = ring.slice(0, 3);
    }
    if (!ring || ring.length !== 3) {
        throw new Error('triangle polygon must have exactly 3 vertices');
    }
    return /** @type {[Position, Position, Position]} */ (ring);
}

/**
 * 三角形ポリゴン内に「辺 m 等分」の正三角格子（頂点格子）を生成
 * @param {PolygonFeature} triangle - 三角形（外輪の最初=最後が同一点でもOK）
 * @param {number} divisions - 辺の等分数 m (1以上の整数)
 * @param {{ interiorOnly?: boolean }} [opts] - true=境界を除外（内部点のみ）
 * @returns {PointFC}
 */
export function triangleLatticeByDivisions(triangle, divisions, opts = {}) {
    const { interiorOnly = false } = opts;
    const m = Math.max(1, Math.floor(divisions));

    const [A, B, C] = extractTriangleVertices(triangle);

    const pts = [];
    if (!interiorOnly) {
        // 境界含む: i+j+k=m, i,j,k >= 0
        for (let i = 0; i <= m; i++) {
            for (let j = 0; j <= m - i; j++) {
                const k = m - i - j;
                const a = i / m,
                    b = j / m,
                    c = k / m;
                const lng = a * A[0] + b * B[0] + c * C[0];
                const lat = a * A[1] + b * B[1] + c * C[1];
                pts.push(point([lng, lat], { i, j, k }));
            }
        }
    } else {
        // 内部のみ: i,j,k >= 1 となる点（m>=2 のときだけ存在）
        if (m < 2) return featureCollection([]);
        for (let i = 1; i <= m - 1; i++) {
            for (let j = 1; j <= m - i - 1; j++) {
                const k = m - i - j;
                if (k < 1) continue;
                const a = i / m,
                    b = j / m,
                    c = k / m;
                const lng = a * A[0] + b * B[0] + c * C[0];
                const lat = a * A[1] + b * B[1] + c * C[1];
                pts.push(point([lng, lat], { i, j, k }));
            }
        }
    }
    return featureCollection(pts);
}

/**
 * 目標の点数 N に最も近い「辺の等分数 m」を高速に求める
 * - 境界を含む点数: T_all(m) = (m+1)(m+2)/2
 * - 内部点のみ  : T_in (m) = (m-1)m/2
 * @param {number} N - 目標点数 (>0)
 * @param {{ interiorOnly?: boolean }} [opts] - true=内部点のみ基準
 * @returns {{ m:number, count:number, diff:number }}
 */
export function divisionsForClosestCount(N, opts = {}) {
    const { interiorOnly = false } = opts;
    if (!Number.isFinite(N) || N <= 0) {
        return { m: 0, count: 0, diff: Math.max(0, Math.floor(N || 0)) };
    }

    // 連続解（正の根）
    // all: (m+1)(m+2)/2 ≈ N → m ≈ (-3 + sqrt(1+8N))/2
    // in : (m-1)m/2    ≈ N → m ≈ (1 + sqrt(1+8N))/2
    const mCont = interiorOnly
        ? (1 + Math.sqrt(1 + 8 * N)) / 2
        : (-3 + Math.sqrt(1 + 8 * N)) / 2;

    const mMin = interiorOnly ? 2 : 0;
    const candidates = [Math.floor(mCont), Math.ceil(mCont)].map((m) =>
        Math.max(mMin, m)
    );

    let best = /** @type {{ m:number, count:number, diff:number } | null} */ (null);
    for (const m of candidates) {
        const count = interiorOnly ? ((m - 1) * m) / 2 : ((m + 1) * (m + 2)) / 2;
        const diff = Math.abs(count - N);
        if (!best || diff < best.diff || (diff === best.diff && m < best.m)) {
            best = { m, count, diff };
        }
    }
    return /** @type {any} */ (best);
}

/**
 * 三角形の内接円の直径（メートル）を返す
 * D = 4A / P （A: 面積[m^2], P: 周長[m]）
 * @param {PolygonFeature} triangle
 * @returns {number} diameterMeters
 */
export function incircleDiameter(triangle) {
    const [A, B, C] = extractTriangleVertices(triangle);

    // 周長 P（m）
    const a = distance(point(B), point(C), { units: 'meters' }); // |BC|
    const b = distance(point(C), point(A), { units: 'meters' }); // |CA|
    const c = distance(point(A), point(B), { units: 'meters' }); // |AB|
    const P = a + b + c;

    // 面積 A（m^2）
    const A_m2 = area(triangle);

    if (P <= 0 || A_m2 <= 0) {
        throw new Error('degenerate triangle (zero perimeter or area)');
    }
    return (4 * A_m2) / P; // 直径 D
}

// まとめて import したい場合用
export default {
    triangleLatticeByDivisions,
    divisionsForClosestCount,
    incircleDiameter,
};

/* -------------------------
USAGE (example):

import { polygon } from '@turf/turf';
import {
  triangleLatticeByDivisions,
  divisionsForClosestCount,
  incircleDiameter
} from './util.js';

const tri = polygon([[
  [139.70, 35.65],
  [139.75, 35.65],
  [139.725, 35.70],
  [139.70, 35.65],
]]);

// 1) m 等分の格子（境界含む）
const m = 10;
const fcAll = triangleLatticeByDivisions(tri, m); // (m+1)(m+2)/2 点

// 2) 目標 N に最も近い m を探す → その m で格子生成
const targetN = 25;
const { m: bestM } = divisionsForClosestCount(targetN, { interiorOnly: false });
const fcClosest = triangleLatticeByDivisions(tri, bestM);

// 3) 内接円の直径（メートル）
const D = incircleDiameter(tri);
console.log('incircle diameter (m):', D);

-------------------------- */
