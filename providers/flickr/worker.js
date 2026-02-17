import { point, featureCollection } from "@turf/helpers";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { toUnixSeconds } from '#lib/splatone';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PREVIEW_FIELDS = ['url_sq', 'url_s', 'url_t', 'url_q', 'url_m', 'url_n', 'url_z', 'url_c', 'url_l', 'url_o'];

function pickPreviewUrl(photo = {}) {
    for (const key of PREVIEW_FIELDS) {
        if (photo[key]) {
            return photo[key];
        }
    }
    return null;
}

function escapeHtml(input = '') {
    return String(input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function fetchWithRetry(fetcher, { timeoutMs, maxAttempts = 2, baseDelayMs = 500 } = {}) {
    const timeoutMsValue = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
        ? Math.floor(Number(timeoutMs))
        : null;
    let attempt = 0;
    let lastError = null;
    while (attempt < maxAttempts) {
        try {
            if (!timeoutMsValue) {
                return await fetcher({ signal: undefined });
            }
            const controller = new AbortController();
            const timer = setTimeout(() => {
                try {
                    controller.abort();
                } catch {
                    // ignore
                }
            }, timeoutMsValue);
            try {
                return await fetcher({ signal: controller.signal });
            } finally {
                clearTimeout(timer);
            }
        } catch (err) {
            lastError = err;
            const transient = isTransientNetworkError(err);
            attempt++;
            if (!transient || attempt >= maxAttempts) {
                throw lastError;
            }
            const waitMs = baseDelayMs * Math.pow(2, attempt - 1);
            console.warn(`[flickr worker] fetch attempt ${attempt} failed (${err?.cause?.code || err?.message}). Retrying in ${waitMs}ms.`);
            await delay(waitMs);
        }
    }
    throw lastError ?? new Error('Unknown Flickr fetch error');
}

function isTransientNetworkError(err) {
    const code = err?.cause?.code ?? err?.code;
    const status = err?.status;
    if (status === 429) return true;
    if (status && [500, 502, 503, 504].includes(status)) return true;
    if (code === 429) return true;
    if (!code && typeof err?.message === 'string' && err.message.includes('fetch failed')) {
        return true;
    }
    if (err?.name === 'AbortError') return true;
    if (typeof err?.message === 'string' && err.message.toLowerCase().includes('aborted')) return true;
    const transientCodes = new Set(['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE']);
    return transientCodes.has(code);
}

async function callFlickrRest(method, params, { apiKey, signal } = {}) {
    const endpoint = 'https://api.flickr.com/services/rest/';
    const searchParams = new URLSearchParams({
        method,
        api_key: apiKey,
        format: 'json',
        nojsoncallback: '1',
        ...Object.fromEntries(Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]))
    });
    const url = `${endpoint}?${searchParams.toString()}`;
    const res = await fetch(url, { method: 'GET', signal });
    if (!res.ok) {
        const err = new Error(`Flickr HTTP ${res.status}`);
        err.status = res.status;
        throw err;
    }
    const json = await res.json();
    if (json?.stat && json.stat !== 'ok') {
        const err = new Error(json?.message || 'Flickr API failure');
        err.code = json?.code ?? null;
        throw err;
    }
    return json;
}

export default async function ({
    port,
    debugVerbose,
    provider,
    hex,
    triangles,
    bbox,
    category,
    tags,
    providerOptions,
    sessionId
}) {
    debugVerbose = Boolean(debugVerbose);

    const respond = (payload) => {
        const safePayload = JSON.parse(JSON.stringify(payload));
        port.postMessage(safePayload);
    };

    try {
        let forcedFinalReason = null;
        if (!providerOptions.TermId) {
            //初期TermId
            providerOptions.TermId = 'a';
        }
        const prevTermId = typeof providerOptions?.PrevTermId === 'string' && providerOptions.PrevTermId.length
            ? providerOptions.PrevTermId
            : null;
        const baseParams = {
            bbox: bbox.join(','),
            tags: tags,
            extras: providerOptions["Extras"],
            sort: providerOptions["DateMode"] == "upload" ? "date-posted-desc" : "date-taken-desc"
        };
        baseParams[providerOptions["DateMode"] == "upload" ? 'max_upload_date' : 'max_taken_date'] = providerOptions["DateMax"];
        baseParams[providerOptions["DateMode"] == "upload" ? 'min_upload_date' : 'min_taken_date'] = providerOptions["DateMin"];
        //console.log("[baseParams]",baseParams);
        const requestTimeoutMs = Math.max(1_000, Math.min(5 * 60_000, Math.floor(Number(providerOptions?.RequestTimeoutMs ?? 30_000))));
        const retryMaxAttemptsRaw = Number(providerOptions?.RetryMaxAttempts ?? 2);
        const retryBaseDelayMsRaw = Number(providerOptions?.RetryBaseDelayMs ?? 500);
        const retryMaxAttempts = Number.isFinite(retryMaxAttemptsRaw) ? Math.max(1, Math.min(6, Math.floor(retryMaxAttemptsRaw))) : 2;
        const retryBaseDelayMs = Number.isFinite(retryBaseDelayMsRaw) ? Math.max(0, Math.min(30_000, Math.floor(retryBaseDelayMsRaw))) : 500;
        const apiKey = providerOptions["APIKEY"];
        const fetcher = ({ signal } = {}) => callFlickrRest('flickr.photos.search', {
            ...baseParams,
            has_geo: 1,
            per_page: 250,
            page: 1,
        }, { apiKey, signal });
        const res = await fetchWithRetry(fetcher, { timeoutMs: requestTimeoutMs, maxAttempts: retryMaxAttempts, baseDelayMs: retryBaseDelayMs });
    //console.log(res);
    const ids = [];
    const authors = {};
    const photos = featureCollection(res.photos.photo.filter(photo => {
        authors[photo.owner] ??= 0;
        authors[photo.owner]++;
        return booleanPointInPolygon(point([photo.longitude, photo.latitude]), hex);
    }).map(photo => {
        ids.push(photo.id);
        const getTriangleContainingPoint = (point, triangles) => {
            const rtn = triangles.features.filter(tri => {
                return booleanPointInPolygon(point, tri);
            });
            return rtn[0]?.properties?.triangleId.split('-')[1] || null;
        }
        const previewUrl = pickPreviewUrl(photo);
        const safeTitle = escapeHtml(photo.title || '');
        const tooltipContent = previewUrl
            ? `<img src="${previewUrl}" alt="${safeTitle}">`
            : (safeTitle || 'NO Image');
        return point(
            [photo.longitude, photo.latitude],
            {
                ...photo,
                splatone_provider: 'flickr',
                splatone_hexId: hex.properties.hexId,
                splatone_triId: getTriangleContainingPoint(point([photo.longitude, photo.latitude]), triangles),
                tooltipContent
            }
        );
    }));
    const outside = res.photos.photo.length - photos.features.length;
    //console.log(JSON.stringify(photos, null, 4));

    const nextProviderOptionsDelta = [];
    if (res.photos.photo.length == 0) {
        if (debugVerbose) {
            console.log(`Zero (${hex.properties.hexId} - ${category} - ${providerOptions.TermId})`);
        }
    } else {
        let minDate, maxDate;
        try {
            minDate = res.photos.photo[res.photos.photo.length - 1].dateupload;
            maxDate = res.photos.photo[0].dateupload

            if (providerOptions["DateMode"] == "taken") {
                minDate = toUnixSeconds(res.photos.photo[res.photos.photo.length - 1].datetaken)
                maxDate = toUnixSeconds(res.photos.photo[0].datetaken);
            }
        } catch {
            console.log("DateMode ERROR")
            console.log(res)
        }
        const minDateNum = Number(minDate);
        const maxDateNum = Number(maxDate);
        const dateMinLimit = Number(providerOptions?.DateMin);
        const prevDateMax = Number(providerOptions?.DateMax);
        if (!Number.isFinite(minDateNum) || !Number.isFinite(maxDateNum)) {
            forcedFinalReason = 'invalid date fields (min/max date is NaN)';
            console.log(`[WARN] [flickr] forcing final: reason="${forcedFinalReason}" hex=${hex.properties.hexId} category=${category} term=${providerOptions.TermId}`);
        } else {
            let next_max_date
                = res.photos.photo.length > 0
                    ? (minDateNum) - (minDateNum === maxDateNum ? 1 : 0)
                    : null;
            const window = res.photos.photo.length == 0 ? 0 : (maxDateNum - minDateNum);
            if (Object.keys(authors).length == 1 && res.photos.photo.length >= 250 && window < 60 * 60) {
                const skip = window < 0 ? Math.abs(window) * 1.1 : (window < 5 ? 0.1 : 12);
                if (debugVerbose) {
                    console.warn("[Warning]", (window < 0 ? "[[[Negative Time Window Error]]]" : ""), `High posting activity detected for ${Object.keys(authors)} within ${window} s. the crawler will skip the next ${skip} hours.`);
                }
                next_max_date -= 60 * 60 * skip;
            }

            // 進捗しない（DateMax が減らない / DateMin を下回る / NaN）場合は無限ループ回避のため final にする
            const nextMaxNum = Number(next_max_date);
            const noProgress = !Number.isFinite(nextMaxNum)
                || (Number.isFinite(prevDateMax) && nextMaxNum >= prevDateMax)
                || (Number.isFinite(dateMinLimit) && nextMaxNum <= dateMinLimit);
            if (noProgress) {
                forcedFinalReason = `non-progressing window (nextMax=${nextMaxNum}, prevMax=${prevDateMax}, minLimit=${dateMinLimit})`;
                console.log(`[WARN] [flickr] forcing final: reason="${forcedFinalReason}" hex=${hex.properties.hexId} category=${category} term=${providerOptions.TermId}`);
            } else if (providerOptions["Haste"] && res.photos.pages > 4) {
                //結果の最大・最小を2分割
                const mid = Math.round(((nextMaxNum - providerOptions.DateMin) / 2) + providerOptions.DateMin);
                if (debugVerbose) {
                    console.log(`Split(${hex.properties.hexId} - ${category} - ${providerOptions.TermId}):`, providerOptions.DateMin, mid, nextMaxNum);
                }
                nextProviderOptionsDelta.push({
                    'DateMax': nextMaxNum,
                    'DateMin': mid,
                    'TermId': providerOptions.TermId + 'a',
                    'PrevTermId': providerOptions.TermId
                });
                nextProviderOptionsDelta.push({
                    'DateMax': mid,
                    'DateMin': providerOptions.DateMin,
                    'TermId': providerOptions.TermId + 'b',
                    'PrevTermId': providerOptions.TermId
                });
            } else if (res.photos.photo.length < res.photos.total) {
                if (debugVerbose) {
                    console.log(`Continue[${res.photos.pages} pages](${hex.properties.hexId} - ${category} - ${providerOptions.TermId}):`, providerOptions.DateMin, nextMaxNum);
                }
                nextProviderOptionsDelta.push({
                    'DateMax': nextMaxNum,
                    'DateMin': providerOptions.DateMin,
                });
            } else {
                //final
                if (debugVerbose) {
                    console.log(`Final(${hex.properties.hexId} - ${category} - ${providerOptions.TermId}):`, providerOptions.DateMin, nextMaxNum);
                }
            }
        }
    }
        const payload = {
            results: {
                photos,
                hexId: hex.properties.hexId,
                tags,
                category,
                nextProviderOptions: nextProviderOptionsDelta.map(e => { return { ...providerOptions, ...e } }),
                TermId: providerOptions.TermId,
                prevTermId,
                remaining:  Number(res.photos.total) - res.photos.photo.length,
                outside: outside,
                ids,
                final: nextProviderOptionsDelta.length == 0,
                forcedFinalReason
            }
        };

        respond(payload);
        return true;
    } catch (err) {
        console.error('[flickr worker] Fatal error', {
            sessionId,
            hexId: hex?.properties?.hexId,
            category,
            reason: err?.message,
            code: err?.cause?.code || err?.code || null
        });
        respond({
            results: {
                photos: featureCollection([]),
                hexId: hex?.properties?.hexId ?? null,
                tags,
                category,
                nextProviderOptions: [],
                TermId: providerOptions.TermId,
                remaining: 0,
                outside: 0,
                ids: [],
                final: true,
                error: {
                    message: err?.message,
                    code: err?.cause?.code || err?.code || null
                }
            }
        });
        return false;
    }
    return false;
}
