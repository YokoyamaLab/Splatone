import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { featureCollection, voronoi as turfVoronoi, bbox as turfBBox, intersect, point as turfPoint, distance as turfDistance } from '@turf/turf';
import { VisualizerBase } from '../../lib/VisualizerBase.js';

export const optionSchema = {
    label: 'Voronoi',
    fields: [
        { key: 'MaxSitesPerHex', label: 'Max Sites / Hex', type: 'number', min: 0, step: 1, default: 0, description: 'ポワソン分布に基づいて各ヘックス内でサンプリングされる最大サイト数 (0 = 無制限)' },
        { key: 'MinSiteSpacingMeters', label: 'Min Site Spacing (m)', type: 'number', min: 0, step: 1, default: 50, description: '各ヘックス内でサンプリングされたサイト間の最小距離をメートル単位で保証 (0 = 無効)' }
    ]
};

function cloneFeature(feature) {
    return JSON.parse(JSON.stringify(feature ?? {}));
}

function extractHexPolygons(target = {}, geotagsByHex = {}) {
    const hexFeatures = target?.hex?.features;
    if (!Array.isArray(hexFeatures) || !hexFeatures.length) {
        return {};
    }

    const hexPolygons = {};
    for (const hexFeature of hexFeatures) {
        const hexId = hexFeature?.properties?.hexId;
        if (hexId == null || geotagsByHex[hexId] == null) continue;

        const cloned = cloneFeature(hexFeature);
        cloned.properties ??= {};
        cloned.properties.geotagCount = geotagsByHex[hexId]?.properties?.totalCount ?? 0;
        hexPolygons[hexId] = cloned;
    }

    return hexPolygons;
}

function collectTargetHexIds(target = {}) {
    const hexFeatures = target?.hex?.features;
    if (!Array.isArray(hexFeatures)) return new Set();
    const ids = new Set();
    for (const hexFeature of hexFeatures) {
        const hexId = hexFeature?.properties?.hexId;
        if (hexId == null) continue;
        ids.add(hexId);
    }
    return ids;
}

function shuffleArray(input = []) {
    const array = [...input];
            warnHexNotRendered(hexId, 'no raw points found for this hex in result payload');
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function poissonDownsample(features = [], maxCount = 0) {
    const limit = Math.floor(maxCount);
    if (!Number.isFinite(limit) || limit <= 0 || features.length <= limit) {
        return features;
    }

    const probability = limit / features.length;
    const picked = [];
    const pickedIndices = new Set();

    for (let i = 0; i < features.length; i++) {
        if (picked.length >= limit) break;
        if (Math.random() < probability) {
            picked.push(features[i]);
            pickedIndices.add(i);
        }
    }

    if (picked.length === 0) {
        return shuffleArray(features).slice(0, limit);
    }

    if (picked.length < limit) {
        for (let i = 0; i < features.length && picked.length < limit; i++) {
            if (!pickedIndices.has(i)) {
                picked.push(features[i]);
                pickedIndices.add(i);
            }
        }
    }

    return picked.slice(0, limit);
}

function buildCategoryBreakdown(features = []) {
    const breakdown = {};
    for (const feature of features) {
        const cat = feature?.properties?.category;
        if (!cat) continue;
        breakdown[cat] = (breakdown[cat] ?? 0) + 1;
    }
    return breakdown;
}

function hashStringToHue(input = '') {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) - hash) + input.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash) % 360;
}

function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function darkenHex(hex, amount = 0.8) {
    if (!/^#?[0-9a-f]{6}$/i.test(hex ?? '')) return hex;
    const normalized = hex.replace('#', '');
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    const clamp = v => Math.max(0, Math.min(255, Math.round(v * amount)));
    return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

function getCategoryColors(category, palette = {}) {
    const palEntry = category ? palette[category] : null;
    const fill = palEntry?.color ?? hslToHex(hashStringToHue(category ?? ''), 65, 55);
    const stroke = palEntry?.darken ?? darkenHex(fill, 0.7);
    return { fillColor: fill, strokeColor: stroke };
}

function applyColorsToCells(cells = [], palette = {}) {
    return cells.map(cell => {
        if (!cell) return cell;
        const colored = cloneFeature(cell);
        colored.properties ??= {};
        const category = colored.properties.category;
        const { fillColor, strokeColor } = getCategoryColors(category, palette);
        colored.properties.fillColor = fillColor;
        colored.properties.strokeColor = strokeColor;
        return colored;
    });
}

function coerceLonLat(coords = []) {
    const [lonRaw, latRaw] = coords;
    const lon = Number.parseFloat(lonRaw);
    const lat = Number.parseFloat(latRaw);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    return [lon, lat];
}

const MAX_JITTER_ATTEMPTS = 512;
const BASE_JITTER_DEGREES = 2e-8;

function coordinateKey([lon, lat] = []) {
    return `${lon.toFixed(12)}:${lat.toFixed(12)}`;
}

function jitterCoordinate(baseCoords = [], offsetIndex = 1, seed = 0) {
    const [lon, lat] = baseCoords;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

    const angleDeg = (seed * 23.17 + offsetIndex * 137.508) % 360;
    const angleRad = angleDeg * Math.PI / 180;
    const delta = BASE_JITTER_DEGREES * (offsetIndex + 1);

    const deltaLon = delta * Math.cos(angleRad);
    const deltaLat = delta * Math.sin(angleRad);

    const jitteredLon = lon + deltaLon;
    const jitteredLat = lat + deltaLat;

    if (!Number.isFinite(jitteredLon) || !Number.isFinite(jitteredLat)) {
        return null;
    }

    return [jitteredLon, jitteredLat];
}

function findAvailableCoordinate(baseCoords, occurrenceIndex, seed, usedKeys) {
    for (let attempt = 0; attempt <= MAX_JITTER_ATTEMPTS; attempt++) {
        const jitterIndex = occurrenceIndex + attempt;
        const candidate = jitterIndex === 0 ? baseCoords : jitterCoordinate(baseCoords, jitterIndex, seed);
        if (!candidate) continue;
        const key = coordinateKey(candidate);
        if (usedKeys.has(key)) continue;
        return { coords: candidate, key };
    }
    return null;
}

function normalizePointFeatures(features = []) {
    const uniqueFeatures = [];
    const usedKeys = new Set();
    const duplicateTracker = new Map();

    for (const feature of features) {
        const normalizedCoords = coerceLonLat(feature?.geometry?.coordinates ?? []);
        if (!normalizedCoords) continue;

        const baseKey = coordinateKey(normalizedCoords);
        const occurrenceIndex = duplicateTracker.get(baseKey) ?? 0;
        const seed = feature?.properties?.__voronoiOrder ?? 0;

        const placement = findAvailableCoordinate(normalizedCoords, occurrenceIndex, seed, usedKeys);
        if (!placement) continue;

        duplicateTracker.set(baseKey, occurrenceIndex + 1);
        usedKeys.add(placement.key);

        const cloned = cloneFeature(feature);
        cloned.geometry = {
            type: 'Point',
            coordinates: placement.coords
        };

        uniqueFeatures.push(cloned);
    }

    return uniqueFeatures;
}

function warnHexNotRendered(hexId, reason, extra = {}) {
    const details = Object.keys(extra).length ? ` | context: ${JSON.stringify(extra)}` : '';
    console.warn(`[VoronoiVisualizer] Skipped hex ${hexId}: ${reason}${details}`);
}

function computeLocalCategoryDensityScores(features = [], minMeters = 0) {
    const scores = new Map();
    if (!Number.isFinite(minMeters) || minMeters <= 0) {
        for (const feature of features) {
            scores.set(feature, 0);
        }
        return scores;
    }

    const points = features.map(feature => {
        const coords = feature?.geometry?.coordinates;
        return Array.isArray(coords) ? turfPoint(coords) : null;
    });

    for (let i = 0; i < features.length; i++) {
        const feature = features[i];
        const category = feature?.properties?.category;
        const point = points[i];
        if (!category || !point) {
            scores.set(feature, 0);
            continue;
        }

        let density = 0;
        for (let j = 0; j < features.length; j++) {
            if (i === j) continue;
            const other = features[j];
            if (other?.properties?.category !== category) continue;
            const otherPoint = points[j];
            if (!otherPoint) continue;
            const dist = turfDistance(point, otherPoint, { units: 'meters' });
            if (!Number.isFinite(dist)) continue;
            if (dist <= minMeters) {
                density++;
            }
        }

        scores.set(feature, density);
    }

    return scores;
}

function enforceMinSpacing(features = [], minMeters = 0) {
    if (!Number.isFinite(minMeters) || minMeters <= 0) {
        return features;
    }

    const localDensityScores = computeLocalCategoryDensityScores(features, minMeters);

    const prioritized = [...features].sort((a, b) => {
        const scoreA = localDensityScores.get(a) ?? 0;
        const scoreB = localDensityScores.get(b) ?? 0;
        if (scoreA !== scoreB) {
            return scoreB - scoreA;
        }
        const orderA = a?.properties?.__voronoiOrder ?? 0;
        const orderB = b?.properties?.__voronoiOrder ?? 0;
        return orderA - orderB;
    });

    const accepted = [];
    for (const feature of prioritized) {
        const coords = feature?.geometry?.coordinates;
        if (!Array.isArray(coords)) continue;
        const candidatePoint = turfPoint(coords);
        let tooClose = false;

        for (const existing of accepted) {
            const existingPoint = turfPoint(existing.geometry.coordinates);
            const dist = turfDistance(candidatePoint, existingPoint, { units: 'meters' });
            if (!Number.isFinite(dist)) continue;
            if (dist < minMeters) {
                tooClose = true;
                break;
            }
        }

        if (!tooClose) {
            accepted.push(feature);
        }
    }

    return accepted;
}

function aggregateGeotagsByHex(result = {}, maxSitesPerHex = 0, minSpacingMeters = 0) {
    const geotagsByHex = {};

    for (const [hexId, categories] of Object.entries(result ?? {})) {
        if (!categories) continue;

        const aggregatedFeatures = [];
        let featureOrder = 0;

        for (const [categoryName, payload] of Object.entries(categories)) {
            const features = payload?.items?.features ?? [];
            if (!features.length) continue;

            for (const feature of features) {
                const cloned = cloneFeature(feature);
                const coords = Array.isArray(cloned?.geometry?.coordinates) ? cloned.geometry.coordinates : [];
                const normalizedCoords = coerceLonLat(coords);
                if (!normalizedCoords) continue;
                cloned.geometry = {
                    type: 'Point',
                    coordinates: normalizedCoords
                };
                const [longitude, latitude] = normalizedCoords;

                cloned.properties = {
                    longitude,
                    latitude,
                    category: categoryName,
                    hexId,
                    __voronoiOrder: featureOrder++
                };
                aggregatedFeatures.push(cloned);
            }
        }

        if (!aggregatedFeatures.length) continue;

        const spacedFeatures = enforceMinSpacing(aggregatedFeatures, minSpacingMeters);

        const limitedFeatures = (Number.isFinite(maxSitesPerHex) && maxSitesPerHex > 0)
            ? poissonDownsample(spacedFeatures, maxSitesPerHex)
            : spacedFeatures;

        const breakdown = buildCategoryBreakdown(limitedFeatures);
        const collection = featureCollection(limitedFeatures);
        collection.properties = {
            hexId,
            totalCount: limitedFeatures.length,
            categoryBreakdown: breakdown
        };

        geotagsByHex[hexId] = collection;
    }

    return { geotagsByHex };
}

function buildVoronoiFeatureCollection(geotagsByHex = {}, hexPolygons = {}, palette = {}) {
    const voronoiCells = [];

    for (const [hexId, collection] of Object.entries(geotagsByHex)) {
        const hexPolygon = hexPolygons[hexId];
        const pointFeatures = normalizePointFeatures(collection?.features ?? []);
        if (!hexPolygon) {
            warnHexNotRendered(hexId, 'missing hex polygon');
            continue;
        }
        if (pointFeatures.length === 0) {
            warnHexNotRendered(hexId, 'no sampled points after spacing/downsampling');
            continue;
        }

        if (pointFeatures.length === 1) {
            const singleCell = cloneFeature(hexPolygon);
            singleCell.properties = {
                ...(pointFeatures[0]?.properties ?? {}),
                hexId
            };
            voronoiCells.push(singleCell);
            continue;
        }

        const bbox = turfBBox(hexPolygon);
        let voronoiOutput = null;
        try {
            voronoiOutput = turfVoronoi(featureCollection(pointFeatures), { bbox });
        } catch (err) {
            warnHexNotRendered(hexId, 'turfVoronoi threw', { message: err?.message });
            continue;
        }
        if (!voronoiOutput?.features || voronoiOutput.features.length === 0) {
            warnHexNotRendered(hexId, 'turfVoronoi returned no features');
            continue;
        }

        let cellsAddedForHex = 0;
        for (const cell of voronoiOutput.features) {
            if (!cell?.geometry || !hexPolygon?.geometry) continue;

            let clipped = null;
            try {
                const clippingInput = featureCollection([cell, hexPolygon]);
                clipped = intersect(clippingInput) ?? cell;
            } catch (err) {
                clipped = cell;
            }

            if (!clipped?.geometry) continue;

            const properties = {
                ...(cell.properties ?? {}),
                hexId
            };

            voronoiCells.push({
                type: 'Feature',
                geometry: cloneFeature(clipped.geometry),
                properties
            });
            cellsAddedForHex++;
        }

        if (cellsAddedForHex === 0) {
            warnHexNotRendered(hexId, 'all Voronoi cells were filtered out');
        }
    }

    const coloredCells = applyColorsToCells(voronoiCells, palette);
    return featureCollection(coloredCells);
}

/**
 * Skeleton implementation of the Voronoi visualizer.
 * This placeholder intentionally performs no heavy processing so that
 * developers can wire up the rest of the system before adding real logic.
 */
export default class VoronoiVisualizer extends VisualizerBase {
    static name = 'Voronoi Visualizer';
    static version = '0.0.0';
    static description = 'Hex Grid ボロノイ図';
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
        const maxSitesPerHex = Number(visOptions?.MaxSitesPerHex ?? 0);
        const minSpacingMeters = Number(visOptions?.MinSiteSpacingMeters ?? 0);
        const targetHexIds = collectTargetHexIds(target);
        const { geotagsByHex } = aggregateGeotagsByHex(result, maxSitesPerHex, minSpacingMeters);
        for (const hexId of targetHexIds) {
            if (!geotagsByHex[hexId]) {
                warnHexNotRendered(hexId, 'no geotags provided for this hex');
            }
        }
        const hexPolygons = extractHexPolygons(target, geotagsByHex);
        const palette = target?.splatonePalette ?? {};
        return  buildVoronoiFeatureCollection(geotagsByHex, hexPolygons, palette) ;
    }
}
