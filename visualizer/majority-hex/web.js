let booted = false;
// keep last received geojson so helper renderers can access triangles/outlines
let lastGeojson = null;
// keep last visOptions for opacity bounds
let lastVisOptions = {};
export default async function main(map, geojson, options = {}) {
    if (booted) return;
    booted = true;
    const layers = {};
    // stash geojson and visOptions for render helpers
    lastGeojson = geojson;
    lastVisOptions = (options && options.visOptions) || {};
    
    // Render hex layer with Leaflet GeoJSON
    if (geojson && geojson.hex) {
        const isHexapartite = options.visOptions && options.visOptions.Hexapartite;
        
        // If Hexapartite mode, render triangles directly
        if (isHexapartite) {
            // Create a group to hold triangles + optional outlines
            const group = L.featureGroup();

            if (geojson && geojson.triangles && geojson.triangles.features) {
                const triLayer = L.geoJSON(geojson.triangles, {
                    style: (feature) => {
                        const fillColor = feature.properties?.fillColor || '#888888';
                        return {
                            fill: true,
                            fillColor: fillColor,
                            fillOpacity: feature.properties?.fillOpacity ?? 0.5,
                            color: feature.properties?.color || '#333333',
                            weight: feature.properties?.weight || 1,
                            opacity: feature.properties?.opacity ?? 1,
                        };
                    },
                    onEachFeature: (feature, layer) => {
                        const cat = feature.properties?.category || 'Unknown';
                        const count = feature.properties?.categoryCount ?? 0;
                        const popupText = `Category: ${cat}<br/>Count: ${count}`;
                        layer.bindPopup(popupText);
                    }
                });
                triLayer.addTo(group);
            }

            // optionally add hex outlines so user can see hex borders
            if (geojson && geojson.hex && geojson.hex.features) {
                const outline = L.geoJSON(geojson.hex, {
                    style: (feature) => ({
                        color: feature.properties.color || '#333333',
                        weight: feature.properties.weight || 1,
                        opacity: feature.properties.opacity ?? 1,
                        fill: false
                    })
                });
                outline.addTo(group);
            }

            group.addTo(map);
            layers['[MajorityHex]'] = group;
        } else {
            // Standard solid color hex rendering
            const hexLayer = renderHexLayer(map, geojson.hex);
            if (hexLayer) layers['[MajorityHex]'] = hexLayer;
        }
    }

    return layers;
}

/**
 * Render standard hex layer (solid color)
 */
function renderHexLayer(map, hexFeatureCollection) {
    const layer = L.geoJSON(hexFeatureCollection, {
        style: (feature) => {
            return {
                color: feature.properties.color,
                weight: feature.properties.weight,
                opacity: feature.properties.opacity,
                fill: feature.properties.fill,
                fillColor: feature.properties.fillColor,
                fillOpacity: feature.properties.fillOpacity
            };
        },
        onEachFeature: (feature, layer) => {
            const majorityCategory = feature.properties.majorityCategory;
            const totalCount = feature.properties.totalCount;
            const majorityCount = feature.properties.majorityCount;
            const html = `<strong>${majorityCategory}</strong><br/>Data: ${majorityCount}/${totalCount}`;
            layer.bindTooltip(html, { direction: 'top', opacity: 0.9 });
        }
    });
    layer.addTo(map);
    return layer;
}

/**
 * Render Hexapartite layer: 6-slice pie chart representation using pre-computed triangles
 */
function renderHexPartiteLayer(map, hexFeatureCollection) {
    // Build a FeatureGroup containing pre-computed triangle slices (if available)
    // plus optional hex outlines/tooltips. Do NOT add to map here; return the group so
    // callers can add it to the map or layer control.
        // Return a Leaflet layer (FeatureGroup). This avoids passing booleans to
        // layer controls elsewhere. If precomputed triangles are not available
        // (they are rendered in main when present), fall back to creating
        // center-to-edge triangles per hex so the UI still shows a Hexapartite view.
        const group = L.featureGroup();

        if (!hexFeatureCollection || !Array.isArray(hexFeatureCollection.features)) {
            return group;
        }

        const features = hexFeatureCollection.features;

        for (const feature of features) {
            const breakdown = feature.properties?.breakdown || {};
            const categoryColors = feature.properties?.categoryColors || {};
            const hexOutlineColor = feature.properties?.color || '#333333';
            const hexOutlineWeight = feature.properties?.weight || 1;
            const hexOutlineOpacity = feature.properties?.opacity ?? 1;

            const coords = feature.geometry?.coordinates?.[0];
            if (!coords || coords.length < 3) continue;

            // normalize ring
            const last = coords[coords.length - 1];
            const first = coords[0];
            const closed = last && first && last[0] === first[0] && last[1] === first[1];
            const n = closed ? coords.length - 1 : coords.length;

            // centroid
            let sumLng = 0, sumLat = 0;
            for (let i = 0; i < n; i++) {
                sumLng += coords[i][0];
                sumLat += coords[i][1];
            }
            const center = [sumLng / n, sumLat / n];

            const catEntries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
            const total = catEntries.reduce((s, [, c]) => s + c, 0);
            if (total === 0) continue;

            // Get opacity bounds from lastVisOptions (same as node.js)
            const minOp = (lastVisOptions && lastVisOptions.MinOpacity) ?? 0.1;
            const maxOp = (lastVisOptions && lastVisOptions.MaxOpacity) ?? 0.8;
            const opRange = maxOp - minOp;
            
            // Get global max count from hex properties (set by node.js)
            const globalMaxCount = feature.properties?.globalMaxCategoryCount ?? 0;

            // Compute slice allocation per category: ratio < 1/6 => 0, 1/6 <= ratio < 2/6 => 1, etc.
            const catSliceList = [];
            let totalSlices = 0;

            for (const [category, count] of catEntries) {
                const ratio = total > 0 ? count / total : 0;
                const sliceCount = Math.floor(ratio * 6);
                if (sliceCount > 0) {
                    // Opacity based on GLOBAL max category count (same as node.js)
                    const sliceOpacity = minOp + (count / Math.max(globalMaxCount, 1)) * opRange;
                    catSliceList.push({ category, count, sliceCount, opacity: sliceOpacity });
                    totalSlices += sliceCount;
                }
            }

            // Normalize if totalSlices > 6
            if (totalSlices > 6) {
                const scale = 6 / totalSlices;
                let allottedSlices = 0;
                for (let i = 0; i < catSliceList.length; i++) {
                    const newCount = Math.floor(catSliceList[i].sliceCount * scale);
                    allottedSlices += newCount;
                    catSliceList[i].sliceCount = newCount;
                }
                let remaining = 6 - allottedSlices;
                for (let i = 0; i < catSliceList.length && remaining > 0; i++) {
                    if (catSliceList[i].sliceCount < Math.ceil(catSliceList[i].count / total * 6)) {
                        catSliceList[i].sliceCount++;
                        remaining--;
                    }
                }
            }

            // Create triangles in clockwise order starting from north (triIdx 0)
            let triIdx = 0;
            for (const catSlice of catSliceList) {
                for (let slicePos = 0; slicePos < catSlice.sliceCount && triIdx < n; slicePos++) {
                    const v1 = coords[triIdx];
                    const v2 = coords[(triIdx + 1) % n];

                    const triangle = {
                        type: 'Feature',
                        geometry: {
                            type: 'Polygon',
                            coordinates: [[[center[0], center[1]], [v1[0], v1[1]], [v2[0], v2[1]], [center[0], center[1]]]]
                        },
                        properties: {
                            category: catSlice.category,
                            categoryCount: catSlice.count,
                            slicePosition: slicePos,
                            sliceCount: catSlice.sliceCount,
                            fill: true,
                            fillColor: categoryColors[catSlice.category] || '#888888',
                            fillOpacity: catSlice.opacity,
                            color: hexOutlineColor,
                            weight: 0.5,
                            opacity: hexOutlineOpacity
                        }
                    };

                    L.geoJSON(triangle, {
                        style: (f) => ({
                            fill: true,
                            fillColor: f.properties.fillColor,
                            fillOpacity: f.properties.fillOpacity,
                            color: f.properties.color,
                            weight: f.properties.weight,
                            opacity: f.properties.opacity
                        })
                    }).addTo(group);

                    triIdx++;
                }
            }
        }

        // add outlines (non-filled) for all hexes so borders are visible
        const outline = L.geoJSON(hexFeatureCollection, {
            style: (feature) => ({
                color: feature.properties.color || '#333333',
                weight: feature.properties.weight || 1,
                opacity: feature.properties.opacity ?? 1,
                fill: false
            }),
            onEachFeature: (feature, layer) => {
                const majorityCategory = feature.properties?.majorityCategory;
                const totalCount = feature.properties?.totalCount;
                const majorityCount = feature.properties?.majorityCount;
                const html = `<strong>${majorityCategory}</strong><br/>Data: ${majorityCount}/${totalCount}`;
                layer.bindTooltip(html, { direction: 'top', opacity: 0.9 });
            }
        });
        outline.addTo(group);

        group.addTo(map);
        return group;

    
}