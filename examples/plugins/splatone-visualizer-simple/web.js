export default async function main(map, geojson = {}) {
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
        });
      },
      onEachFeature: (feature, layer) => {
        const tooltipContent = feature.properties?.tooltipContent || feature.properties?.id || '';
        if (tooltipContent) {
          layer.bindTooltip(String(tooltipContent), { direction: 'top', opacity: 0.9 });
        }
      }
    });
    layers[cat] = layer;
  }
  return layers;
}
