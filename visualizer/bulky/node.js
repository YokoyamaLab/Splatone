import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VisualizerBase } from '../../lib/VisualizerBase.js';
import { featureCollection } from "@turf/turf";

export const optionSchema = {
	label: 'Bulky Points',
	fields: [
        { key: 'Radius', label: 'Radius', type: 'number', min: 0, step: 1, default: 5, description: 'Point Markerの半径' },
        { key: 'Stroke', label: 'Stroke', type: 'boolean', default: true, description: 'Point Markerの線の有無' },
        { key: 'Weight', label: 'Stroke Weight', type: 'number', min: 0, step: 1, default: 1, description: 'Point Markerの線の太さ' },
        { key: 'Opacity', label: 'Stroke Opacity', type: 'number', min: 0, max: 1, step: 0.05, default: 1, description: 'Point Markerの線の透明度' },
        { key: 'Filling', label: 'Fill', type: 'boolean', default: true, description: 'Point Markerの塗りの有無' },
        { key: 'FillOpacity', label: 'Fill Opacity', type: 'number', min: 0, max: 1, step: 0.05, default: 0.5, description: 'Point Markerの塗りの透明度' }
	]
};

export default class BulkyVisualizer extends VisualizerBase {
    static name = 'Bulky Visualizer';          // 表示名
    static version = '0.0.0';
    static description = "全データをCircleMarkerとして地図上に表示";
    static optionSchema = optionSchema;

    static getOptionSchema() {
        return optionSchema;
    }

    constructor() {
        super();
        this.id = path.basename(path.dirname(fileURLToPath(import.meta.url)));//必須(ディレクトリ名がビジュアライザ名) 
    }

    getOptionSchema() {
        return optionSchema;
    }
    async yargv(yargv) {
        return this.applyOptionSchemaToYargs(yargv);
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