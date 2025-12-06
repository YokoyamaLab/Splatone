import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Bottleneck from 'bottleneck';
import { ProviderBase } from '../../lib/ProviderBase.js';
import { bbox, polygon, centroid, booleanPointInPolygon, featureCollection } from '@turf/turf';
import { loadAPIKey } from '#lib/splatone';

const EXPECTED_PER_HEX = 60;
const DEFAULT_RADIUS_METERS = 2000;
const MAX_RADIUS_METERS = 50000;
const DEFAULT_THROTTLE_MAX_CONCURRENT = 2;
const DEFAULT_THROTTLE_MIN_TIME_MS = 500;
const UNIT_TO_METERS = {
  meters: 1,
  kilometers: 1000,
  miles: 1609.344
};

function clampRadiusMeters(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_RADIUS_METERS;
  }
  return Math.max(1, Math.min(MAX_RADIUS_METERS, value));
}

function deriveRadiusFromGridMeta(gridMeta) {
  const cellSize = Number(gridMeta?.cellSize);
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    return DEFAULT_RADIUS_METERS;
  }
  const unitKey = typeof gridMeta?.units === 'string'
    ? gridMeta.units.toLowerCase()
    : 'kilometers';
  const factor = UNIT_TO_METERS[unitKey] ?? UNIT_TO_METERS.kilometers;
  const meters = cellSize * factor;
  return clampRadiusMeters(meters);
}

function splitQueryVariants(value, fallback) {
  const ensureFallback = () => [fallback ?? ''];
  if (typeof value !== 'string') {
    return ensureFallback();
  }
  const normalized = value.trim();
  if (!normalized.length) {
    return ensureFallback();
  }
  const parts = normalized
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length ? parts : [normalized];
}

export default class GMapProvider extends ProviderBase {
  static name = 'Google Places Text Search Provider';
  static description = 'Google Maps Places Text Search APIから地点情報を収集します。';
  static version = '1.0.0';

  constructor(api, options = {}) {
    super(api, options);
    this.id = path.basename(path.dirname(fileURLToPath(import.meta.url)));
    this._throttleLimiter = null;
    this._throttleKey = null;
  }

  arg(key) {
    return this.argKey(key);
  }

  async yargv(yargv) {
    return yargv
      .option(this.arg('APIKEY'), {
        group: `For ${this.id} Provider`,
        type: 'string',
        description: 'Google Maps Places APIキー'
      })
      .option(this.arg('Language'), {
        group: `For ${this.id} Provider`,
        type: 'string',
        default: 'ja',
        description: 'Places APIレスポンスの言語コード'
      })
      .option(this.arg('MaxPages'), {
        group: `For ${this.id} Provider`,
        type: 'number',
        default: 3,
        description: 'Text Searchで辿る最大ページ数(1〜3)'
      })
      .option(this.arg('ThrottleMaxConcurrent'), {
        group: `For ${this.id} Provider`,
        type: 'number',
        default: DEFAULT_THROTTLE_MAX_CONCURRENT,
        description: 'Google Places リクエストの同時実行数'
      })
      .option(this.arg('ThrottleMinTimeMs'), {
        group: `For ${this.id} Provider`,
        type: 'number',
        default: DEFAULT_THROTTLE_MIN_TIME_MS,
        description: '連続リクエスト間の最小待機時間 (ミリ秒)'
      });
  }

  async check(options = {}) {
    if (!options.APIKEY) {
      options.APIKEY = await loadAPIKey(this.id);
    }
    const key = String(options.APIKEY || '').trim();
    if (!/^AIza[0-9A-Za-z_-]{10,}$/.test(key)) {
      throw new Error('Google Maps APIキーの形式が不正です。AIza...で始まるキーを指定してください');
    }
    options.APIKEY = key;

    const language = String(options.Language || 'ja').trim() || 'ja';
    options.Language = language;

    const maxPages = Math.max(1, Math.min(3, Number(options.MaxPages ?? 3)));
    options.MaxPages = maxPages;

    const throttleMaxConcRaw = Number(options.ThrottleMaxConcurrent ?? DEFAULT_THROTTLE_MAX_CONCURRENT);
    const throttleMinTimeRaw = Number(options.ThrottleMinTimeMs ?? DEFAULT_THROTTLE_MIN_TIME_MS);
    const throttleMaxConcurrent = Number.isFinite(throttleMaxConcRaw) && throttleMaxConcRaw > 0
      ? Math.floor(throttleMaxConcRaw)
      : DEFAULT_THROTTLE_MAX_CONCURRENT;
    const throttleMinTimeMs = Number.isFinite(throttleMinTimeRaw) && throttleMinTimeRaw >= 0
      ? Math.floor(throttleMinTimeRaw)
      : DEFAULT_THROTTLE_MIN_TIME_MS;

    options.ThrottleMaxConcurrent = throttleMaxConcurrent;
    options.ThrottleMinTimeMs = throttleMinTimeMs;

    return options;
  }

  getThrottleLimiter({ ThrottleMaxConcurrent, ThrottleMinTimeMs } = {}) {
    const maxConcurrent = Math.max(1, Math.floor(ThrottleMaxConcurrent ?? DEFAULT_THROTTLE_MAX_CONCURRENT));
    const minTime = Math.max(0, Math.floor(ThrottleMinTimeMs ?? DEFAULT_THROTTLE_MIN_TIME_MS));
    const key = `${maxConcurrent}:${minTime}`;
    if (!this._throttleLimiter || this._throttleKey !== key) {
      this._throttleLimiter = new Bottleneck({ maxConcurrent, minTime });
      this._throttleKey = key;
    }
    return this._throttleLimiter;
  }

  async crawl({ hexGrid, triangles, categories, sessionId, providerOptions, gridMeta }) {
    if (!this.started) {
      this.start();
    }

    const getTrianglesInHex = (hex, tris) => {
      const hexPoly = polygon(hex.geometry.coordinates);
      const selected = tris.features.filter((tri) => {
        const triPoly = polygon(tri.geometry.coordinates);
        const triCenter = centroid(triPoly);
        return booleanPointInPolygon(triCenter, hexPoly);
      });
      return featureCollection(selected);
    };

    const radius = deriveRadiusFromGridMeta(gridMeta);

    const resolvedOptions = {
      APIKEY: providerOptions?.APIKEY ?? this.options.APIKEY,
      Radius: radius,
      Language: providerOptions?.Language ?? this.options.Language ?? 'ja',
      MaxPages: providerOptions?.MaxPages ?? this.options.MaxPages ?? 3,
      ThrottleMaxConcurrent: providerOptions?.ThrottleMaxConcurrent ?? this.options.ThrottleMaxConcurrent ?? DEFAULT_THROTTLE_MAX_CONCURRENT,
      ThrottleMinTimeMs: providerOptions?.ThrottleMinTimeMs ?? this.options.ThrottleMinTimeMs ?? DEFAULT_THROTTLE_MIN_TIME_MS
    };

    const baseOptions = {
      APIKEY: resolvedOptions.APIKEY,
      Radius: resolvedOptions.Radius,
      Language: resolvedOptions.Language,
      MaxPages: resolvedOptions.MaxPages,
      ExpectedPerHex: EXPECTED_PER_HEX
    };

    const limiter = this.getThrottleLimiter(resolvedOptions);

    hexGrid.features.forEach((hexFeature) => {
      const hexId = hexFeature?.properties?.hexId;
      if (hexId == null) {
        return;
      }
      const trianglesInHex = getTrianglesInHex(hexFeature, triangles);
      const bboxArray = bbox(hexFeature.geometry);
      Object.entries(categories || {}).forEach(([categoryName, tags]) => {
        const queryVariants = splitQueryVariants(tags, categoryName);
        queryVariants.forEach((queryText, variantIndex) => {
          const termPrefix = `q${variantIndex}`;
          const workerOptions = {
            provider: this.id,
            hex: hexFeature,
            triangles: trianglesInHex,
            bbox: bboxArray,
            category: categoryName,
            tags: queryText,
            providerOptions: {
              ...baseOptions,
              QueryText: queryText,
              QueryVariantIndex: variantIndex,
              PageIndex: 0,
              TermId: `${termPrefix}-page-0`,
              PrevTermId: null,
              Accumulated: 0,
              WaitMs: 0
            },
            sessionId
          };
          limiter.schedule(() => {
            this.api.emit('splatone:start', workerOptions);
            return null;
          });
        });
      });
    });
    return `${this.id} initialized for ${hexGrid.features.length} hexes.`;
  }
}
