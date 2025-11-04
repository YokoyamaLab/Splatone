// plugins/hello/index.js
import { PluginBase } from '../../lib/PluginBase.js';
import { bbox, polygon, centroid, booleanPointInPolygon, featureCollection } from '@turf/turf';

export default class FlickrPlugin extends PluginBase {
    static id = 'flickr';               // 必須
    static name = 'Flickr Plugin';      // 任意
    static description = 'Flickrからジオタグ付きデータを収集する。';
    static version = '1.0.0';

    async stop() {
        //this.api.log(`[${this.constructor.id}] stop`);
    }

    // 任意の公開メソッド
    async crawl({ hexGrid, triangles/*, tags*/, categories, max_upload_date, min_upload_date, sessionId }) {
        if (!this.started) {
            this.start();
        }

        const getTrianglesInHex = (hex, triangles) => {
            const hexPoly = polygon(hex.geometry.coordinates);
            const selected = triangles.features.filter(tri => {
                const triPoly = polygon(tri.geometry.coordinates);
                const triCent = centroid(triPoly);
                return booleanPointInPolygon(triCent, hexPoly);
            });
            return featureCollection(selected);
        }
        const hexQuery = {};
        const ks = Object.keys(hexGrid.features);
        await Promise.all(ks.map(async k => {
            const item = hexGrid.features[k];
            hexQuery[item.properties.hexId] = {};
            const cks = Object.keys(categories);
            await Promise.all(cks.map(ck => {
                const tags = categories[ck];
                //console.log("tag=",ck,"/",tags);
                hexQuery[item.properties.hexId][ck] = { photos: [], tags, final: false };
                this.api.emit('splatone:start', {
                    plugin: 'flickr',
                    API_KEY: this.options.API_KEY,
                    hex: item,
                    triangles: getTrianglesInHex(item, triangles),
                    bbox: bbox(item.geometry),
                    category: ck,
                    tags,
                    max_upload_date,
                    min_upload_date,
                    sessionId
                });
            }));
        }));
        return `Flickr, ${this.options.API_KEY}, ${hexGrid.features.length} bboxes processed.`;
    }
}