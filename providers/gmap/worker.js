import { point, featureCollection } from '@turf/helpers';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { centroid } from '@turf/turf';

const GOOGLE_PLACES_ENDPOINT = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const NEXT_PAGE_DELAY_MS = 2200;

const delay = (ms) => ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

const transientStatus = new Set(['UNKNOWN_ERROR', 'INVALID_REQUEST']);

function escapeHtml(input = '') {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchPlaces(params, attempt = 0) {
  const url = new URL(GOOGLE_PLACES_ENDPOINT);
  url.searchParams.set('key', params.apiKey);
  url.searchParams.set('query', params.queryText);
  if (params.language) url.searchParams.set('language', params.language);
  if (params.location) url.searchParams.set('location', `${params.location.lat},${params.location.lng}`);
  if (params.radius) url.searchParams.set('radius', String(params.radius));
  if (params.rectangle) {
    const { minLat, minLon, maxLat, maxLon } = params.rectangle;
    url.searchParams.set('locationbias', `rectangle:${minLat},${minLon}|${maxLat},${maxLon}`);
  }
  if (params.pageToken) url.searchParams.set('pagetoken', params.pageToken);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google Places HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
    return data;
  }
  if (transientStatus.has(data.status) && params.pageToken && attempt < 3) {
    await delay(1000 * (attempt + 1));
    return fetchPlaces(params, attempt + 1);
  }
  const detail = data.error_message ? `${data.status}: ${data.error_message}` : data.status;
  throw new Error(detail || 'Google Places API error');
}

function getTriangleContainingPoint(pt, triangles) {
  const matches = triangles.features.filter((tri) => booleanPointInPolygon(pt, tri));
  const rawId = matches[0]?.properties?.triangleId;
  return rawId ? rawId.split('-')[1] || rawId : null;
}

function buildFeature(place, hex, triangles, queryText) {
  const location = place?.geometry?.location;
  if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
    return null;
  }
  const coords = [location.lng, location.lat];
  const basePoint = point(coords);
  const triId = getTriangleContainingPoint(basePoint, triangles);
  const safeName = place?.name ? escapeHtml(place.name) : '';
  const gmapUrl = place?.place_id
    ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(place.place_id)}`
    : null;
  return point(coords, {
    id: place.place_id,
    place_id: place.place_id,
    name: place.name,
    formatted_address: place.formatted_address,
    rating: place.rating ?? null,
    user_ratings_total: place.user_ratings_total ?? null,
    price_level: place.price_level ?? null,
    business_status: place.business_status ?? null,
    types: place.types ?? [],
    splatone_provider: 'gmap',
    splatone_hexId: hex?.properties?.hexId,
    splatone_triId: triId,
    text_query: queryText,
    tooltipContent: safeName || escapeHtml(place?.formatted_address ?? '') || 'Unnamed place',
    gmap_url: gmapUrl
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
    const safePayload = JSON.parse(JSON.stringify(payload));
    port.postMessage(safePayload);
  };

  try {
    await delay(Number(providerOptions?.WaitMs) || 0);
    const apiKey = providerOptions?.APIKEY;
    if (!apiKey) {
      throw new Error('API key is missing');
    }
    const queryText = providerOptions?.QueryText || tags;
    if (!queryText) {
      throw new Error('検索クエリが空です');
    }
    const radius = Number(providerOptions?.Radius) || 2000;
    const language = providerOptions?.Language || 'ja';
    const maxPages = Math.max(1, Math.min(3, Number(providerOptions?.MaxPages) || 3));
    const expectedCap = Math.max(1, Number(providerOptions?.ExpectedPerHex) || 60);
    const pageIndex = Number(providerOptions?.PageIndex) || 0;
    const accumulated = Number(providerOptions?.Accumulated) || 0;
    const pageToken = providerOptions?.PageToken || null;
    const termId = providerOptions?.TermId || `page-${pageIndex}`;

    const centroidPoint = centroid(hex);
    const [lon, lat] = centroidPoint?.geometry?.coordinates ?? [null, null];
    const location = (Number.isFinite(lat) && Number.isFinite(lon)) ? { lat, lng: lon } : null;

    const boundingRect = Array.isArray(bbox) && bbox.length === 4
      ? (() => {
        const [minLon, minLat, maxLon, maxLat] = bbox.map((v) => Number(v));
        if ([minLon, minLat, maxLon, maxLat].some((v) => !Number.isFinite(v))) {
          return null;
        }
        if (minLon >= maxLon || minLat >= maxLat) {
          return null;
        }
        return { minLon, minLat, maxLon, maxLat };
      })()
      : null;

    const data = await fetchPlaces({
      apiKey,
      queryText,
      language,
      location,
      radius,
      rectangle: boundingRect,
      pageToken
    });

    const rawResults = Array.isArray(data.results) ? data.results : [];
    const features = [];
    const ids = [];
    let outsideCount = 0;
    const hexPoly = hex;
    rawResults.forEach((place) => {
      const feature = buildFeature(place, hex, triangles, queryText);
      if (!feature) {
        outsideCount += 1;
        return;
      }
      if (!booleanPointInPolygon(feature, hexPoly)) {
        outsideCount += 1;
        return;
      }
      features.push(feature);
      if (feature.properties?.id) {
        ids.push(feature.properties.id);
      }
    });

    console.log('[gmap worker] hex=%s category=%s query="%s" total=%d inside=%d outside=%d',
      hex?.properties?.hexId ?? 'unknown',
      category ?? 'unknown',
      queryText,
      rawResults.length,
      features.length,
      outsideCount);

    const nextToken = data.next_page_token && (pageIndex + 1 < maxPages) ? data.next_page_token : null;
    const newCrawled = accumulated + features.length;
    const hasNext = Boolean(nextToken);
    const remainingEstimate = hasNext ? Math.max(0, expectedCap - newCrawled) : 0;

    const nextProviderOptions = [];
    if (hasNext) {
      nextProviderOptions.push({
        ...providerOptions,
        PageToken: nextToken,
        WaitMs: NEXT_PAGE_DELAY_MS,
        PageIndex: pageIndex + 1,
        Accumulated: newCrawled,
        TermId: `page-${pageIndex + 1}`,
        PrevTermId: providerOptions?.TermId ?? null
      });
    }

    respond({
      results: {
        photos: featureCollection(features),
        hexId: hex?.properties?.hexId ?? null,
        tags,
        category,
        nextProviderOptions,
        TermId: termId,
        prevTermId: providerOptions?.PrevTermId ?? null,
        remaining: remainingEstimate,
        expected: expectedCap,
        outside: outsideCount,
        ids,
        final: !hasNext
      }
    });
    return true;
  } catch (err) {
    respond({
      results: {
        photos: featureCollection([]),
        hexId: hex?.properties?.hexId ?? null,
        tags,
        category,
        nextProviderOptions: [],
        TermId: providerOptions?.TermId || 'page-0',
        prevTermId: providerOptions?.PrevTermId ?? null,
        remaining: 0,
        expected: Math.max(1, Number(providerOptions?.ExpectedPerHex) || 60),
        outside: 0,
        ids: [],
        final: true,
        error: {
          message: err?.message || String(err)
        }
      }
    });
    console.error('[gmap worker] Fatal error', {
      sessionId,
      provider,
      hexId: hex?.properties?.hexId,
      category,
      reason: err?.message
    });
    return false;
  }
}
