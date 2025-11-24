// Heat visualizer dependencies
const dependencies = [
    { type: 'script', src: 'https://cdn.jsdelivr.net/npm/heatmap.js@2.0.5/build/heatmap.min.js' },
    { type: 'script', src: 'https://raw.githack.com/pa7/heatmap.js/develop/plugins/leaflet-heatmap/leaflet-heatmap.js' }
];

const DEFAULT_RADIUS_UNITS = 'meters';
const LEGACY_RADIUS_DEFAULT = 0.0005;
const UNIT_FACTORS_IN_METERS = {
    kilometers: 1000,
    meters: 1,
    miles: 1609.34
};

const ensurePositiveNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
};

const clamp01 = (value) => {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
};

const convertDistanceToMeters = (value, units = DEFAULT_RADIUS_UNITS) => {
    const positive = ensurePositiveNumber(value);
    if (!positive) return null;
    const factor = UNIT_FACTORS_IN_METERS[units] ?? UNIT_FACTORS_IN_METERS[DEFAULT_RADIUS_UNITS];
    return positive * factor;
};

const hexToRgb = (hex) => {
    if (typeof hex !== 'string') return null;
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
    if (!match) return null;
    return {
        r: parseInt(match[1], 16),
        g: parseInt(match[2], 16),
        b: parseInt(match[3], 16)
    };
};

const rgbToHsl = (r, g, b) => {
    const rn = clamp01(r / 255);
    const gn = clamp01(g / 255);
    const bn = clamp01(b / 255);
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;
    let h = 0;
    if (delta !== 0) {
        switch (max) {
            case rn:
                h = ((gn - bn) / delta) % 6;
                break;
            case gn:
                h = (bn - rn) / delta + 2;
                break;
            default:
                h = (rn - gn) / delta + 4;
        }
        h /= 6;
    }
    if (h < 0) h += 1;
    const l = (max + min) / 2;
    const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
    return { h: clamp01(h), s: clamp01(s), l: clamp01(l) };
};

const toHslString = (h, s, l, alpha) => {
    const deg = Math.round(clamp01(h) * 360);
    const sat = Math.round(clamp01(s) * 100);
    const light = Math.round(clamp01(l) * 100);
    const a = clamp01(alpha);
    return `hsla(${deg}, ${sat}%, ${light}%, ${a})`;
};

const createSmoothGradient = (hex) => {
    const rgb = hexToRgb(hex) || { r: 51, g: 136, b: 255 };
    const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const ramp = [
        { offset: 0.0, satShift: -0.7, lightShift: -0.5, alpha: 0.0 },
        { offset: 0.1, satShift: -0.6, lightShift: -0.4, alpha: 0.1 },
        { offset: 0.2, satShift: -0.5, lightShift: -0.3, alpha: 0.2 },
        { offset: 0.3, satShift: -0.4, lightShift: -0.2, alpha: 0.3 },
        { offset: 0.4, satShift: -0.3, lightShift: -0.1, alpha: 0.4 },
        { offset: 0.5, satShift: -0.2, lightShift: 0, alpha: 0.5 },
        { offset: 0.6, satShift: -0.1, lightShift: 0, alpha: 0.6 },
        { offset: 0.7, satShift: 0, lightShift: 0, alpha: 0.7 },
        { offset: 0.8, satShift: 0.1, lightShift: -0.05, alpha: 0.8 },
        { offset: 0.9, satShift: 0.2, lightShift: -0.1, alpha: 0.9 },
        { offset: 0.95, satShift: 0.25, lightShift: -0.15, alpha: 1 },
        { offset: 1,    satShift: -0.4, lightShift: 0.4, alpha: 0.7 },
    ];

    return ramp.reduce((acc, stop) => {
        const sat = clamp01(s + stop.satShift);
        const light = clamp01(l + stop.lightShift);
        acc[stop.offset] = toHslString(h, sat, light, stop.alpha);
        return acc;
    }, {});
};

const getMetersPerPixel = (map) => {
    if (!map?.getCenter || !map?.latLngToContainerPoint || !map?.containerPointToLatLng) return null;
    const center = map.getCenter();
    if (!center) return null;
    const containerPoint = map.latLngToContainerPoint(center);
    if (!containerPoint) return null;
    const shiftedLatLng = map.containerPointToLatLng([containerPoint.x + 1, containerPoint.y]);
    if (!shiftedLatLng) return null;
    const distance = typeof center.distanceTo === 'function'
        ? center.distanceTo(shiftedLatLng)
        : map.distance?.(center, shiftedLatLng);
    return Number.isFinite(distance) && distance > 0 ? distance : null;
};

const deriveHeatmapRadius = (map, visOpts = {}) => {
    const hasUnitSelection = typeof visOpts.Units === 'string';
    if (!hasUnitSelection) {
        return ensurePositiveNumber(visOpts.Radius);
    }

    const units = visOpts.Units;
    const meters = convertDistanceToMeters(visOpts.Radius, units);
    if (!meters) return null;

    const metersPerPixel = getMetersPerPixel(map);
    if (!metersPerPixel) return null;

    const desiredPixels = meters / metersPerPixel;
    if (!Number.isFinite(desiredPixels) || desiredPixels <= 0) return null;

    const zoom = typeof map.getZoom === 'function' ? map.getZoom() : 0;
    const scale = Number.isFinite(zoom) ? Math.pow(2, zoom) : 1;
    const baseRadius = desiredPixels / (scale || 1);
    return baseRadius > 0 ? baseRadius : null;
};

// Load external dependencies dynamically
async function loadDependencies() {
    for (const dep of dependencies) {
        if (dep.type === 'script') {
            // Check if already loaded
            const existing = document.querySelector(`script[src="${dep.src}"]`);
            if (existing) continue;

            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = dep.src;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        } else if (dep.type === 'link') {
            // Check if already loaded
            const existing = document.querySelector(`link[href="${dep.src}"]`);
            if (existing) continue;

            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = dep.src;
            document.head.appendChild(link);
        }
    }
}

let booted = false;
export default async function main(map, geojson, options = {}) {
    console.log("[VIS OPTIONS]", options.visOptions);
    if (booted) return;
    booted = true;

    // Load dependencies first
    await loadDependencies();

    const layers = {};
    const visOpts = options.visOptions || {};
    const computedRadius = deriveHeatmapRadius(map, visOpts);
    const fallbackRadius = LEGACY_RADIUS_DEFAULT;
    const radius = Number.isFinite(computedRadius) ? computedRadius : fallbackRadius;

    // Extract category colors from palette (if available)
    const palette = options.palette || {};

    for (const cat in geojson) {
        const features = geojson[cat].features || [];
        if (features.length === 0) continue;

        // Convert features to heatmap data format: { lat, lng, value }
        const heatmapData = features.map(f => {
            const coords = f.geometry.coordinates; // [lon, lat]
            const rawValue = Number(f.properties?.weight ?? f.properties?.count ?? 1);
            const value = Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 1;
            return {
                lat: coords[1],
                lng: coords[0],
                value
            };
        });

        // Estimate density-based max using originating hex totals as hints
        const densityHints = features
            .map(f => Number(f.properties?.hexDensity))
            .filter(v => Number.isFinite(v) && v > 0);

        const autoMax = densityHints.length > 0
            ? Math.max(...densityHints)
            : Math.max(features.length, 1);

        const configuredMax = Number(visOpts.MaxValue);
        const maxValue = Number.isFinite(configuredMax) && configuredMax > 0
            ? configuredMax
            : autoMax;

        // Get category color from palette (fallback to blue)
        const categoryColor = palette[cat]?.color || '#3388ff';

        // Create smoother gradient using palette hue, tweaking saturation/lightness along the ramp
        const gradient = createSmoothGradient(categoryColor);

        // Create heatmap layer configuration
        const cfg = {
            radius,
            maxOpacity: visOpts.MaxOpacity || 0.8,
            minOpacity: visOpts.MinOpacity || 0.1,
            scaleRadius: true,
            useLocalExtrema: false,
            latField: 'lat',
            lngField: 'lng',
            valueField: 'value',
            gradient: gradient
        };

        // Create HeatmapOverlay instance
        const heatmapLayer = new HeatmapOverlay(cfg);

        // Set data
        heatmapLayer.setData({
            max: maxValue,
            data: heatmapData
        });

        // Add to map and store reference
        heatmapLayer.addTo(map);
        layers[cat] = heatmapLayer;
    }

    return layers;
}