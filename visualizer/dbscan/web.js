let layerGroup = null;

function reset(map) {
  if (layerGroup) {
    map.removeLayer(layerGroup);
    layerGroup = null;
  }
}

function buildPopupHtml(feature, categoryLabel) {
  const props = feature?.properties ?? {};
  const clusterId = props.clusterId || `${categoryLabel}-cluster`;
  const count = props.pointCount ?? 'n/a';
  const eps = props.eps ?? 'n/a';
  const minPts = props.minPts ?? 'n/a';
  return `
    <div class="dbscan-popup">
      <strong>${props.category || categoryLabel}</strong><br />
      クラスタ: ${clusterId}<br />
      ポイント数: ${count}<br />
      eps: ${eps} / minPts: ${minPts}
    </div>
  `;
}

function createCategoryLayer(category, geojson) {
  if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    return null;
  }

  const layer = L.geoJSON(geojson, {
    style: (feature) => {
      const props = feature?.properties ?? {};
      return {
        color: props.strokeColor || '#1f2933',
        weight: props.strokeWidth ?? 2,
        opacity: props.strokeOpacity ?? 0.9,
        dashArray: props.dashArray || null,
        fill: true,
        fillColor: props.fillColor || '#3388ff',
        fillOpacity: props.fillOpacity ?? 0.35,
      };
    },
    onEachFeature: (feature, layerInstance) => {
      layerInstance.bindPopup(buildPopupHtml(feature, category));
    }
  });

  return layer;
}

export default async function main(map, geojson) {
  reset(map);

  if (!geojson || typeof geojson !== 'object') {
    return {};
  }

  const layers = {};
  const nativeLayers = [];

  for (const [category, collection] of Object.entries(geojson)) {
    const layer = createCategoryLayer(category, collection);
    if (!layer) continue;
    nativeLayers.push(layer);
    layers[category] = layer;
  }

  if (nativeLayers.length > 0) {
    layerGroup = L.featureGroup(nativeLayers).addTo(map);
    const bounds = layerGroup.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24] });
    }
  }

  return layers;
}
