let layerGroup = null;

function reset(map) {
  if (layerGroup) {
    map.removeLayer(layerGroup);
    layerGroup = null;
  }
}

function normalizeFeatureCollection(payload) {
  if (!payload) return null;
  if (payload.type === 'FeatureCollection' && Array.isArray(payload.features)) {
    return payload;
  }
  if (payload.voronoi && payload.voronoi.type === 'FeatureCollection') {
    return payload.voronoi;
  }
  if (Array.isArray(payload.features)) {
    return { type: 'FeatureCollection', features: payload.features };
  }
  return null;
}

function createVoronoiLayer(rawGeojson) {
  const geojson = normalizeFeatureCollection(rawGeojson);
  console.log('[VoronoiVisualizer] normalize', geojson);
  if (!geojson || !Array.isArray(geojson.features) || geojson.features.length === 0) {
    return null;
  }

  return L.geoJSON(geojson, {
    style: (feature) => {
      const props = feature?.properties ?? {};
      return {
        color: props.strokeColor || '#333333',
        weight: props.strokeWidth ?? 1,
        opacity: props.strokeOpacity ?? 1,
        fill: true,
        fillColor: props.fillColor || '#3388ff',
        fillOpacity: props.fillOpacity ?? 0.5
      };
    },
    onEachFeature: (feature, layer) => {
      const props = feature?.properties ?? {};
      const category = props.category || 'unknown';
      const hexId = props.hexId ?? 'n/a';
      const html = `<strong>${category}</strong><br/>hex: ${hexId}`;
      layer.bindPopup(html);
    }
  });
}

export default async function main(map, geojson, options = {}) {
  reset(map);

  const voronoiLayer = createVoronoiLayer(geojson);
  console.log('[VoronoiVisualizer] voronoiLayer:', voronoiLayer);
  if (!voronoiLayer) {
    console.warn('[VoronoiVisualizer] No features to render.');
    return {};
  }

  layerGroup = L.featureGroup([voronoiLayer]).addTo(map);

  const bounds = voronoiLayer.getBounds();
  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [16, 16] });
  }

  return { voronoi: layerGroup };
}
