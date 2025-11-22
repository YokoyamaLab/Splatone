import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VisualizerBase } from '../../lib/VisualizerBase.js';
import { featureCollection, clustersDbscan, convex, buffer, bbox as turfBbox } from '@turf/turf';
import { contours as d3Contours } from 'd3-contour';

const DEFAULT_UNITS = 'kilometers';
const MIN_GRID_CELLS = 8;
const MAX_GRID_CELLS = 256;
const MAX_KERNEL_SCALE = 10;

export const optionSchema = {
	label: 'DBSCAN Cluster Hulls',
	fields: [
		{ key: 'Eps', label: 'Eps', type: 'number', min: 0.01, step: 0.01, default: 0.6, description: 'DBSCANのeps（クラスタ判定距離）' },
		{ key: 'MinPts', label: 'MinPts', type: 'number', min: 1, step: 1, default: 6, description: 'DBSCANのminPts（クラスタ確定に必要な点数）' },
		{ key: 'Units', label: 'Units', type: 'select', options: ['kilometers', 'meters', 'miles'], default: DEFAULT_UNITS, description: 'epsで使用する距離単位' },
		{ key: 'StrokeWidth', label: 'Stroke Width', type: 'number', min: 0, max: 10, step: 0.5, default: 2, description: 'ポリゴン輪郭の太さ' },
		{ key: 'StrokeOpacity', label: 'Stroke Opacity', type: 'number', min: 0, max: 1, step: 0.05, default: 0.9, description: 'ポリゴン輪郭の透明度' },
		{ key: 'FillOpacity', label: 'Fill Opacity', type: 'number', min: 0, max: 1, step: 0.05, default: 0.35, description: 'ポリゴン塗りの透明度' },
		{ key: 'DashArray', label: 'Dash Array', type: 'text', placeholder: '例: 4 6', default: '', description: 'LeafletのdashArray指定（例: "4 6"）' },
		{ key: 'KernelScale', label: 'Kernel Scale', type: 'number', min: 0.1, max: 10, step: 0.1, default: 1, description: 'KDEカーネル半径をepsに対して何倍にするか' },
		{ key: 'GridSize', label: 'Grid Size', type: 'number', min: MIN_GRID_CELLS, max: MAX_GRID_CELLS, step: 1, default: 80, description: 'KDE計算用グリッド解像度（長辺方向セル数）' },
		{ key: 'ContourPercent', label: 'Contour Percent', type: 'number', min: 0.05, max: 0.95, step: 0.05, default: 0.4, description: '最大密度に対する等値線レベル（0-1）' }
	]
};

const clamp = (value, min, max) => {
	if (!Number.isFinite(value)) return min;
	if (value < min) return min;
	if (value > max) return max;
	return value;
};

const ensurePositiveNumber = (value, fallback) => {
	const num = Number(value);
	if (!Number.isFinite(num) || num <= 0) return fallback;
	return num;
};

function clonePointFeatures(feature) {
	if (!feature?.geometry) return [];
	const geom = feature.geometry;
	const normalize = (coords) => {
		if (!Array.isArray(coords) || coords.length < 2) return null;
		const lon = Number(coords[0]);
		const lat = Number(coords[1]);
		if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
		return [lon, lat];
	};
	if (geom.type === 'Point') {
		const coords = normalize(geom.coordinates);
		if (!coords) return [];
		return [{
			type: 'Feature',
			properties: { ...(feature.properties || {}) },
			geometry: { type: 'Point', coordinates: coords }
		}];
	}
	if (geom.type === 'MultiPoint' && Array.isArray(geom.coordinates)) {
		const features = [];
		for (const coords of geom.coordinates) {
			const normalized = normalize(coords);
			if (!normalized) continue;
			features.push({
				type: 'Feature',
				properties: { ...(feature.properties || {}) },
				geometry: { type: 'Point', coordinates: normalized }
			});
		}
		return features;
	}
	return [];
}

function buildCategoryIndex(result) {
	const categories = new Set();
	for (const hex of Object.values(result || {})) {
		Object.keys(hex || {}).forEach((category) => categories.add(category));
	}
	return [...categories];
}

function haversineKm([lon1, lat1], [lon2, lat2]) {
	const toRad = Math.PI / 180;
	const R = 6371;
	const dLat = (lat2 - lat1) * toRad;
	const dLon = (lon2 - lon1) * toRad;
	const lat1Rad = lat1 * toRad;
	const lat2Rad = lat2 * toRad;
	const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function convertUnitsToKm(value, units = DEFAULT_UNITS) {
	const num = ensurePositiveNumber(value, 0);
	switch (units) {
		case 'meters':
			return num / 1000;
		case 'miles':
			return num * 1.60934;
		case 'kilometers':
		default:
			return num;
	}
}

function mapGridToLonLat(x, y, bounds, cols, rows) {
	const [minLon, minLat, maxLon, maxLat] = bounds;
	const lonSpan = Math.max(1e-8, maxLon - minLon);
	const latSpan = Math.max(1e-8, maxLat - minLat);
	const lon = minLon + (x / Math.max(1, cols - 1)) * lonSpan;
	const lat = maxLat - (y / Math.max(1, rows - 1)) * latSpan;
	return [lon, lat];
}

function computeDatasetBbox(target) {
	if (target?.hex?.type === 'FeatureCollection') {
		try {
			return turfBbox(target.hex);
		} catch {
			// ignore and fallback
		}
	}
	if (target?.triangles?.type === 'FeatureCollection') {
		try {
			return turfBbox(target.triangles);
		} catch {
			// ignore
		}
	}
	return null;
}

function computeClusterCentroid(points, fallbackBounds) {
	if (Array.isArray(points) && points.length > 0) {
		let sumX = 0;
		let sumY = 0;
		for (const pt of points) {
			if (!Array.isArray(pt) || pt.length < 2) continue;
			sumX += pt[0];
			sumY += pt[1];
		}
		const count = points.length;
		if (count > 0) {
			return [sumX / count, sumY / count];
		}
	}
	if (Array.isArray(fallbackBounds) && fallbackBounds.length === 4) {
		return [
			(fallbackBounds[0] + fallbackBounds[2]) / 2,
			(fallbackBounds[1] + fallbackBounds[3]) / 2
		];
	}
	return [0, 0];
}

function computeClusterAnchor(bounds, datasetBbox, clusterPoints, precomputedCentroid) {
	const referenceBounds = Array.isArray(datasetBbox) ? datasetBbox : bounds;
	const [refMinX, refMinY, refMaxX, refMaxY] = referenceBounds;
	const refCenterX = (refMinX + refMaxX) / 2;
	const refCenterY = (refMinY + refMaxY) / 2;
	const refSpanX = Math.max(1e-4, refMaxX - refMinX);
	const refSpanY = Math.max(1e-4, refMaxY - refMinY);
	const clusterCentroid = precomputedCentroid ?? computeClusterCentroid(clusterPoints, bounds);
	const clusterWidth = Math.max(1e-4, bounds[2] - bounds[0]);
	const clusterHeight = Math.max(1e-4, bounds[3] - bounds[1]);
	const horizontalDir = clusterCentroid[0] >= refCenterX ? 1 : -1;
	const verticalDir = clusterCentroid[1] >= refCenterY ? 1 : -1;
	const offsetX = (clusterWidth / 2) + refSpanX * 0.02;
	const offsetY = (clusterHeight / 2) + refSpanY * 0.02;
	const extendedMarginX = refSpanX * 0.2;
	const extendedMarginY = refSpanY * 0.2;
	let anchorX = clusterCentroid[0] + horizontalDir * offsetX;
	let anchorY = clusterCentroid[1] + verticalDir * offsetY;
	const clampValue = (value, min, max) => Math.max(min, Math.min(max, value));
	anchorX = clampValue(anchorX, refMinX - extendedMarginX, refMaxX + extendedMarginX);
	anchorY = clampValue(anchorY, refMinY - extendedMarginY, refMaxY + extendedMarginY);
	return {
		anchor: [anchorX, anchorY],
		directionX: horizontalDir,
		directionY: verticalDir
	};
}

function buildKdeContours(points, options) {
	const {
		bounds,
		gridSize,
		kernelRadiusKm,
		contourFraction
	} = options;

	const [minLon, minLat, maxLon, maxLat] = bounds;
	if (!(maxLon > minLon) || !(maxLat > minLat)) {
		return [];
	}

	const midLat = (minLat + maxLat) / 2;
	const lonKm = Math.max(0.001, haversineKm([minLon, midLat], [maxLon, midLat]));
	const latKm = Math.max(0.001, haversineKm([minLon, minLat], [minLon, maxLat]));
	const longest = Math.max(lonKm, latKm);

	let cols = Math.round(clamp(gridSize * (lonKm / longest), MIN_GRID_CELLS, MAX_GRID_CELLS));
	let rows = Math.round(clamp(gridSize * (latKm / longest), MIN_GRID_CELLS, MAX_GRID_CELLS));
	cols = Math.max(MIN_GRID_CELLS, cols);
	rows = Math.max(MIN_GRID_CELLS, rows);

	const values = new Float64Array(rows * cols);
	const kernelVariance = kernelRadiusKm * kernelRadiusKm;
	const cutoff = kernelRadiusKm * 3;

	for (let row = 0; row < rows; row++) {
		const lat = maxLat - (row / Math.max(1, rows - 1)) * (maxLat - minLat);
		for (let col = 0; col < cols; col++) {
			const lon = minLon + (col / Math.max(1, cols - 1)) * (maxLon - minLon);
			const idx = row * cols + col;
			let density = 0;
			for (const pt of points) {
				const coords = pt.geometry?.coordinates;
				if (!Array.isArray(coords)) continue;
				const dist = haversineKm([lon, lat], coords);
				if (dist > cutoff) continue;
				const weight = Math.exp(-0.5 * (dist * dist) / Math.max(1e-6, kernelVariance));
				density += weight;
			}
			values[idx] = density;
		}
	}

	const maxDensity = Math.max(...values);
	if (!(maxDensity > 0)) {
		return [];
	}

	const threshold = maxDensity * clamp(contourFraction, 0.05, 0.95);
	const contourGen = d3Contours().size([cols, rows]).smooth(true).thresholds([threshold]);
	const contourPolys = contourGen(values);
	if (!Array.isArray(contourPolys) || contourPolys.length === 0) {
		return [];
	}

	const features = [];
	for (const contour of contourPolys) {
		for (const polygon of contour.coordinates ?? []) {
			const rings = polygon.map((ring) => ring.map((pair) => mapGridToLonLat(pair[0], pair[1], bounds, cols, rows)));
			if (rings.length === 0) continue;
			features.push({
				type: 'Feature',
				geometry: {
					type: 'Polygon',
					coordinates: rings
				},
				properties: {}
			});
		}
	}
	return features;
}

export default class DbscanVisualizer extends VisualizerBase {
	static name = 'DBSCAN Cluster Hulls';
	static version = '0.0.1';
	static description = 'クロール結果をDBSCANクラスタリングし、クラスタの凸包をポリゴンで可視化します。';
	static optionSchema = optionSchema;
	static getOptionSchema() {
		return optionSchema;
	}

	constructor() {
		super();
		this.id = path.basename(path.dirname(fileURLToPath(import.meta.url)));
	}

	getOptionSchema() {
		return optionSchema;
	}

	async yargv(yargv) {
		return this.applyOptionSchemaToYargs(yargv);
	}

	getFutureCollection(result, target, visOptions = {}) {
		const eps = ensurePositiveNumber(visOptions.Eps, 0.6);
		const minPts = Math.max(1, Math.floor(ensurePositiveNumber(visOptions.MinPts, 6)));
		const units = typeof visOptions.Units === 'string' ? visOptions.Units : DEFAULT_UNITS;
		const strokeWidth = ensurePositiveNumber(visOptions.StrokeWidth, 2);
		const strokeOpacity = clamp(visOptions.StrokeOpacity, 0, 1);
		const fillOpacity = clamp(visOptions.FillOpacity, 0, 1);
		const dashArray = typeof visOptions.DashArray === 'string' ? visOptions.DashArray.trim() : '';
		const kernelScale = clamp(ensurePositiveNumber(visOptions.KernelScale, 1), 0.1, MAX_KERNEL_SCALE);
		const gridSize = clamp(ensurePositiveNumber(visOptions.GridSize, 80), MIN_GRID_CELLS, MAX_GRID_CELLS);
		const contourFraction = clamp(visOptions.ContourPercent ?? 0.4, 0.05, 0.95);
		const palette = target?.splatonePalette || {};
		const epsKm = convertUnitsToKm(eps, units);
		const kernelRadiusKm = Math.max(0.05, epsKm * kernelScale);
		const datasetBbox = computeDatasetBbox(target);
		const clusterLinks = [];

		const categories = buildCategoryIndex(result);
		const output = {};

		for (const category of categories) {
			const pointFeatures = [];
			for (const hex of Object.values(result || {})) {
				const bucket = hex?.[category];
				if (!bucket?.items?.features) continue;
				for (const feature of bucket.items.features) {
					const clones = clonePointFeatures(feature);
					clones.forEach((clone) => {
						clone.properties = {
							...clone.properties,
							category,
						};
						pointFeatures.push(clone);
					});
				}
			}

			if (pointFeatures.length === 0) {
				continue;
			}

			let clustered;
			try {
				clustered = clustersDbscan(featureCollection(pointFeatures), eps, {
					minPoints: minPts,
					units,
				});
			} catch (err) {
				console.warn(`[dbscan] clustering failed for category="${category}":`, err?.message || err);
				continue;
			}

			const clusterGroups = new Map();
			for (const feat of clustered.features || []) {
				const marker = feat?.properties?.cluster;
				if (marker == null || marker === 'noise') continue;
				if (!clusterGroups.has(marker)) clusterGroups.set(marker, []);
				clusterGroups.get(marker).push(feat);
			}

			if (clusterGroups.size === 0) {
				continue;
			}

			const polygons = [];
			let clusterIndex = 1;
			for (const group of clusterGroups.values()) {
				if (!group || group.length === 0) continue;
				const bounds = group.reduce((acc, feat) => {
					const coords = feat.geometry?.coordinates;
					if (!Array.isArray(coords)) return acc;
					const [lon, lat] = coords;
					if (lon < acc[0]) acc[0] = lon;
					if (lat < acc[1]) acc[1] = lat;
					if (lon > acc[2]) acc[2] = lon;
					if (lat > acc[3]) acc[3] = lat;
					return acc;
				}, [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]);

				if (!Number.isFinite(bounds[0]) || !Number.isFinite(bounds[1]) || !Number.isFinite(bounds[2]) || !Number.isFinite(bounds[3])) {
					continue;
				}

				let kdeFeatures = [];
				try {
					kdeFeatures = buildKdeContours(group, {
						bounds,
						gridSize,
						kernelRadiusKm,
						contourFraction,
					});
				} catch (err) {
					console.warn('[dbscan] KDE contour failed, fallback to convex hull:', err?.message || err);
				}

				if (!Array.isArray(kdeFeatures) || kdeFeatures.length === 0) {
					if (group.length >= 3) {
						const fallback = convex(featureCollection(group));
						if (fallback) kdeFeatures = [fallback];
					}
				}
				if ((!kdeFeatures || kdeFeatures.length === 0) && group.length >= 1) {
					try {
						const fallback = buffer(group[0], eps * 0.25, { units });
						if (fallback) kdeFeatures = [fallback];
					} catch (err) {
						console.warn('[dbscan] buffer fallback failed:', err?.message || err);
					}
				}
				if (!kdeFeatures || kdeFeatures.length === 0) continue;

				const catPalette = palette[category] || {};
				const clusterLabel = `${category}-${clusterIndex}`;
				for (const hull of kdeFeatures) {
					hull.properties = {
						...(hull.properties || {}),
						category,
						clusterId: clusterLabel,
						pointCount: group.length,
						eps,
						minPts,
						strokeColor: catPalette.darken || '#1f2933',
						strokeWidth,
						strokeOpacity,
						fillColor: catPalette.color || '#3388ff',
						fillOpacity,
						dashArray,
					};
					polygons.push(hull);
				}
				const clusterPoints = group
					.map((feat) => {
						const coords = feat.geometry?.coordinates;
						return Array.isArray(coords) && coords.length >= 2 ? [coords[0], coords[1]] : null;
					})
					.filter(Boolean);
				const clusterCentroid = computeClusterCentroid(clusterPoints, bounds);
				const anchorInfo = computeClusterAnchor(bounds, datasetBbox, clusterPoints, clusterCentroid);
				clusterLinks.push({
					clusterId: clusterLabel,
					category,
					anchor: anchorInfo.anchor,
					points: clusterPoints,
					pointCount: group.length,
					strokeColor: catPalette.darken || '#1f2933',
					fillColor: catPalette.color || '#3388ff',
					centroid: clusterCentroid,
					labelDirection: {
						horizontal: anchorInfo.directionX,
						vertical: anchorInfo.directionY
					}
				});
				clusterIndex += 1;
			}

			if (polygons.length > 0) {
				output[category] = featureCollection(polygons);
			}
		}

			if (clusterLinks.length > 0) {
				output.__clusterLinks = clusterLinks;
			}

			return output;
	}
}

