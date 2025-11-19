let clusterLinkLayer = null;
let activeHullLayers = [];
const clusterStateMap = new Map();
const BASE_LINK_OPACITY = 0.05;
let anchorSyncAttached = false;

function computeLabelAttachmentLatLng(marker, map) {
  if (!marker || !map) return null;
  const markerEl = marker.getElement();
  if (!markerEl) return null;
  const labelEl = markerEl.querySelector('.dbscan-cluster-label') || markerEl;
  const labelRect = labelEl.getBoundingClientRect();
  if (!labelRect.width && !labelRect.height) {
    return null;
  }
  const mapRect = map.getContainer().getBoundingClientRect();
  const centerX = labelRect.left + labelRect.width / 2 - mapRect.left;
  const centerY = labelRect.top + labelRect.height / 2 - mapRect.top;
  return map.containerPointToLatLng([centerX, centerY]);
}

function syncClusterAnchor(state, map) {
  if (!state?.lines || !state.marker || !map) return;
  const targetLatLng = computeLabelAttachmentLatLng(state.marker, map) || state.marker.getLatLng();
  state.lines.forEach((line) => {
    const latLngs = line.getLatLngs();
    if (Array.isArray(latLngs) && latLngs.length > 0) {
      latLngs[0] = targetLatLng;
      line.setLatLngs(latLngs);
    }
  });
}

function refreshAllClusterAnchors(map) {
  clusterStateMap.forEach((state) => syncClusterAnchor(state, map));
}

function reset(map) {
  activeHullLayers.forEach((layer) => {
    if (layer && typeof map.removeLayer === 'function') {
      map.removeLayer(layer);
    }
  });
  activeHullLayers = [];
  if (clusterLinkLayer) {
    map.removeLayer(clusterLinkLayer);
    clusterLinkLayer = null;
  }
  clusterStateMap.clear();
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

function setClusterHighlight(clusterId, isActive) {
  const state = clusterStateMap.get(clusterId);
  if (!state) return;
  const targetOpacity = isActive ? 1 : BASE_LINK_OPACITY;
  state.lines.forEach((line) => line.setStyle({ opacity: targetOpacity }));
  state.points.forEach((marker) => marker.setStyle({ opacity: targetOpacity, fillOpacity: targetOpacity }));
}

function ensureAnchorSync(map) {
  if (anchorSyncAttached || !map) return;
  anchorSyncAttached = true;
  const handler = () => refreshAllClusterAnchors(map);
  map.on('zoomend', handler);
  map.on('moveend', handler);
  map.on('resize', handler);
}

function buildClusterLinkLayer(entries = [], map) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }
  const group = L.featureGroup();
  entries.forEach((entry) => {
    if (!entry || !entry.clusterId || !Array.isArray(entry.points) || !entry.points.length || !Array.isArray(entry.anchor)) {
      return;
    }
    const anchorLatLng = [entry.anchor[1], entry.anchor[0]];
    const lines = [];
    const dots = [];
    const strokeColor = entry.strokeColor || '#1f2933';
    const fillColor = entry.fillColor || strokeColor;
    entry.points.forEach((coords) => {
      if (!Array.isArray(coords) || coords.length < 2) return;
      const latLng = [coords[1], coords[0]];
      const line = L.polyline([anchorLatLng, latLng], {
        color: strokeColor,
        weight: 1,
        opacity: BASE_LINK_OPACITY,
        interactive: false
      });
      const circle = L.circleMarker(latLng, {
        radius: 3,
        color: strokeColor,
        weight: 1,
        opacity: BASE_LINK_OPACITY,
        fillOpacity: BASE_LINK_OPACITY,
        fillColor,
        interactive: false
      });
      line.addTo(group);
      circle.addTo(group);
      lines.push(line);
      dots.push(circle);
    });

    const horizontalDir = entry.labelDirection?.horizontal ?? 1;
    const verticalDir = entry.labelDirection?.vertical ?? -1;
    const marker = L.marker(anchorLatLng, {
      title: entry.clusterId,
      draggable: true,
      autoPan: true,
      icon: L.divIcon({
        className: [
          'dbscan-cluster-label-icon',
          horizontalDir >= 0 ? 'align-right' : 'align-left',
          verticalDir >= 0 ? 'align-top' : 'align-bottom'
        ].filter(Boolean).join(' '),
        html: `<div class="dbscan-cluster-label">${entry.clusterId}</div>`,
        iconSize: null
      })
    });
    marker.on('mouseover', () => setClusterHighlight(entry.clusterId, true));
    marker.on('mouseout', () => setClusterHighlight(entry.clusterId, false));
    marker.bindTooltip(
      `<div class="dbscan-cluster-tooltip">クラスタ: ${entry.clusterId}<br>ポイント数: ${entry.pointCount ?? 0}</div>`,
      {
        direction: 'top',
        offset: [0, -10],
        sticky: true,
        opacity: 0.9
      }
    );

    let stateRef = null;
    const applyAnchorSync = () => {
      syncClusterAnchor(stateRef, map);
    };

    marker.on('drag', applyAnchorSync);
    marker.addTo(group);
    marker.on('add', () => {
      requestAnimationFrame(applyAnchorSync);
    });

    const state = { lines, points: dots, marker, applyAnchorSync };
    stateRef = state;
    clusterStateMap.set(entry.clusterId, state);
  });
  return group;
}

export default async function main(map, geojson) {
  reset(map);

  if (!geojson || typeof geojson !== 'object') {
    return {};
  }

  const layers = {};
  const linkEntries = Array.isArray(geojson.__clusterLinks) ? geojson.__clusterLinks : [];

  for (const [category, collection] of Object.entries(geojson)) {
    if (category === '__clusterLinks') continue;
    const layer = createCategoryLayer(category, collection);
    if (!layer) continue;
    layer.addTo(map);
    activeHullLayers.push(layer);
    layers[category] = layer;
  }

  if (linkEntries.length > 0) {
    clusterLinkLayer = buildClusterLinkLayer(linkEntries, map);
    if (clusterLinkLayer) {
      clusterLinkLayer.addTo(map);
      layers['Cluster Links'] = clusterLinkLayer;
      ensureAnchorSync(map);
    }
  }

  const fitLayers = [...activeHullLayers];
  if (clusterLinkLayer) fitLayers.push(clusterLinkLayer);
  if (fitLayers.length > 0) {
    const bounds = L.featureGroup(fitLayers).getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24] });
    }
  }

  return layers;
}
