let layerGroup = null;
let styleInjected = false;
let zoomHandler = null;
let activeMap = null;
let cachedContext = null;

function reset(map) {
	if (layerGroup && map) {
		map.removeLayer(layerGroup);
	}
	if (map && zoomHandler) {
		map.off('zoomend', zoomHandler);
	}
	layerGroup = null;
	zoomHandler = null;
	activeMap = null;
	cachedContext = null;
}

function ensureStyles() {
	if (styleInjected) return;
	const style = document.createElement('style');
	style.textContent = `
	.pie-chart-marker {
		background: transparent !important;
		border: none !important;
	}
	.pie-chart-marker svg {
		pointer-events: none;
		display: block;
	}
	`;
	document.head.appendChild(style);
	styleInjected = true;
}

function normalizeFeatureCollection(payload) {
	if (!payload) return null;
	if (payload.type === 'FeatureCollection') return payload;
	if (payload?.pieCharts?.type === 'FeatureCollection') {
		return payload.pieCharts;
	}
	return null;
}

const DEFAULTS = {
	MaxRadiusScale: 0.9,
	MinRadiusScale: 0.25,
	StrokeWidth: 1,
	BackgroundOpacity: 0.2
};

function polarToCartesian(cx, cy, radius, angle) {
	return {
		x: cx + radius * Math.cos(angle),
		y: cy + radius * Math.sin(angle)
	};
}

function buildSlicePath(cx, cy, radius, startAngle, endAngle) {
	if (radius <= 0 || endAngle <= startAngle) return '';
	const start = polarToCartesian(cx, cy, radius, startAngle);
	const end = polarToCartesian(cx, cy, radius, endAngle);
	const largeArcFlag = (endAngle - startAngle) > Math.PI ? 1 : 0;
	return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`;
}

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function computeHexRadiusPx(map, centroidLatLng, ring = []) {
	if (!map || !centroidLatLng || !Array.isArray(ring) || ring.length === 0) {
		return 32;
	}
	const centerPoint = map.latLngToLayerPoint(centroidLatLng);
	let minDistance = Infinity;
	for (const coord of ring) {
		if (!Array.isArray(coord) || coord.length < 2) continue;
		const latLng = L.latLng(coord[1], coord[0]);
		const point = map.latLngToLayerPoint(latLng);
		const dist = centerPoint.distanceTo(point);
		if (Number.isFinite(dist) && dist > 0) {
			minDistance = Math.min(minDistance, dist);
		}
	}
	if (!Number.isFinite(minDistance) || minDistance === Infinity) {
		return 32;
	}
	return Math.max(4, minDistance - 2);
}

function deriveRadiusRange(map, feature, visOptions) {
	const coords = feature?.geometry?.coordinates;
	const centroidLatLng = Array.isArray(coords) && coords.length >= 2 ? L.latLng(coords[1], coords[0]) : null;
	const ring = feature?.properties?.hexCoordinates ?? [];
	const baseRadius = computeHexRadiusPx(map, centroidLatLng, ring);
	const maxScale = clamp(Number(visOptions.MaxRadiusScale ?? DEFAULTS.MaxRadiusScale), 0.1, 1.5);
	const minScale = clamp(Number(visOptions.MinRadiusScale ?? DEFAULTS.MinRadiusScale), 0, 1);
	const maxRadius = Math.max(4, baseRadius * maxScale);
	const minRadius = clamp(baseRadius * minScale, 0, maxRadius * 0.95);
	return { maxRadius, minRadius };
}

function computeRadiusPixels(count, stats, radiusRange) {
	if (!Number.isFinite(count) || count <= 0) return 0;
	const { maxRadius, minRadius } = radiusRange;
	const globalTotal = Math.max(1, Number(stats.globalTotalCount) || 1);
	const globalMaxCount = Math.max(1, Number(stats.globalMaxCategoryCount) || 1);
	const maxShare = globalMaxCount / globalTotal;
	const share = count / globalTotal;
	const normalized = maxShare > 0 ? clamp(share / maxShare, 0, 1) : 0;
	if (normalized <= 0) return minRadius;
	return minRadius + (maxRadius - minRadius) * normalized;
}

function renderPieSvg(feature, palette, visOptions, stats, radiusRange) {
	const categories = feature?.properties?.categories;
	const totalCount = feature?.properties?.totalCount ?? 0;
	if (!Array.isArray(categories) || categories.length === 0 || totalCount === 0) {
		return null;
	}

	const maxRadius = radiusRange.maxRadius;
	const strokeWidth = Math.max(0, Number(visOptions.StrokeWidth ?? DEFAULTS.StrokeWidth));
	const backgroundOpacity = Math.min(1, Math.max(0, Number(visOptions.BackgroundOpacity ?? DEFAULTS.BackgroundOpacity)));
	const size = (maxRadius + strokeWidth) * 2;
	const cx = size / 2;
	const cy = size / 2;

	const validCategories = categories.filter(cat => (cat?.count ?? 0) > 0);
	if (!validCategories.length) return null;

	const total = validCategories.reduce((sum, cat) => sum + cat.count, 0);
	if (total === 0) return null;

	let currentAngle = -Math.PI / 2;
	const slices = [];
	for (const cat of validCategories) {
		const ratio = cat.count / total;
		const angleSpan = ratio * Math.PI * 2;
		if (angleSpan <= 0) continue;
		const startAngle = currentAngle;
		const endAngle = currentAngle + angleSpan;
		currentAngle = endAngle;
	const radius = computeRadiusPixels(cat.count, stats, radiusRange);
		if (radius <= 0) continue;
		slices.push({
			path: buildSlicePath(cx, cy, radius, startAngle, endAngle),
			color: palette[cat.name]?.color || '#888888',
			stroke: palette[cat.name]?.darken || 'rgba(0,0,0,0.4)',
			count: cat.count,
			name: cat.name
		});
	}

	if (!slices.length) return null;

	const outlineColor = 'rgba(0,0,0,0.35)';
	const svgParts = [`<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-label="hex pie chart">`];
	svgParts.push(`<circle cx="${cx}" cy="${cy}" r="${maxRadius}" fill="rgba(255,255,255,${backgroundOpacity})" stroke="${outlineColor}" stroke-width="${strokeWidth}" />`);

	for (const slice of slices) {
		if (!slice.path) continue;
		svgParts.push(`<path d="${slice.path}" fill="${slice.color}" stroke="${slice.stroke}" stroke-width="${Math.max(0.5, strokeWidth * 0.6)}" />`);
	}

	svgParts.push('</svg>');
	return { svg: svgParts.join(''), size };
}

function createMarker(map, feature, palette, visOptions, stats) {
	const coords = feature?.geometry?.coordinates;
	if (!Array.isArray(coords) || coords.length < 2) return null;
	const radiusRange = deriveRadiusRange(map, feature, visOptions);
	const rendered = renderPieSvg(feature, palette, visOptions, stats, radiusRange);
	if (!rendered) return null;

	const icon = L.divIcon({
		className: 'pie-chart-marker',
		html: rendered.svg,
		iconSize: [rendered.size, rendered.size],
		iconAnchor: [rendered.size / 2, rendered.size / 2]
	});

	const marker = L.marker([coords[1], coords[0]], { icon });
	const total = feature?.properties?.totalCount ?? 0;
	const breakdown = feature?.properties?.categories ?? [];
	const htmlLines = [`<strong>Hex ${feature?.properties?.hexId ?? ''}</strong>`, `Total: ${total}`];
	for (const cat of breakdown) {
		const color = palette[cat.name]?.color || '#888888';
		const pct = total > 0 ? ((cat.count / total) * 100).toFixed(1) : '0.0';
		htmlLines.push(`<span style="display:inline-flex;align-items:center;gap:4px;">
			<span style="width:10px;height:10px;background:${color};display:inline-block;border-radius:50%;"></span>
			${cat.name}: ${cat.count} (${pct}%)
		</span>`);
	}
	marker.bindTooltip(htmlLines.join('<br/>'), { direction: 'top', opacity: 0.9 });
	return marker;
}

function renderPieLayer({ fitBounds } = {}) {
	if (!activeMap || !cachedContext) return false;

	if (layerGroup) {
		activeMap.removeLayer(layerGroup);
		layerGroup = null;
	}

	const markers = [];
	const { featureCollection, palette, visOptions, stats } = cachedContext;
	for (const feature of featureCollection.features) {
		const marker = createMarker(activeMap, feature, palette, visOptions, stats);
		if (marker) markers.push(marker);
	}

	if (!markers.length) {
		console.warn('[PieChartsVisualizer] All pie charts skipped due to insufficient data.');
		return false;
	}

	layerGroup = L.layerGroup(markers).addTo(activeMap);

	if (fitBounds) {
		const bounds = L.latLngBounds(markers.map(m => m.getLatLng()));
		if (bounds.isValid()) {
			activeMap.fitBounds(bounds, { padding: [16, 16] });
		}
	}

	return true;
}

function attachZoomHandler(map) {
	if (!map || !cachedContext) return;
	zoomHandler = () => {
		renderPieLayer({ fitBounds: false });
	};
	map.on('zoomend', zoomHandler);
}

export default async function main(map, geojson, options = {}) {
	reset(map);
	ensureStyles();

	const featureCollection = normalizeFeatureCollection(geojson);
	if (!featureCollection || !Array.isArray(featureCollection.features) || featureCollection.features.length === 0) {
		console.warn('[PieChartsVisualizer] No data to render.');
		return {};
	}

	const palette = options.palette || {};
	const visOptions = options.visOptions || {};
	const stats = {
		globalMaxCategoryCount: featureCollection.properties?.globalMaxCategoryCount ?? 0,
		globalTotalCount: featureCollection.properties?.globalTotalCount ?? 0
	};

	activeMap = map;
	cachedContext = { featureCollection, palette, visOptions, stats };

	const rendered = renderPieLayer({ fitBounds: true });
	if (!rendered) {
		return {};
	}

	attachZoomHandler(map);

	return { pieCharts: layerGroup };
}

