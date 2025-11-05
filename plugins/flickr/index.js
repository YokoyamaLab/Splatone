// plugins/flickr/index.js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PluginBase } from '../../lib/PluginBase.js';
import { bbox, polygon, centroid, booleanPointInPolygon, featureCollection } from '@turf/turf';
import { loadAPIKey } from '#lib/splatone';
export default class FlickrPlugin extends PluginBase {

    static name = 'Flickr Plugin';       // 任意
    static description = 'Flickrからジオタグ付きデータを収集する。';
    static version = '1.0.0';
    constructor(api, options = {}) {
        super(api, options);
        this.id = path.basename(path.dirname(fileURLToPath(import.meta.url)));//必須(ディレクトリ名がプラグイン名) 
    }
    async yargv(yargv) {
        // 必須項目にすると、このプラグインを使用しない時も必須になります。
        // 必須項目は作らず、initで例外を投げてください。
        return yargv.option(this.argKey('APIKEY'), {
            group: 'For ' + this.id + ' Plugin',
            type: 'string',
            description: 'Flickr ServiceのAPI KEY'
        }).coerce(this.argKey('APIKEY'), opt => {
            return opt
        }).option(this.argKey('DateMax'), {
            group: 'For ' + this.id + ' Plugin',
            type: 'string',
            default: Math.floor(new Date() / 1000) - 360,
            description: 'クローリング期間(最大) UNIX TIMEもしくはYYYY-MM-DD'
        }).coerce(this.argKey('DateMax'), opt => {
            if (!opt) return opt;  // undefined/null はそのまま返す

            // YYYY-MM-DD 形式のチェック
            const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(opt);
            if (dateMatch) {
                const [_, year, month, day] = dateMatch;
                const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                if (date.toString() === 'Invalid Date') {
                    throw new Error(`Invalid date format: ${opt} (正しい日付を指定してください)`);
                }
                return Math.floor(date.getTime() / 1000);
            }

            // 数値文字列または数値のチェック
            const num = Number(opt);
            if (Number.isFinite(num)) {
                return Math.floor(num);  // 確実に整数に
            }

            throw new Error(`Invalid date/time format: ${opt} (YYYY-MM-DD または UNIX時間(秒)で指定してください)`);
        }).option(this.argKey('DateMin'), {
            group: 'For ' + this.id + ' Plugin',
            type: 'string',
            default: Math.round(new Date(2004, 1 - 1, 1, 0, 0, 0).getTime() / 1000),
            description: 'クローリング期間(最小) UNIX TIMEもしくはYYYY-MM-DD'
        }).coerce(this.argKey('DateMin'), opt => {
            if (!opt) return opt;  // undefined/null はそのまま返す

            // YYYY-MM-DD 形式のチェック
            const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(opt);
            if (dateMatch) {
                const [_, year, month, day] = dateMatch;
                const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                if (date.toString() === 'Invalid Date') {
                    throw new Error(`Invalid date format: ${opt} (正しい日付を指定してください)`);
                }
                return Math.floor(date.getTime() / 1000);
            }

            // 数値文字列または数値のチェック
            const num = Number(opt);
            if (Number.isFinite(num)) {
                return Math.floor(num);  // 確実に整数に
            }
            throw new Error(`Invalid date/time format: ${opt} (YYYY-MM-DD または UNIX時間(秒)で指定してください)`)
        });
    }

    async check(options) {
        const RE_FLICKR_API_KEY = /^[0-9a-f]{32}$/i;
        if (!options['APIKEY']) {
            const apikey = await loadAPIKey(this.id);
            console.log(apikey);
            options['APIKEY'] = apikey;
        } else if (!RE_FLICKR_API_KEY.test(options['APIKEY'])) {
            throw new Error('Invalid Flickr API key format: 32桁 16進数で指定してください');
        }
        return options;
    }

    async stop() {
        //this.api.log(`[${this.constructor.id}] stop`);
    }

    // 任意の公開メソッド
    async crawl({ hexGrid, triangles/*, tags*/, categories, max_upload_date, min_upload_date, sessionId, pluginOptions }) {
        if (!this.started) {
            this.start();
        }
        console.log("【optio】",pluginOptions);

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
                    plugin: this.id,
                    //API_KEY: this.APIKEY ?? pluginOptions.APIKEY,
                    hex: item,
                    triangles: getTrianglesInHex(item, triangles),
                    bbox: bbox(item.geometry),
                    category: ck,
                    tags,
                    //max_upload_date: pluginOptions[this.argKey("DateMax")],
                    //min_upload_date: pluginOptions[this.argKey("DateMin")],
                    pluginOptions,
                    sessionId
                });
            }));
        }));
        return `${this.id}, ${this.options.API_KEY}, ${hexGrid.features.length} bboxes processed.`;
    }
}