const pickPreviewUrl = (props = {}) => {
    return props.url_sq || props.url_s || props.url_t || props.url_q || props.url_m || props.url_n || props.url_z || props.url_c || props.url_l || props.url_o || null;
};

const buildFlickrPageUrl = (props = {}) => {
    const id = props.id;
    if (!id) {
        return null;
    }
    const ownerAlias = props.pathalias || props.path_alias;
    const ownerId = props.owner || props.ownername || props.owner_name;
    const ownerSegment = ownerAlias || ownerId;
    if (!ownerSegment) {
        return null;
    }
    return `https://www.flickr.com/photos/${encodeURIComponent(ownerSegment)}/${encodeURIComponent(id)}/`;
};

const resolveExternalUrl = (props = {}) => {
    if (props.splatone_provider === 'gmap' && props.gmap_url) {
        return props.gmap_url;
    }
    return buildFlickrPageUrl(props);
};

export default async function main(map, geojson = {}, options = {}) {
    console.log("[VIS OPTIONS]", options.visOptions);
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
                const pickFallbackTooltip = () => {
                    const previewUrl = pickPreviewUrl(feature.properties) || '';
                    return previewUrl ? `<img src="${previewUrl}">` : 'NO Image!';
                };
                const tooltipContent = feature.properties?.tooltipContent || pickFallbackTooltip();
                layer.bindTooltip(tooltipContent, { direction: 'top', opacity: 0.9 });

                const externalUrl = resolveExternalUrl(feature.properties);
                if (externalUrl) {
                    layer.on('click', () => {
                        window.open(externalUrl, '_blank', 'noopener');
                    });
                }
            }

        });
        layers[cat] = layer;
    }
    return layers;
}