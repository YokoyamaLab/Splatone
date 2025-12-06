import { point, featureCollection } from '@turf/helpers';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';

const DEFAULT_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const DEFAULT_TIMEOUT_SECONDS = 25;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_USER_AGENT = 'Splatone-Overpass (+https://github.com/YokoyamaLab/Splatone)';

const delay = (ms) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

function escapeHtml(input = '') {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeBoundingBox(rawBbox = []) {
  if (!Array.isArray(rawBbox) || rawBbox.length !== 4) {
    throw new Error('Invalid bbox passed to overpass worker');
  }
  const [minLon, minLat, maxLon, maxLat] = rawBbox.map((value) => Number(value));
  if ([minLon, minLat, maxLon, maxLat].some((value) => !Number.isFinite(value))) {
    throw new Error('BBox contains non-numeric values');
  }
  if (minLon >= maxLon || minLat >= maxLat) {
    throw new Error('BBox min must be less than max for both lon/lat');
  }
  return {
    south: Math.min(minLat, maxLat),
    west: Math.min(minLon, maxLon),
    north: Math.max(minLat, maxLat),
    east: Math.max(minLon, maxLon)
  };
}

function escapeTagValue(value) {
  return String(value).replace(/"/g, '\\"');
}

function parseQuerySpec(rawSpec = '') {
  const spec = String(rawSpec || '').trim();
  if (!spec) {
    throw new Error('Overpass query spec is empty');
  }
  const typeMatch = spec.match(/^(node|way|relation)\s*:(.+)$/i);
  let types = ['node', 'way', 'relation'];
  let remainder = spec;
  if (typeMatch) {
    types = [typeMatch[1].toLowerCase()];
    remainder = typeMatch[2].trim();
  }
  const operatorMatch = remainder.match(/(!=|=~|!~|=)/);
  let key;
  let value;
  let operator;
  if (operatorMatch) {
    operator = operatorMatch[1];
    const idx = remainder.indexOf(operator);
    key = remainder.slice(0, idx).trim();
    value = remainder.slice(idx + operator.length).trim();
  } else {
    key = remainder.trim();
    operator = null;
  }
  if (!key) {
    throw new Error(`Invalid query spec: ${rawSpec}`);
  }
  if (!operator) {
    return { types, filter: `["${escapeTagValue(key)}"]` };
  }
  if (!value.length) {
    throw new Error(`Query spec missing value: ${rawSpec}`);
  }
  return {
    types,
    filter: `["${escapeTagValue(key)}"${operator}"${escapeTagValue(value)}"]`
  };
}

function buildOverpassQuery({ spec, bbox, timeoutSeconds }) {
  const { types, filter } = parseQuerySpec(spec);
  const bboxClause = `(${bbox.south},${bbox.west},${bbox.north},${bbox.east})`;
  const statements = types.map((type) => `${type}${filter}${bboxClause};`).join('');
  const timeout = Math.max(1, Math.floor(timeoutSeconds || DEFAULT_TIMEOUT_SECONDS));
  return `[
    out:json
  ][timeout:${timeout}];
  (
    ${statements}
  );
  out center tags;`;
}

async function postOverpass({ endpoint, query, timeoutSeconds, maxRetries, userAgent }) {
  const body = new URLSearchParams({ data: query });
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'User-Agent': userAgent || DEFAULT_USER_AGENT
  };
  const timeoutMs = Math.max(1, Math.floor(timeoutSeconds || DEFAULT_TIMEOUT_SECONDS) * 1000);
  const retries = Math.max(0, Math.floor(maxRetries ?? DEFAULT_MAX_RETRIES));
  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint || DEFAULT_ENDPOINT, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!response.ok) {
        const text = await response.text();
        const error = new Error(`Overpass HTTP ${response.status}: ${text.slice(0, 200)}`);
        error.status = response.status;
        throw error;
      }
      const data = await response.json();
      if (Array.isArray(data?.elements)) {
        return data.elements;
      }
      throw new Error('Overpass response missing elements array');
    } catch (err) {
      clearTimeout(timer);
      const transient = err.name === 'AbortError' || (err.status && [429, 502, 503, 504].includes(err.status));
      if (!transient || attempt >= retries) {
        throw err;
      }
      const waitMs = Math.min(10000, 1000 * Math.pow(2, attempt));
      console.warn('[overpass worker] transient error, retrying...', { attempt, waitMs, reason: err.message });
      attempt += 1;
      await delay(waitMs);
    }
  }
}

function pickDisplayName(tags = {}) {
  const candidates = ['name:ja', 'name', 'name:en', 'brand', 'operator', 'amenity', 'shop'];
  for (const key of candidates) {
    if (tags[key]) {
      return tags[key];
    }
  }
  return null;
}

function buildTooltip(name, tags = {}) {
  const safeName = escapeHtml(name || tags['name:ja'] || tags.name || 'OSM Feature');
  const details = [];
  ['amenity', 'shop', 'tourism', 'leisure', 'highway'].forEach((key) => {
    if (tags[key]) {
      details.push(`${key}=${escapeHtml(tags[key])}`);
    }
  });
  if (!details.length) {
    return safeName;
  }
  return `${safeName}<br><small>${details.join(', ')}</small>`;
}

function resolveCoordinates(element = {}) {
  if (typeof element.lon === 'number' && typeof element.lat === 'number') {
    return [element.lon, element.lat];
  }
  if (element.center && typeof element.center.lon === 'number' && typeof element.center.lat === 'number') {
    return [element.center.lon, element.center.lat];
  }
  if (Array.isArray(element.geometry) && element.geometry.length) {
    const candidate = element.geometry[Math.floor(element.geometry.length / 2)];
    if (candidate && typeof candidate.lon === 'number' && typeof candidate.lat === 'number') {
      return [candidate.lon, candidate.lat];
    }
  }
  return null;
}

function getTriangleContainingPoint(pt, triangles) {
  const matches = triangles.features.filter((tri) => booleanPointInPolygon(pt, tri));
  const rawId = matches[0]?.properties?.triangleId;
  return rawId ? rawId.split('-')[1] || rawId : null;
}

function buildFeature(element, hex, triangles, queryText) {
  const coords = resolveCoordinates(element);
  if (!coords) {
    return null;
  }
  const basePoint = point(coords);
  if (!booleanPointInPolygon(basePoint, hex)) {
    return null;
  }
  const tags = element.tags ?? {};
  const displayName = pickDisplayName(tags);
  const triId = getTriangleContainingPoint(basePoint, triangles);
  return point(coords, {
    id: `${element.type}/${element.id}`,
    osm_id: element.id,
    osm_type: element.type,
    tags,
    name: displayName,
    splatone_provider: 'overpass',
    splatone_hexId: hex?.properties?.hexId,
    splatone_triId: triId,
    query: queryText,
    tooltipContent: buildTooltip(displayName, tags),
    osm_url: `https://www.openstreetmap.org/${element.type}/${element.id}`
  });
}

export default async function ({
  port,
  provider,
  hex,
  triangles,
  bbox,
  category,
  tags,
  providerOptions,
  sessionId
}) {
  const respond = (payload) => {
    const safe = JSON.parse(JSON.stringify(payload));
    port.postMessage(safe);
  };

  try {
    const endpoint = providerOptions?.Endpoint || DEFAULT_ENDPOINT;
    const timeoutSeconds = providerOptions?.TimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
    const maxRetries = providerOptions?.MaxRetries ?? DEFAULT_MAX_RETRIES;
    const userAgent = providerOptions?.UserAgent || DEFAULT_USER_AGENT;
    const queryText = providerOptions?.QueryText || tags;
    if (!queryText) {
      throw new Error('Overpass query text is empty');
    }
    const bboxObject = normalizeBoundingBox(bbox);
    const query = buildOverpassQuery({ spec: queryText, bbox: bboxObject, timeoutSeconds });
    const elements = await postOverpass({ endpoint, query, timeoutSeconds, maxRetries, userAgent });

    const features = [];
    const ids = [];
    let outside = 0;
    elements.forEach((element) => {
      const feature = buildFeature(element, hex, triangles, queryText);
      if (!feature) {
        outside += 1;
        return;
      }
      features.push(feature);
      if (feature.properties?.id) {
        ids.push(feature.properties.id);
      }
    });

    respond({
      results: {
        photos: featureCollection(features),
        hexId: hex?.properties?.hexId ?? null,
        tags,
        category,
        nextProviderOptions: [],
        TermId: providerOptions?.TermId || `variant-${providerOptions?.QueryVariantIndex ?? 0}`,
        remaining: 0,
        expected: Number(providerOptions?.CategoryQueryTotal) || 1,
        progressExpected: Number(providerOptions?.CategoryQueryTotal) || 1,
        progressDelta: Number(providerOptions?.ProgressDelta) || 1,
        outside,
        ids,
        final: true
      }
    });
    return true;
  } catch (err) {
    console.error('[overpass worker] Fatal error', {
      sessionId,
      provider,
      hexId: hex?.properties?.hexId,
      category,
      reason: err?.message
    });
    respond({
      results: {
        photos: featureCollection([]),
        hexId: hex?.properties?.hexId ?? null,
        tags,
        category,
        nextProviderOptions: [],
        TermId: providerOptions?.TermId || 'variant-0',
        remaining: 0,
        expected: Number(providerOptions?.CategoryQueryTotal) || 1,
        progressExpected: Number(providerOptions?.CategoryQueryTotal) || 1,
        progressDelta: Number(providerOptions?.ProgressDelta) || 1,
        outside: 0,
        ids: [],
        final: true,
        error: {
          message: err?.message || String(err)
        }
      }
    });
    return false;
  }
}
