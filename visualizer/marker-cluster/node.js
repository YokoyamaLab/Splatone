import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VisualizerBase } from '../../lib/VisualizerBase.js';
import { featureCollection } from "@turf/turf";

export const optionSchema = {
	label: 'Marker Cluster',
    fields: [
        { key: 'MaxClusterRadius', label: 'Max Cluster Radius', type: 'number', min: 1, step: 1, default: 80, description: 'クラスタを構成する範囲(半径)' }
    ]
};


export default class MarkerClusterVisualizer extends VisualizerBase {
    static id = 'marker-cluster';            // 一意ID（フォルダ名と一致させると運用しやすい）
    static name = 'Marker Cluster Visualizer';          // 表示名
    static version = '0.0.0';
    static description = "マーカークラスターとして地図上に表示";
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

    concatFC(fcA, fcB) {
        return {
            type: "FeatureCollection",
            features: [
                ...(fcA?.features ?? []),
                ...(fcB?.features ?? []),
            ]
        };
    }
    addCategory(fc, value, key = "category", overwrite = true) {
        const features = (fc?.features ?? []).map(f => {
            const props = { ...(f.properties ?? {}) };
            if (overwrite || props[key] == null) {
                props[key] = value;
            }
            return { ...f, properties: props };
        });
        return { type: "FeatureCollection", features };
    }
    getFutureCollection(result, target, visOptions) {
        //console.log(JSON.stringify(target, null, 4));
        const layers = {};
        for (const hex in result) {
            for (const cat in result[hex]) {
                if (!layers.hasOwnProperty(cat)) {
                    layers[cat] = [];
                }
                for (const feature of result[hex][cat].items.features) {
                    feature.properties["category"] = cat;
                    layers[cat].push(feature);
                }
            }
        }
        return Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, featureCollection(v)]));
    }
}