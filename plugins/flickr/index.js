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
        // 必須項目は作らず、もしプラグインを使う上での制約違反はinitで例外を投げてください。
        return yargv.option(this.argKey('APIKEY'), {
            group: 'For ' + this.id + ' Plugin',
            type: 'string',
            description: 'Flickr ServiceのAPI KEY'
        }).coerce(this.argKey('APIKEY'), opt => {
            return opt
        }).option(this.argKey('Extras'), {
            group: 'For ' + this.id + ' Plugin',
            type: 'string',
            default: 'date_upload,date_taken,owner_name,geo,url_s,tags',
            description: 'カンマ区切り/保持する写真のメタデータ(デフォルト値は記載の有無に関わらず保持)'
        }).coerce(this.argKey('Extras'), opt => {
            const fields = ['description', 'license', 'date_upload', 'date_taken', 'owner_name', 'icon_server', 'original_format', 'last_update', 'geo', 'tags', 'machine_tags', 'o_dims', 'views', 'media', 'path_alias', 'url_sq', 'url_t', 'url_s', 'url_q', 'url_m', 'url_n', 'url_z', 'url_c', 'url_l', 'url_o'];
            const extras = { 'date_upload': true, 'date_taken': true, 'owner_name': true, 'geo': true, 'url_s': true, 'tags': true };
            opt.split(',').forEach(f => {
                if (fields.includes(f)) {
                    extras[f] = true;
                } else {
                    console.warn(`[${this.id} Warning] extras=${f}はリストに無いため無視されました。`);
                }
            });
            return Object.keys(extras).join(",");
        }).option(this.argKey('DateMode'), {
            group: 'For ' + this.id + ' Plugin',
            choices: ['upload', 'taken'],
            default: "upload",
            description: '利用時間軸(update=Flickr投稿日時/taken=写真撮影日時)'
        }).option(this.argKey('Haste'), {
            group: 'For ' + this.id + ' Plugin',
            default: true,
            type: 'boolean',
            description: '時間軸分割並列処理'
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
            //console.log(apikey);
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
    async crawl({ hexGrid, triangles/*, tags*/, categories, sessionId, pluginOptions }) {
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
        ks.map(k => {
            const item = hexGrid.features[k];
            hexQuery[item.properties.hexId] = {};
            const cks = Object.keys(categories);
            cks.map(ck => {
                const tags = categories[ck];
                //console.log("tag=",ck,"/",tags);
                hexQuery[item.properties.hexId][ck] = { photos: [], tags, final: false };
                this.api.emit('splatone:start', { //WorkerOptions
                    plugin: this.id,
                    hex: item,
                    triangles: getTrianglesInHex(item, triangles),
                    bbox: bbox(item.geometry),
                    category: ck,
                    tags,
                    pluginOptions,
                    sessionId
                });
            });
        });
        return `${this.id}, ${this.options.API_KEY}, ${hexGrid.features.length} bboxes processed.`;
    }
}