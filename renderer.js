import { featureCollection } from "@turf/turf";
import { writeFileSync } from 'node:fs';

export default {
    splatone: (result, target) => {
        //writeFileSync('debug.target.json', JSON.stringify(target, null, 2) + '\n', 'utf8');
        //writeFileSync('debug.result.json', JSON.stringify(result, null, 2) + '\n', 'utf8');
        return result;
    },
    bulky: (result, target) => {
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
    },
};