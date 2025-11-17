import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { featureCollection, centroid as turfCentroid } from '@turf/turf';
import { VisualizerBase } from '../../lib/VisualizerBase.js';

function buildHexIndex(target = {}) {
	const features = target?.hex?.features;
	const index = new Map();
	if (!Array.isArray(features)) return index;
	for (const feature of features) {
		const hexId = feature?.properties?.hexId;
		if (hexId == null) continue;
		index.set(String(hexId), feature);
	}
	return index;
}

function computeHexCentroid(hexFeature) {
	if (!hexFeature) return null;
	try {
		const center = turfCentroid(hexFeature);
		const coords = center?.geometry?.coordinates;
		if (Array.isArray(coords) && coords.length >= 2) {
			return coords;
		}
	} catch (err) {
		console.warn('[PieChartsVisualizer] Failed to compute centroid', err?.message);
	}
	return null;
}

function extractPrimaryRing(feature) {
	const geometry = feature?.geometry;
	if (!geometry) return null;
	if (geometry.type === 'Polygon') {
		const ring = geometry?.coordinates?.[0];
		if (!Array.isArray(ring) || ring.length < 3) return null;
		return ring.map(coords => Array.isArray(coords) ? [coords[0], coords[1]] : null).filter(Boolean);
	}
	if (geometry.type === 'MultiPolygon') {
		const firstPoly = geometry?.coordinates?.[0]?.[0];
		if (!Array.isArray(firstPoly) || firstPoly.length < 3) return null;
		return firstPoly.map(coords => Array.isArray(coords) ? [coords[0], coords[1]] : null).filter(Boolean);
	}
	return null;
}

function aggregatePieChartFeatures(result = {}, target = {}) {
	const hexIndex = buildHexIndex(target);
	const features = [];
	let globalMaxCategoryCount = 0;
	let globalTotalCount = 0;

	for (const [hexId, categories] of Object.entries(result ?? {})) {
		if (!categories) continue;
		const breakdown = [];
		let totalCount = 0;

		for (const [categoryName, payload] of Object.entries(categories)) {
			const count = payload?.items?.features?.length ?? 0;
			if (count <= 0) continue;
			breakdown.push({ name: categoryName, count });
			totalCount += count;
			globalTotalCount += count;
			if (count > globalMaxCategoryCount) {
				globalMaxCategoryCount = count;
			}
		}

		if (totalCount === 0) continue;

		const hexFeature = hexIndex.get(String(hexId));
		if (!hexFeature) {
			console.warn(`[PieChartsVisualizer] Missing hex polygon for ${hexId}`);
			continue;
		}

		const centroidCoords = computeHexCentroid(hexFeature);
		if (!centroidCoords) {
			console.warn(`[PieChartsVisualizer] Unable to place pie chart for hex ${hexId}`);
			continue;
		}

		const ring = extractPrimaryRing(hexFeature);
		if (!ring || ring.length < 3) {
			console.warn(`[PieChartsVisualizer] Missing polygon ring for hex ${hexId}`);
			continue;
		}

		breakdown.sort((a, b) => b.count - a.count);

		features.push({
			type: 'Feature',
			geometry: {
				type: 'Point',
				coordinates: centroidCoords
			},
			properties: {
				hexId,
				totalCount,
				categories: breakdown,
				hexCoordinates: ring
			}
		});
	}

	return {
		features,
		globalMaxCategoryCount,
		globalTotalCount
	};
}

export default class PieChartsVisualizer extends VisualizerBase {
	static name = 'Pie Charts Visualizer';
	static version = '0.0.1';
	static description = 'Hex中心にカテゴリ割合のPie Chartを描画するビジュアライザ';

	constructor() {
		super();
		this.id = path.basename(path.dirname(fileURLToPath(import.meta.url)));
	}

	async yargv(yargv) {
		return yargv
			.option(this.argKey('MaxRadiusScale'), {
				group: 'For ' + this.id + ' Visualizer',
				type: 'number',
				description: 'Hex内接円半径に対する最大半径スケール (0-1.5)',
				default: 0.9
			})
			.option(this.argKey('MinRadiusScale'), {
				group: 'For ' + this.id + ' Visualizer',
				type: 'number',
				description: '最大半径に対する最小半径スケール (0-1)',
				default: 0.25
			})
			.option(this.argKey('StrokeWidth'), {
				group: 'For ' + this.id + ' Visualizer',
				type: 'number',
				description: 'Pie Chart輪郭線の太さ(px)',
				default: 1
			})
			.option(this.argKey('BackgroundOpacity'), {
				group: 'For ' + this.id + ' Visualizer',
				type: 'number',
				description: '最大半径ガイドリングの透明度 (0-1)',
				default: 0.2
			});
	}

	getFutureCollection(result, target, visOptions) { // visOptions reserved for future use
		const { features, globalMaxCategoryCount, globalTotalCount } = aggregatePieChartFeatures(result, target);
		const collection = featureCollection(features);
		collection.properties = {
			globalMaxCategoryCount,
			globalTotalCount
		};
		return collection;
	}
}

