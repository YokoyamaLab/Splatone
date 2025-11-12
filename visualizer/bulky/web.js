let booted = false;
export default async function main(map, geojson, options = {}) {
    //console.log("main");
    console.log("[VIS OPTIONS]",options.visOptions);
    if (booted) return;
    booted = true;
    const layers = {};
    for (const cat in geojson) {
        //console.log(cat);
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