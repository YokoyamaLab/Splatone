import { createFlickr } from "flickr-sdk"
import { point, featureCollection } from "@turf/helpers";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";

export default async function ({
    API_KEY = "",
    bbox = [0, 0, 0, 0],
    tags = "",
    category = "",
    max_upload_date = null,
    min_upload_date = null,
    hex = null,
    triangles = null,
}) {
    const { flickr } = createFlickr(API_KEY);
    const baseParams = {
        bbox: bbox.join(','),
        tags: tags,
        max_upload_date: max_upload_date,
        //min_upload_date: min_upload_date,
    };
    console.log("[baseParams]",baseParams);
    const res = await flickr("flickr.photos.search", {
        ...baseParams,
        has_geo: 1,
        extras: "date_upload,date_taken,owner_name,geo,url_s,tags",
        per_page: 250,
        page: 1,
        sort: "date-posted-desc"
    });
    console.log(baseParams);
    console.log("[(Crawl)", hex.properties.hexId, category, "]", (new Date(min_upload_date * 1000)).toLocaleString(),"->",(new Date(max_upload_date * 1000)).toLocaleString(), "-> photos:", res.photos.photo.length, "/", res.photos.total);
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
    let next_max_upload_date
        = res.photos.photo.length > 0
            ? (res.photos.photo[res.photos.photo.length - 1].dateupload) - (res.photos.photo[res.photos.photo.length - 1].dateupload == res.photos.photo[0].dateupload ? 1 : 0)
            : null;
    const window = res.photos.photo.length == 0 ? 0 : res.photos.photo[0].dateupload - res.photos.photo[res.photos.photo.length - 1].dateupload;
    if (Object.keys(authors).length == 1 && window < 60 * 60) {
        const skip = window < 5 ? 0.1 : 12;
        console.warn("[Warning]", `High posting activity detected for ${Object.keys(authors)} within ${window} s. the crawler will skip the next ${skip} hours.`);
        next_max_upload_date -= 60 * 60 * skip;
    }
    return {
        photos,
        hexId: hex.properties.hexId,
        tags,
        category,
        next_max_upload_date,
        min_upload_date,
        total: res.photos.total,
        outside: outside,
        ids,
        final: res.photos.photo.length == res.photos.total
    };
}
