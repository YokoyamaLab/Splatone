
function addGeoJSONLayer(map, geojson, options = {}) {
    if (!map || !geojson) return null;

    // GeoJSON レイヤを作成
    const geojsonLayer = L.geoJSON(geojson, {
        pointToLayer: options.pointToLayer,
        onEachFeature: options.onEachFeature,
    });
    geojsonLayer.addTo(map);
    return geojsonLayer;
}

function addNaivePointMarkerLayer(map, geojson, options = {}) {
    const layers = {};
    for (const cat in geojson) {
        const layer = addGeoJSONLayer(map, geojson[cat], {
            pointToLayer: (feature, latlng) => {
                return L.circleMarker(latlng, {
                    radius: feature.properties.radius,
                    stroke: feature.properties.stroke,
                    color: feature.properties.color,
                    weight: feature.properties.weight,
                    opacity: feature.properties.opacity,
                    fill: feature.properties.fill,
                    fillColor: feature.properties.fillColor,
                    fillOpacity: feature.properties.fillOpacity
                })
            },
            onEachFeature: (feature, layer) => {
                const t = `<img src="${feature.properties.url_s}">` || "NO Image!";
                layer.bindTooltip(t ?? '', { direction: 'top', opacity: 0.9 });
            }

        });
        layers[cat] = layer;
    }
    return layers;
}
/*
使用例:
const layer = addGeoJSONLayer(map, myGeoJSON, {
    style: f => ({ color: f.properties.color || '#3388ff', weight: 2 }),
    popupProperty: f => `name: ${f.properties.name}`,
});
*/