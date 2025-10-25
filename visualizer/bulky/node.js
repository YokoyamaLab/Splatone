import { VisualizerBase } from '../../lib/VisualizerBase.js';
import { featureCollection } from "@turf/turf";

export default class BulkyVisualizer extends VisualizerBase {
    static id = 'bulky';            // 一意ID（フォルダ名と一致させると運用しやすい）
    static name = 'Bulky Visualizer';          // 表示名
    static version = '0.0.0';
    static description = "全データをCircleMarkerとして地図上に表示";

    constructor() {
        super();
    }

    getFutureCollection(result, target){
           //console.log(JSON.stringify(target, null, 4));
        const layers = {};
        for (const hex in result) {
            for (const cat in result[hex]) {
                if (!layers.hasOwnProperty(cat)) {
                    layers[cat] = [];
                }
                for (const feature of result[hex][cat].items.features) {
                    feature.properties["radius"] = 5;

                    feature.properties["stroke"] = true;
                    feature.properties["color"] = target.splatonePalette[cat].darken;                    
                    feature.properties["weight"] = 1;
                    feature.properties["opacity"] = 1;

                    feature.properties["fill"] = true;
                    feature.properties["fillColor"] = target.splatonePalette[cat].color;
                    feature.properties["fillOpacity"] = .5;
 
                    layers[cat].push(feature);
                }
            }
        }
        return Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, featureCollection(v)]));
    }
}