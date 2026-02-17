function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pointInRing(lon, lat, ring) {
  // ring: [[lon,lat], ...] (closed or not)
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lon, lat, polygon) {
  const coords = polygon?.geometry?.coordinates;
  if (!coords || polygon?.geometry?.type !== 'Polygon') return false;
  const ring = coords[0];
  if (!Array.isArray(ring) || ring.length < 3) return false;
  return pointInRing(lon, lat, ring);
}

export default async function ({ port, hex, category, providerOptions }) {
  const respond = (payload) => {
    const safePayload = JSON.parse(JSON.stringify(payload));
    port.postMessage(safePayload);
  };

  const ring = hex?.geometry?.coordinates?.[0];
  if (!hex || hex?.geometry?.type !== 'Polygon' || !Array.isArray(ring)) {
    respond({
      results: {
        photos: { type: 'FeatureCollection', features: [] },
        hexId: hex?.properties?.hexId ?? null,
        tags: [],
        category,
        nextProviderOptions: [],
        TermId: providerOptions?.TermId ?? 'a',
        remaining: 0,
        outside: 0,
        ids: [],
        final: true,
        error: { message: 'invalid hex polygon' }
      }
    });
    return false;
  }

  const pointsPerHex = Math.max(0, Math.floor(Number(providerOptions?.PointsPerHex ?? 20)));
  const seedStr = String(providerOptions?.Seed ?? '') || `${hex?.properties?.hexId ?? ''}:${category ?? ''}`;
  const rand = mulberry32(hashStringToSeed(seedStr));

  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const p of ring) {
    minLon = Math.min(minLon, p[0]);
    minLat = Math.min(minLat, p[1]);
    maxLon = Math.max(maxLon, p[0]);
    maxLat = Math.max(maxLat, p[1]);
  }

  const features = [];
  const ids = [];
  let attempts = 0;
  while (features.length < pointsPerHex && attempts < pointsPerHex * 50) {
    attempts += 1;
    const lon = minLon + (maxLon - minLon) * rand();
    const lat = minLat + (maxLat - minLat) * rand();
    if (!pointInPolygon(lon, lat, hex)) continue;

    const id = `hello:${hex?.properties?.hexId ?? 'x'}:${category ?? 'cat'}:${features.length}`;
    ids.push(id);
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {
        id,
        splatone_provider: 'hello',
        splatone_hexId: hex?.properties?.hexId ?? null,
        tooltipContent: `hello (${category ?? ''})`
      }
    });
  }

  respond({
    results: {
      photos: { type: 'FeatureCollection', features },
      hexId: hex?.properties?.hexId,
      tags: [],
      category,
      nextProviderOptions: [],
      TermId: providerOptions?.TermId ?? 'a',
      remaining: 0,
      outside: 0,
      ids,
      final: true,
      progressExpected: pointsPerHex,
      progressDelta: pointsPerHex
    }
  });

  return true;
}
