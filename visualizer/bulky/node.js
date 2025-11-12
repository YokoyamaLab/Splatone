import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VisualizerBase } from '../../lib/VisualizerBase.js';
import { featureCollection } from "@turf/turf";

export default class BulkyVisualizer extends VisualizerBase {
    static name = 'Bulky Visualizer';          // 表示名
    static version = '0.0.0';
    static description = "全データをCircleMarkerとして地図上に表示";

    constructor() {
        super();
        this.id = path.basename(path.dirname(fileURLToPath(import.meta.url)));//必須(ディレクトリ名がビジュアライザ名) 
    }
    async yargv(yargv) {
        // 必須項目にすると、このプラグインを使用しない時も必須になります。
        // 必須項目は作らず、もしプラグインを使う上での制約違反はinitで例外を投げてください。
        return yargv.option(this.argKey('Radius'), {
            group: 'For ' + this.id + ' Visualizer',
            type: 'number',
            description: 'Point Markerの直径',
            default: 5
        }).option(this.argKey('Stroke'), {
            group: 'For ' + this.id + ' Visualizer',
            type: 'boolean',
            description: 'Point Markerの線の有無',
            default: true
        }).option(this.argKey('Weight'), {
            group: 'For ' + this.id + ' Visualizer',
            type: 'number',
            description: 'Point Markerの線の太さ',
            default: 1
        }).option(this.argKey('Opacity'), {
            group: 'For ' + this.id + ' Visualizer',
            type: 'number',
            description: 'Point Markerの線の透明度',
            default: 1
        }).option(this.argKey('Filling'), {
            group: 'For ' + this.id + ' Visualizer',
            type: 'boolean',
            description: 'Point Markerの塗りの有無',
            default: true
        }).option(this.argKey('FillOpacity'), {
            group: 'For ' + this.id + ' Visualizer',
            type: 'number',
            description: 'Point Markerの塗りの透明度',
            default: .5
        });
    }

    getFutureCollection(result, target, visOptions) {
        const layers = {};
        for (const hex in result) {
            for (const cat in result[hex]) {
                if (!layers.hasOwnProperty(cat)) {
                    layers[cat] = [];
                }
                for (const feature of result[hex][cat].items.features) {
                    feature.properties["radius"] = visOptions.Radius;

                    feature.properties["stroke"] = visOptions.Stroke;
                    feature.properties["color"] = target.splatonePalette[cat].darken;
                    feature.properties["weight"] = visOptions.Weight;
                    feature.properties["opacity"] = visOptions.Opacity;

                    feature.properties["fill"] = visOptions.Filling;
                    feature.properties["fillColor"] = target.splatonePalette[cat].color;
                    feature.properties["fillOpacity"] = visOptions.FillOpacity;

                    layers[cat].push(feature);
                }
            }
        }
        return Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, featureCollection(v)]));
    }
}