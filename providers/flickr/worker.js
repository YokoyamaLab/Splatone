import { createFlickr } from "flickr-sdk"
import { point, featureCollection } from "@turf/helpers";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { toUnixSeconds } from '#lib/splatone';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(fetcher, { maxAttempts = 4, baseDelayMs = 500 } = {}) {
    let attempt = 0;
    let lastError = null;
    while (attempt < maxAttempts) {
        try {
            return await fetcher();
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
    if (!code && typeof err?.message === 'string' && err.message.includes('fetch failed')) {
        return true;
    }
    const transientCodes = new Set(['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE']);
    return transientCodes.has(code);
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
    debugVerbose = true;

    const respond = (payload) => {
        const safePayload = JSON.parse(JSON.stringify(payload));
        port.postMessage(safePayload);
    };

    try {
        const { flickr } = createFlickr(providerOptions["APIKEY"]);
        if (!providerOptions.TermId) {
            //初期TermId
            providerOptions.TermId = 'a';
        }
        const baseParams = {
            bbox: bbox.join(','),
            tags: tags,
            extras: providerOptions["Extras"],
            sort: providerOptions["DateMode"] == "upload" ? "date-posted-desc" : "date-taken-desc"
        };
        baseParams[providerOptions["DateMode"] == "upload" ? 'max_upload_date' : 'max_taken_date'] = providerOptions["DateMax"];
        baseParams[providerOptions["DateMode"] == "upload" ? 'min_upload_date' : 'min_taken_date'] = providerOptions["DateMin"];
        //console.log("[baseParams]",baseParams);
        const res = await fetchWithRetry(() => flickr("flickr.photos.search", {
            ...baseParams,
            has_geo: 1,
            per_page: 250,
            page: 1,
        }));
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
        return point(
            [photo.longitude, photo.latitude],
            {
                ...photo,
                splatone_provider: 'flickr',
                splatone_hexId: hex.properties.hexId,
                splatone_triId: getTriangleContainingPoint(point([photo.longitude, photo.latitude]), triangles),
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
        let next_max_date
            = res.photos.photo.length > 0
                ? (minDate) - (minDate == maxDate ? 1 : 0)
                : null;
        const window = res.photos.photo.length == 0 ? 0 : maxDate - minDate;
        if (Object.keys(authors).length == 1 && res.photos.photo.length >= 250 && window < 60 * 60) {
            const skip = window < 0 ? Math.abs(window) * 1.1 : (window < 5 ? 0.1 : 12);
            if (debugVerbose) {
                console.warn("[Warning]", (window < 0 ? "[[[Negative Time Window Error]]]" : ""), `High posting activity detected for ${Object.keys(authors)} within ${window} s. the crawler will skip the next ${skip} hours.`);
            }
            next_max_date -= 60 * 60 * skip;
        }
        if (providerOptions["Haste"] && res.photos.pages > 4) {
            //結果の最大・最小を2分割
            const mid = Math.round(((next_max_date - providerOptions.DateMin) / 2) + providerOptions.DateMin);
            if (debugVerbose) {
                console.log(`Split(${hex.properties.hexId} - ${category} - ${providerOptions.TermId}):`, providerOptions.DateMin, mid, next_max_date);
            }
            nextProviderOptionsDelta.push({
                'DateMax': next_max_date,
                'DateMin': mid,
                'TermId': providerOptions.TermId + 'a'
            });
            nextProviderOptionsDelta.push({
                'DateMax': mid,
                'DateMin': providerOptions.DateMin,
                'TermId': providerOptions.TermId + 'b'
            });
        } else if (res.photos.photo.length < res.photos.total) {
            if (debugVerbose) {
                console.log(`Continue[${res.photos.pages} pages](${hex.properties.hexId} - ${category} - ${providerOptions.TermId}):`, providerOptions.DateMin, next_max_date);
            }
            nextProviderOptionsDelta.push({
                'DateMax': next_max_date,
                'DateMin': providerOptions.DateMin,
            });
        } else {
            //final
            if (debugVerbose) {
                console.log(`Final(${hex.properties.hexId} - ${category} - ${providerOptions.TermId}):`, providerOptions.DateMin, next_max_date);
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
                remaining:  res.photos.total - res.photos.photo.length,
                outside: outside,
                ids,
                final: nextProviderOptionsDelta.length == 0
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
