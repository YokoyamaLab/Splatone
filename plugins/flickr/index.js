// plugins/hello/index.js
import { PluginBase } from '../../PluginBase.js';
import { bbox, polygon, centroid, booleanPointInPolygon, featureCollection } from '@turf/turf';

export default class FlickrPlugin extends PluginBase {
    static id = 'flickr';               // 必須
    static name = 'Flickr Plugin';      // 任意
    static version = '1.0.0';

    async init() {
        //this.api.log(`[${this.constructor.id}] init`);
    }

    async stop() {
        //this.api.log(`[${this.constructor.id}] stop`);
    }

    // 任意の公開メソッド
    async crawl({ hexGrid, triangles, tags, max_upload_date, sessionId }) {
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
        hexGrid.features.map(item => {
            hexQuery[item.properties.hexId] = {};
            tags.split('|').map(tag_set => {
                hexQuery[item.properties.hexId][tag_set] = { photos: [], final: false };
                this.api.emit('splatone:start', {
                    plugin: 'flickr',
                    API_KEY: this.options.API_KEY,
                    hex: item,
                    triangles: getTrianglesInHex(item, triangles),
                    bbox: bbox(item.geometry),
                    tags: tag_set,
                    max_upload_date, 
                    sessionId
                });
            });
        });
        return `Flickr, ${this.options.API_KEY}, ${hexGrid.features.length} bboxes processed.`;
    }
}