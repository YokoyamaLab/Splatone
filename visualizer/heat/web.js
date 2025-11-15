// Heat visualizer dependencies
const dependencies = [
    { type: 'script', src: 'https://cdn.jsdelivr.net/npm/heatmap.js@2.0.5/build/heatmap.min.js' },
    { type: 'script', src: 'https://raw.githack.com/pa7/heatmap.js/develop/plugins/leaflet-heatmap/leaflet-heatmap.js' }
];

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

        // Create gradient using category color
        // Convert hex to RGB for gradient stops
        const hexToRgb = (hex) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : { r: 51, g: 136, b: 255 };
        };

        const rgb = hexToRgb(categoryColor);
        const gradient = {
            0.0: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.0)`,
            0.2: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`,
            0.4: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`,
            0.6: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.7)`,
            0.8: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.9)`,
            1.0: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1.0)`
        };

        // Create heatmap layer configuration
        const cfg = {
            radius: visOpts.Radius || 25,
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