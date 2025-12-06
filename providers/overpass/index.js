import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Bottleneck from 'bottleneck';
import { ProviderBase } from '../../lib/ProviderBase.js';
import { bbox, polygon, centroid, booleanPointInPolygon, featureCollection } from '@turf/turf';

const DEFAULT_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const DEFAULT_TIMEOUT_SECONDS = 25;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_USER_AGENT = 'Splatone-Overpass (+https://github.com/YokoyamaLab/Splatone)';
const DEFAULT_THROTTLE_MAX_CONCURRENT = 1;
const DEFAULT_THROTTLE_MIN_TIME_MS = 1500;

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

export default class OverpassProvider extends ProviderBase {
  static name = 'Overpass (OpenStreetMap) Provider';
  static description = 'Overpass API を使って OpenStreetMap の POI を収集します。';
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
      .option(this.arg('Endpoint'), {
        group: `For ${this.id} Provider`,
        type: 'string',
        default: DEFAULT_ENDPOINT,
        description: 'Overpass API interpreter endpoint URL'
      })
      .option(this.arg('TimeoutSeconds'), {
        group: `For ${this.id} Provider`,
        type: 'number',
        default: DEFAULT_TIMEOUT_SECONDS,
        description: 'Overpass リクエストのタイムアウト (秒)'
      })
      .option(this.arg('MaxRetries'), {
        group: `For ${this.id} Provider`,
        type: 'number',
        default: DEFAULT_MAX_RETRIES,
        description: 'HTTP/ネットワークエラー時の再試行回数'
      })
      .option(this.arg('UserAgent'), {
        group: `For ${this.id} Provider`,
        type: 'string',
        default: DEFAULT_USER_AGENT,
        description: 'Overpass API に送信する User-Agent 文字列'
      })
      .option(this.arg('ThrottleMaxConcurrent'), {
        group: `For ${this.id} Provider`,
        type: 'number',
        default: DEFAULT_THROTTLE_MAX_CONCURRENT,
        description: 'Overpass リクエストを同時に何本まで投げるか (1 以上)'
      })
      .option(this.arg('ThrottleMinTimeMs'), {
        group: `For ${this.id} Provider`,
        type: 'number',
        default: DEFAULT_THROTTLE_MIN_TIME_MS,
        description: '連続リクエスト間の最小待機時間 (ミリ秒)'
      });
  }

  async check(options = {}) {
    const endpointInput = String(options.Endpoint || DEFAULT_ENDPOINT).trim();
    let endpoint;
    try {
      endpoint = new URL(endpointInput).toString();
    } catch {
      throw new Error('Overpass Endpoint は有効な URL を指定してください');
    }

    const throttleMaxConcRaw = Number(options.ThrottleMaxConcurrent ?? DEFAULT_THROTTLE_MAX_CONCURRENT);
    const throttleMinTimeRaw = Number(options.ThrottleMinTimeMs ?? DEFAULT_THROTTLE_MIN_TIME_MS);
    const throttleMaxConcurrent = Number.isFinite(throttleMaxConcRaw) && throttleMaxConcRaw > 0
      ? Math.floor(throttleMaxConcRaw)
      : DEFAULT_THROTTLE_MAX_CONCURRENT;
    const throttleMinTimeMs = Number.isFinite(throttleMinTimeRaw) && throttleMinTimeRaw >= 0
      ? Math.floor(throttleMinTimeRaw)
      : DEFAULT_THROTTLE_MIN_TIME_MS;

    const timeoutSeconds = Number(options.TimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS);
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
      throw new Error('TimeoutSeconds は 1 以上の数値で指定してください');
    }

    const maxRetries = Number(options.MaxRetries ?? DEFAULT_MAX_RETRIES);
    if (!Number.isFinite(maxRetries) || maxRetries < 0) {
      throw new Error('MaxRetries は 0 以上の整数で指定してください');
    }

    const userAgent = String(options.UserAgent || DEFAULT_USER_AGENT).trim() || DEFAULT_USER_AGENT;

    return {
      Endpoint: endpoint,
      TimeoutSeconds: timeoutSeconds,
      MaxRetries: Math.floor(maxRetries),
      UserAgent: userAgent,
      ThrottleMaxConcurrent: throttleMaxConcurrent,
      ThrottleMinTimeMs: throttleMinTimeMs
    };
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

  async crawl({ hexGrid, triangles, categories, sessionId, providerOptions }) {
    if (!this.started) {
      this.start();
    }

    const resolvedOptions = {
      Endpoint: providerOptions?.Endpoint ?? this.options.Endpoint ?? DEFAULT_ENDPOINT,
      TimeoutSeconds: providerOptions?.TimeoutSeconds ?? this.options.TimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
      MaxRetries: providerOptions?.MaxRetries ?? this.options.MaxRetries ?? DEFAULT_MAX_RETRIES,
      UserAgent: providerOptions?.UserAgent ?? this.options.UserAgent ?? DEFAULT_USER_AGENT,
      ThrottleMaxConcurrent: providerOptions?.ThrottleMaxConcurrent ?? this.options.ThrottleMaxConcurrent ?? DEFAULT_THROTTLE_MAX_CONCURRENT,
      ThrottleMinTimeMs: providerOptions?.ThrottleMinTimeMs ?? this.options.ThrottleMinTimeMs ?? DEFAULT_THROTTLE_MIN_TIME_MS
    };

    const getTrianglesInHex = (hexFeature, triCollection) => {
      const hexPoly = polygon(hexFeature.geometry.coordinates);
      const selected = triCollection.features.filter((tri) => {
        const triPoly = polygon(tri.geometry.coordinates);
        const triCenter = centroid(triPoly);
        return booleanPointInPolygon(triCenter, hexPoly);
      });
      return featureCollection(selected);
    };

    const effectiveCategories = categories ?? {};
    const hexFeatures = hexGrid?.features ?? [];

    const limiter = this.getThrottleLimiter(resolvedOptions);

    hexFeatures.forEach((hexFeature) => {
      const hexId = hexFeature?.properties?.hexId;
      if (hexId == null) {
        return;
      }
      const trianglesInHex = getTrianglesInHex(hexFeature, triangles);
      const bboxArray = bbox(hexFeature.geometry);

      Object.entries(effectiveCategories).forEach(([categoryName, tags]) => {
        const queryVariants = splitQueryVariants(tags, categoryName);
        const variantCount = queryVariants.length || 1;

        queryVariants.forEach((queryText, variantIndex) => {
          const workerOptions = {
            provider: this.id,
            hex: hexFeature,
            triangles: trianglesInHex,
            bbox: bboxArray,
            category: categoryName,
            tags: queryText,
            providerOptions: {
              Endpoint: resolvedOptions.Endpoint,
              TimeoutSeconds: resolvedOptions.TimeoutSeconds,
              MaxRetries: resolvedOptions.MaxRetries,
              UserAgent: resolvedOptions.UserAgent,
              QueryText: queryText,
              QueryVariantIndex: variantIndex,
              CategoryQueryTotal: variantCount,
              ProgressDelta: 1,
              TermId: `variant-${variantIndex}`
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

    return `${this.id} initialized for ${hexFeatures.length} hexes.`;
  }
}
