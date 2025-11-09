import { createFlickr } from "flickr-sdk"
import { point, featureCollection } from "@turf/helpers";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";

export default async function ({
    //API_KEY = "",
    bbox = [0, 0, 0, 0],
    tags = "",
    category = "",
    hex = null,
    triangles = null,
    pluginOptions
}) {
    //console.log("{PLUGIN}", pluginOptions);
    const { flickr } = createFlickr(pluginOptions["APIKEY"]);
    const baseParams = {
        bbox: bbox.join(','),
        tags: tags,
        extras: pluginOptions["Extras"],
        sort: pluginOptions["Date"] == "upload" ? "date-posted-desc" : "date-taken-desc"
    };
    baseParams[pluginOptions["Date"] == "upload" ? 'max_upload_date' : 'max_taken_date'] = pluginOptions["DateMax"];
    baseParams[pluginOptions["Date"] == "upload" ? 'min_upload_date' : 'min_taken_date'] = pluginOptions["DateMin"];
    //console.log("[baseParams]",baseParams);
    const res = await flickr("flickr.photos.search", {
        ...baseParams,
        has_geo: 1,
        per_page: 250,
        page: 1,
    });
    //console.log(baseParams);
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
    let next_max_date
        = res.photos.photo.length > 0
            ? (res.photos.photo[res.photos.photo.length - 1].dateupload) - (res.photos.photo[res.photos.photo.length - 1].dateupload == res.photos.photo[0].dateupload ? 1 : 0)
            : null;
    const window = res.photos.photo.length == 0 ? 0 : res.photos.photo[0].dateupload - res.photos.photo[res.photos.photo.length - 1].dateupload;
    if (Object.keys(authors).length == 1 && window < 60 * 60) {
        const skip = window < 5 ? 0.1 : 12;
        console.warn("[Warning]", `High posting activity detected for ${Object.keys(authors)} within ${window} s. the crawler will skip the next ${skip} hours.`);
        next_max_date -= 60 * 60 * skip;
    }
    if (res.photos.pages > 4) {
        //結果の最大・最小を2分割
        const mid = ((next_max_date - pluginOptions.DateMin) / 2) + pluginOptions.DateMin;
        nextPluginOptionsDelta.push({
            'DateMax': next_max_date,
            'DateMin': mid
        });
        nextPluginOptionsDelta.push({
            'DateMax': mid,
            'DateMin': pluginOptions.DateMin
        });
    } else {
        nextPluginOptionsDelta.push({
            'DateMax': next_max_date,
            'DateMin': pluginOptions.DateMin
        });
    }
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
