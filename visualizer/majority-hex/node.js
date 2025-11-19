import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VisualizerBase } from '../../lib/VisualizerBase.js';
import { featureCollection } from "@turf/turf";

export const optionSchema = {
	label: 'Majority Hex',
	fields: [
        { key: 'Hexapartite', label: 'Hexapartite', type: 'boolean', default: false, description: '中のカテゴリの頻度に応じて六角形を分割色彩' },
        { key: 'HexOpacity', label: 'Line Opacity', type: 'number', min: 0, max: 1, step: 0.05, default: 1, description: '六角形の線の透明度' },
        { key: 'HexWeight', label: 'Line Weight', type: 'number', min: 0, step: 1, default: 1, description: '六角形の線の太さ' },
        { key: 'MaxOpacity', label: 'Max Fill Opacity', type: 'number', min: 0, max: 1, step: 0.05, default: 0.9, description: '正規化後の最大塗り透明度' },
        { key: 'MinOpacity', label: 'Min Fill Opacity', type: 'number', min: 0, max: 1, step: 0.05, default: 0.5, description: '正規化後の最小塗り透明度' }
	]
};

export default class MajorityHex extends VisualizerBase {
    static name = 'MajorityHex Visualizer';
    static version = '0.0.2';
    static description = "HexGrid内で最も出現頻度が高いカテゴリの色で彩色。Hexapartiteモードで6分割パイチャート表示。透明度は全体で正規化。";
    static optionSchema = optionSchema;

    static getOptionSchema() {
        return optionSchema;
    }

    constructor() {
        super();
        this.id = path.basename(path.dirname(fileURLToPath(import.meta.url)));
    }

    getOptionSchema() {
        return optionSchema;
    }

    async yargv(yargv) {
        return this.applyOptionSchemaToYargs(yargv);
    }

    getFutureCollection(result, target, visOptions) {
        const hexIndex = {};

        if (target && target.hex && Array.isArray(target.hex.features)) {
            for (const hexF of target.hex.features) {
                const id = hexF.properties && hexF.properties.hexId;
                if (id != null) hexIndex[id] = hexF;
            }
        }

        // Build index of triangles by triangleId
        const triIndex = {};
        if (target && target.triangles && Array.isArray(target.triangles.features)) {
            for (const triF of target.triangles.features) {
                const triId = triF.properties && triF.properties.triangleId;
                if (triId != null) triIndex[triId] = triF;
            }
        }

        const hexDataList = [];
        let maxTotal = 0;
        let globalMaxCategoryCount = 0;  // Track max category count across entire grid
        
        for (const hexId in result) {
            const cats = result[hexId] || {};
            let total = 0;
            let maxCat = null;
            let maxCount = -1;
            
            for (const cat in cats) {
                const count = (cats[cat]?.items?.features?.length) ?? 0;
                total += count;
                if (count > maxCount) {
                    maxCount = count;
                    maxCat = cat;
                }
                // Track global max
                if (count > globalMaxCategoryCount) {
                    globalMaxCategoryCount = count;
                }
            }
            
            if (total > 0) {
                hexDataList.push({ hexId, cats, maxCat, maxCount, total });
                if (total > maxTotal) {
                    maxTotal = total;
                }
            }
        }

        const out = { hex: [], triangles: [] };
        const maxOp = (visOptions && visOptions.MaxOpacity) ?? 0.8;
        const minOp = (visOptions && visOptions.MinOpacity) ?? 0.1;
        const opRange = maxOp - minOp;

        for (const hexData of hexDataList) {
            const hexFeature = hexIndex[hexData.hexId];
            if (!hexFeature) continue;

            const f = JSON.parse(JSON.stringify(hexFeature));
            f.properties = f.properties || {};
            f.properties.majorityCategory = hexData.maxCat;
            f.properties.majorityCount = hexData.maxCount;
            f.properties.totalCount = hexData.total;

            const normalizedOpacity = maxTotal > 0 
                ? minOp + (hexData.total / maxTotal) * opRange
                : minOp;

            const palette = target?.splatonePalette || {};
            const pal = hexData.maxCat ? (palette[hexData.maxCat] || {}) : {};
            f.properties.fill = true;
            f.properties.fillColor = pal.color || '#888888';
            f.properties.fillOpacity = normalizedOpacity;
            f.properties.color = pal.darken || '#333333';
            f.properties.weight = (visOptions && visOptions.HexWeight) ?? 1;
            f.properties.opacity = (visOptions && visOptions.HexOpacity) ?? 1;

            if (visOptions && visOptions.Hexapartite) {
                f.properties.hexPartite = true;
                f.properties.breakdown = Object.fromEntries(
                    Object.entries(hexData.cats).map(([c, v]) => [c, (v?.items?.features?.length) ?? 0])
                );
                f.properties.categoryColors = Object.fromEntries(
                    Object.entries(hexData.cats).map(([c]) => [c, palette[c]?.color || '#888888'])
                );
                // Store global max for opacity normalization in web.js fallback
                f.properties.globalMaxCategoryCount = globalMaxCategoryCount;
            }

            out.hex.push(f);

            // Add triangles for Hexapartite mode
            if (visOptions && visOptions.Hexapartite && hexFeature.properties && hexFeature.properties.triIds) {
                const triIds = hexFeature.properties.triIds;
                // Extract numeric counts from category objects
                const catEntries = Object.entries(hexData.cats).map(([cat, catObj]) => [cat, catObj.total]).sort((a, b) => b[1] - a[1]);
                const total = catEntries.reduce((sum, [_, count]) => sum + count, 0);
                
                // Compute slices for each category: ratio < 1/6 => 0 slices, 1/6 <= ratio < 2/6 => 1 slice, etc.
                // Also store in which order categories should be placed (clockwise from north)
                const catSliceList = [];  // [{category, count, sliceCount, opacity}, ...]
                let totalSlices = 0;
                
                // First pass: allocate slices using floor
                for (const [category, count] of catEntries) {
                    const ratio = total > 0 ? count / total : 0;
                    const sliceCount = Math.floor(ratio * 6);  // 0-6 slices
                    // Compute opacity based on GLOBAL max category count: 
                    // MinOpacity + (count / globalMaxCategoryCount) * (MaxOpacity - MinOpacity)
                    const sliceOpacity = minOp + (count / Math.max(globalMaxCategoryCount, 1)) * opRange;
                    catSliceList.push({ category, count, sliceCount, opacity: sliceOpacity });
                    totalSlices += sliceCount;
                }
                
                // Second pass: distribute remaining slices (6 - totalSlices) to categories with largest remainders
                if (totalSlices < 6) {
                    const remainders = catEntries.map(([category, count], idx) => {
                        const ratio = total > 0 ? count / total : 0;
                        const remainder = (ratio * 6) - Math.floor(ratio * 6);
                        return { idx, remainder };
                    }).sort((a, b) => b.remainder - a.remainder);
                    
                    let remaining = 6 - totalSlices;
                    for (let i = 0; i < remainders.length && remaining > 0; i++) {
                        catSliceList[remainders[i].idx].sliceCount++;
                        remaining--;
                    }
                }
                
                // Arrange slices clockwise starting from top (triIdx 0 = north/top)
                let triIdx = 0;
                for (const catSlice of catSliceList) {
                    for (let slicePos = 0; slicePos < catSlice.sliceCount && triIdx < triIds.length; slicePos++) {
                        const triId = triIds[triIdx];
                        const triFeature = triIndex[triId];
                        if (!triFeature) {
                            triIdx++;
                            continue;
                        }

                        const triCopy = JSON.parse(JSON.stringify(triFeature));
                        triCopy.properties = triCopy.properties || {};
                        triCopy.properties.category = catSlice.category;
                        triCopy.properties.categoryCount = catSlice.count;
                        triCopy.properties.slicePosition = slicePos;  // which slice of this category (0-indexed)
                        triCopy.properties.sliceCount = catSlice.sliceCount;  // total slices for this category
                        triCopy.properties.parentHexId = hexData.hexId;
                        triCopy.properties.fill = true;
                        const catColor = palette[catSlice.category]?.color || '#888888';
                        triCopy.properties.fillColor = catColor;
                        triCopy.properties.fillOpacity = catSlice.opacity;
                        triCopy.properties.color = palette[catSlice.category]?.darken || '#333333';
                        triCopy.properties.weight = (visOptions && visOptions.HexWeight) ?? 1;
                        triCopy.properties.opacity = (visOptions && visOptions.HexOpacity) ?? 1;

                        out.triangles.push(triCopy);
                        triIdx++;
                    }
                }
            }
        }

        const outputCollections = {};
        for (const [k, v] of Object.entries(out)) {
            outputCollections[k] = featureCollection(v);
        }
        return outputCollections;
    }
}
