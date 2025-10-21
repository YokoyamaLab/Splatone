import { VisualizerBase } from '../../lib/VisualizerBase.js';
import { featureCollection } from "@turf/turf";


export default class MarkerClusterVisualizer extends VisualizerBase {
    static id = 'marker-cluster';            // 一意ID（フォルダ名と一致させると運用しやすい）
    static name = 'Marker Cluster Visualizer';          // 表示名
    static version = '0.0.0';
    static description = "マーカークラスターとして地図上に表示";

    constructor() {
        super();
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
    getFutureCollection(result, target) {
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