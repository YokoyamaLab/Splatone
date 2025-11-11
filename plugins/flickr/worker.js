import { createFlickr } from "flickr-sdk"
import { point, featureCollection } from "@turf/helpers";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { toUnixSeconds } from '#lib/splatone';

export default async function ({
    port,
    debugVerbose,
    plugin,
    hex,
    triangles,
    bbox,
    category,
    tags,
    pluginOptions,
    sessionId
}) {
    debugVerbose = true;
    //console.log("{PLUGIN}", pluginOptions);
    const { flickr } = createFlickr(pluginOptions["APIKEY"]);
    if (!pluginOptions.TermId) {
        //初期TermId
        pluginOptions.TermId = 'a';
    }
    const baseParams = {
        bbox: bbox.join(','),
        tags: tags,
        extras: pluginOptions["Extras"],
        sort: pluginOptions["DateMode"] == "upload" ? "date-posted-desc" : "date-taken-desc"
    };
    baseParams[pluginOptions["DateMode"] == "upload" ? 'max_upload_date' : 'max_taken_date'] = pluginOptions["DateMax"];
    baseParams[pluginOptions["DateMode"] == "upload" ? 'min_upload_date' : 'min_taken_date'] = pluginOptions["DateMin"];
    //console.log("[baseParams]",baseParams);
    const res = await flickr("flickr.photos.search", {
        ...baseParams,
        has_geo: 1,
        per_page: 250,
        page: 1,
    });
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
                splatone_plugin: 'flickr',
                splatone_hexId: hex.properties.hexId,
                splatone_triId: getTriangleContainingPoint(point([photo.longitude, photo.latitude]), triangles),
            }
        );
    }));
    const outside = res.photos.photo.length - photos.features.length;
    //console.log(JSON.stringify(photos, null, 4));

    const nextPluginOptionsDelta = [];
    if (res.photos.photo.length == 0) {
        if (debugVerbose) {
            console.log(`Zero (${hex.properties.hexId} - ${category} - ${pluginOptions.TermId})`);
        }
    } else {
        let minDate, maxDate;
        try {
            minDate = res.photos.photo[res.photos.photo.length - 1].dateupload;
            maxDate = res.photos.photo[0].dateupload

            if (pluginOptions["DateMode"] == "taken") {
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
        if (pluginOptions["Haste"] && res.photos.pages > 4) {
            //結果の最大・最小を2分割
            const mid = Math.round(((next_max_date - pluginOptions.DateMin) / 2) + pluginOptions.DateMin);
            if (debugVerbose) {
                console.log(`Split(${hex.properties.hexId} - ${category} - ${pluginOptions.TermId}):`, pluginOptions.DateMin, mid, next_max_date);
            }
            nextPluginOptionsDelta.push({
                'DateMax': next_max_date,
                'DateMin': mid,
                'TermId': pluginOptions.TermId + 'a'
            });
            nextPluginOptionsDelta.push({
                'DateMax': mid,
                'DateMin': pluginOptions.DateMin,
                'TermId': pluginOptions.TermId + 'b'
            });
        } else if (res.photos.photo.length < res.photos.total) {
            if (debugVerbose) {
                console.log(`Continue[${res.photos.pages} pages](${hex.properties.hexId} - ${category} - ${pluginOptions.TermId}):`, pluginOptions.DateMin, next_max_date);
            }
            nextPluginOptionsDelta.push({
                'DateMax': next_max_date,
                'DateMin': pluginOptions.DateMin,
            });
        } else {
            //final
            if (debugVerbose) {
                console.log(`Final(${hex.properties.hexId} - ${category} - ${pluginOptions.TermId}):`, pluginOptions.DateMin, next_max_date);
            }
        }
    }
    port.postMessage({
        workerOptions: {
            plugin,
            hex,
            triangles,
            bbox,
            category,
            tags,
            pluginOptions,
            sessionId,
        },
        results: {
            photos,
            hexId: hex.properties.hexId,
            tags,
            category,
            nextPluginOptions: nextPluginOptionsDelta.map(e => { return { ...pluginOptions, ...e } }),
            total: res.photos.total,
            outside: outside,
            ids,
            final: nextPluginOptionsDelta.length == 0//res.photos.photo.length == res.photos.total
        }
    });
    return true;
    return {
        photos,
        hexId: hex.properties.hexId,
        tags,
        category,
        nextPluginOptions: nextPluginOptionsDelta.map(e => { return { ...pluginOptions, ...e } }),
        total: res.photos.total,
        outside: outside,
        ids,
        final: res.photos.photo.length == res.photos.total
    };
    /*
    pluginOptions["DateMax"] = next_max_date;
    return {
        photos,
        hexId: hex.properties.hexId,
        tags,
        category,
        nextPluginOptions: pluginOptions,
        total: res.photos.total,
        outside: outside,
        ids,
        final: res.photos.photo.length == res.photos.total
    };*/
}
