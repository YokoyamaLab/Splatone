import { createFlickr } from "flickr-sdk"
import { point, featureCollection } from "@turf/helpers";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";

export default async function ({
    API_KEY = "",
    bbox = [0, 0, 0, 0],
    tags = "",
    max_upload_date = null,
    hex = null,
    triangles = null,
}) {
    const { flickr } = createFlickr(API_KEY);
    const baseParams = {
        bbox: bbox.join(','),
        tags: tags,
        max_upload_date: max_upload_date,

    };
    const res = await flickr("flickr.photos.search", {
        ...baseParams,
        has_geo: 1,
        extras: "date_upload,date_taken,owner_name,geo,url_m,tags",
        per_page: 250,
        pages: 1,
        sort: "date-posted-desc"
    });
    const photos = featureCollection(res.photos.photo.filter(photo => {
        return booleanPointInPolygon(point([photo.longitude, photo.latitude]), hex);
    }).map(photo => {
        const getTriangleContainingPoint = (point, triangles) => {
            const rtn= triangles.features.filter(tri => {
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
    //console.log(JSON.stringify(photos, null, 4));
    const next_max_upload_date = res.photos.photo.length > 0
        ? (res.photos.photo[res.photos.photo.length - 1].dateupload) - (res.photos.photo[res.photos.photo.length - 1].dateupload == res.photos.photo[0].dateupload ? 1 : 0)
        : null;

    return { photos, hexId: hex.properties.hexId, tags, next_max_upload_date, final: res.photos.page >= res.photos.pages };
}
