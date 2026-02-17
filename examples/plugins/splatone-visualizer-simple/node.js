import { VisualizerBase } from 'splatone/lib/VisualizerBase.js';

const featureCollection = (features = []) => ({
  type: 'FeatureCollection',
  features
});

export const optionSchema = {
  label: 'Simple Points',
  fields: [
    { key: 'Radius', label: 'Radius', type: 'number', min: 0, step: 1, default: 4, description: 'Point Markerの半径' },
    { key: 'FillOpacity', label: 'Fill Opacity', type: 'number', min: 0, max: 1, step: 0.05, default: 0.6, description: '塗りの透明度' }
  ]
};

export default class SimpleVisualizer extends VisualizerBase {
  static id = 'simple';
  static name = 'Simple Visualizer';
  static version = '0.1.0';
  static description = '全データを最小構成の CircleMarker として表示';
  static optionSchema = optionSchema;

  static getOptionSchema() {
    return optionSchema;
  }

  async yargv(yargv) {
    return this.applyOptionSchemaToYargs(yargv);
  }

  getFutureCollection(result, target, visOptions) {
    const layers = {};
    for (const hex in result) {
      for (const cat in result[hex]) {
        layers[cat] ??= [];
        for (const feature of result[hex][cat].items.features) {
          feature.properties.radius = visOptions.Radius;
          feature.properties.stroke = false;
          feature.properties.color = target.splatonePalette[cat].darken;
          feature.properties.weight = 0;
          feature.properties.opacity = 1;
          feature.properties.fill = true;
          feature.properties.fillColor = target.splatonePalette[cat].color;
          feature.properties.fillOpacity = visOptions.FillOpacity;
          layers[cat].push(feature);
        }
      }
    }
    return Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, featureCollection(v)]));
  }
}
