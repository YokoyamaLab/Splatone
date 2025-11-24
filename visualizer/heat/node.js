import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VisualizerBase } from '../../lib/VisualizerBase.js';
import { featureCollection } from "@turf/turf";

const DISTANCE_UNITS = ['kilometers', 'meters', 'miles'];
const DEFAULT_RADIUS_UNITS = 'meters';
const DEFAULT_RADIUS_VALUE = 50; // ≒50m so legacy results keep similar look
const DEFAULT_WEIGHT_THRESHOLD = 1;
const DEGREE_TO_KM = 111.32; // approximate length of one degree of latitude in km
const UNIT_TO_KM = {
    kilometers: 1,
    meters: 0.001,
    miles: 1.60934
};
const VALID_UNIT_SET = new Set(DISTANCE_UNITS);
const EARTH_RADIUS_KM = 6371;

const toRadians = Math.PI / 180;

const normalizeRadiusKm = (visOptions = {}) => {
    const rawRadius = Number(visOptions?.Radius);
    const hasUnits = typeof visOptions?.Units === 'string' && VALID_UNIT_SET.has(visOptions.Units);

    if (hasUnits) {
        const radiusValue = Number.isFinite(rawRadius) && rawRadius >= 0 ? rawRadius : DEFAULT_RADIUS_VALUE;
        const factor = UNIT_TO_KM[visOptions.Units] ?? UNIT_TO_KM[DEFAULT_RADIUS_UNITS];
        return radiusValue * factor;
    }

    if (Number.isFinite(rawRadius) && rawRadius > 0 && rawRadius < 1) {
        // Legacy behavior: radius specified in degrees (map units) -> approximate km conversion
        return rawRadius * DEGREE_TO_KM;
    }

    if (Number.isFinite(rawRadius) && rawRadius >= 0) {
        // Interpret as kilometers when units are missing but the scale is large
        return rawRadius;
    }

    // Default fallback
    return DEFAULT_RADIUS_VALUE * UNIT_TO_KM[DEFAULT_RADIUS_UNITS];
};

const getCoordinate = (feature) => {
    const coords = feature?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    return [lon, lat];
};

const haversineKm = (coordA, coordB) => {
    if (!coordA || !coordB) return null;
    const [lon1, lat1] = coordA;
    const [lon2, lat2] = coordB;
    const dLat = (lat2 - lat1) * toRadians;
    const dLon = (lon2 - lon1) * toRadians;
    const lat1Rad = lat1 * toRadians;
    const lat2Rad = lat2 * toRadians;
    const sinLat = Math.sin(dLat / 2);
    const sinLon = Math.sin(dLon / 2);
    const a = sinLat * sinLat + Math.cos(lat1Rad) * Math.cos(lat2Rad) * sinLon * sinLon;
    const c = 2 * Math.asin(Math.min(1, Math.sqrt(a)));
    return EARTH_RADIUS_KM * c;
};

const assignNeighborWeights = (features, radiusKm) => {
    if (!Array.isArray(features) || features.length === 0) return;
    const clampedRadius = Math.max(0, Number(radiusKm) || 0);
    const coordinates = features.map(getCoordinate);

    for (let i = 0; i < features.length; i += 1) {
        const baseCoord = coordinates[i];
        let neighborCount = 0;

        if (baseCoord) {
            for (let j = 0; j < features.length; j += 1) {
                if (i === j) continue;
                const compareCoord = coordinates[j];
                if (!compareCoord) continue;
                const distKm = haversineKm(baseCoord, compareCoord);
                if (Number.isFinite(distKm) && distKm <= clampedRadius) {
                    neighborCount += 1;
                }
            }
        }

        features[i].properties = {
            ...(features[i].properties || {}),
            weight: neighborCount
        };
    }
};

const getWeightThreshold = (visOptions = {}) => {
    const threshold = Number(visOptions?.WeightThreshold);
    if (!Number.isFinite(threshold) || threshold < 0) {
        return DEFAULT_WEIGHT_THRESHOLD;
    }
    return threshold;
};

export const optionSchema = {
    label: 'Heatmap',
    fields: [
        { key: 'Radius', label: 'Radius', type: 'number', min: 0, step: 1, default: DEFAULT_RADIUS_VALUE, description: 'ヒートマップブラーの半径（Unitsで指定した距離単位）' },
        { key: 'Units', label: 'Units', type: 'select', options: DISTANCE_UNITS, default: DEFAULT_RADIUS_UNITS, description: 'Radiusに使用する距離単位' },
        { key: 'MinOpacity', label: 'Min Opacity', type: 'number', min: 0, max: 1, step: 0.05, default: 0, description: 'ヒートマップの最小透明度' },
        { key: 'MaxOpacity', label: 'Max Opacity', type: 'number', min: 0, max: 1, step: 0.05, default: 1, description: 'ヒートマップの最大透明度' },
        { key: 'MaxValue', label: 'Max Value', type: 'number', step: 1, allowEmpty: true, description: 'ヒートマップ強度の最大値 (未指定時はデータから自動推定)' },
        { key: 'WeightThreshold', label: 'Weight Threshold', type: 'number', min: 0, step: 1, default: DEFAULT_WEIGHT_THRESHOLD, description: '半径内の近傍点数（自分以外）がこの値未満の点は描画しない' }
    ]
};

export default class HeatVisualizer extends VisualizerBase {
    static name = 'Heat Visualizer';
    static version = '0.0.0';
    static description = "カテゴリ毎に異なるレイヤのヒートマップで可視化（色=カテゴリ色、透明度=頻度）";
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

    getFutureCollection(result, target, visOptions) {
        // result: { hexId: { category: { items, ids, final, crawled, total }, ... }, ... }
        // target: { hex, triangles, categories, splatonePalette }
        // Build category-based heatmap layers using individual data points (not hex centroids)

        const categories = {};

        // Iterate through all hexes and categories, collecting individual point features
        for (const hexId in result) {
            const hexData = result[hexId];
            for (const cat in hexData) {
                if (!categories[cat]) {
                    categories[cat] = [];
                }

                // Get the actual items (point features) for this category in this hex
                const items = hexData[cat].items;
                if (!items || !items.features || items.features.length === 0) continue;

                // Add each individual point feature to the category collection
                for (const feature of items.features) {
                    const density = hexData[cat]?.total ?? items.features.length ?? 1;
                    // Clone the feature and add category property
                    const pointFeature = {
                        type: 'Feature',
                        geometry: feature.geometry,
                        properties: {
                            ...feature.properties,
                            category: cat,
                            hexId: hexId,
                            hexDensity: density
                        }
                    };
                    categories[cat].push(pointFeature);
                }
            }
        }

        const radiusKm = normalizeRadiusKm(visOptions);
        const weightThreshold = getWeightThreshold(visOptions);

        for (const key of Object.keys(categories)) {
            const featureList = categories[key];
            assignNeighborWeights(featureList, radiusKm);
            if (weightThreshold > 0) {
                categories[key] = featureList.filter((feature) => {
                    const weight = Number(feature?.properties?.weight);
                    return Number.isFinite(weight) && weight >= weightThreshold;
                });
            }
        }

        // Return FeatureCollections per category
        return Object.fromEntries(
            Object.entries(categories).map(([k, v]) => [k, featureCollection(v)])
        );
    }
}