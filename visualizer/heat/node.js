import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VisualizerBase } from '../../lib/VisualizerBase.js';
import { featureCollection } from "@turf/turf";

export default class HeatVisualizer extends VisualizerBase {
    static name = 'Heat Visualizer';
    static version = '0.0.0';
    static description = "カテゴリ毎に異なるレイヤのヒートマップで可視化（色=カテゴリ色、透明度=頻度）";

    constructor() {
        super();
        this.id = path.basename(path.dirname(fileURLToPath(import.meta.url)));
    }

    async yargv(yargv) {
        return yargv.option(this.argKey('Radius'), {
            group: 'For ' + this.id + ' Visualizer',
            type: 'number',
            description: 'ヒートマップブラーの半径',
            default: 0.0005
        }).option(this.argKey('MinOpacity'), {
            group: 'For ' + this.id + ' Visualizer',
            type: 'number',
            description: 'ヒートマップの最小透明度',
            default: 0
        }).option(this.argKey('MaxOpacity'), {
            group: 'For ' + this.id + ' Visualizer',
            type: 'number',
            description: 'ヒートマップの最大透明度',
            default: 1
        }).option(this.argKey('MaxValue'), {
            group: 'For ' + this.id + ' Visualizer',
            type: 'number',
            description: 'ヒートマップ強度の最大値 (未指定時はデータから自動推定)'
        });
    }

    getFutureCollection(result, target, visOptions) {
        // result: { hexId: { category: { items, ids, final, crawled, total }, ... }, ... }
        // target: { hex, triangles, categories, splatonePalette }
        // Build category-based heatmap layers using individual data points (not hex centroids)

        const categories = {};

        // Iterate through all hexes and categories, collecting individual point features
        for (const hexId in result) {
            const hexData = result[hexId];
            for (const cat in hexData) {
                if (!categories[cat]) {
                    categories[cat] = [];
                }

                // Get the actual items (point features) for this category in this hex
                const items = hexData[cat].items;
                if (!items || !items.features || items.features.length === 0) continue;

                // Add each individual point feature to the category collection
                for (const feature of items.features) {
                    const density = hexData[cat]?.total ?? items.features.length ?? 1;
                    // Clone the feature and add category property
                    const pointFeature = {
                        type: 'Feature',
                        geometry: feature.geometry,
                        properties: {
                            ...feature.properties,
                            category: cat,
                            hexId: hexId,
                            hexDensity: density
                        }
                    };
                    categories[cat].push(pointFeature);
                }
            }
        }

        // Return FeatureCollections per category
        return Object.fromEntries(
            Object.entries(categories).map(([k, v]) => [k, featureCollection(v)])
        );
    }
}