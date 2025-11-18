import DbscanVisualizer from '../visualizer/dbscan/node.js';
import fs from 'node:fs';

const result = JSON.parse(fs.readFileSync(new URL('../debug.result.json', import.meta.url), 'utf8'));
const target = JSON.parse(fs.readFileSync(new URL('../debug.target.json', import.meta.url), 'utf8'));
const viz = new DbscanVisualizer();

const categorySet = new Set();
for (const hex of Object.values(result || {})) {
  Object.keys(hex || {}).forEach((category) => categorySet.add(category));
}
console.log('Raw categories detected:', categorySet.size);

const options = {
  Eps: 0.6,
  MinPts: 6,
  Units: 'kilometers',
  StrokeWidth: 2,
  StrokeOpacity: 0.9,
  FillOpacity: 0.35,
  DashArray: '',
  KernelScale: 1,
  GridSize: 80,
  ContourPercent: 0.4,
};

const output = viz.getFutureCollection(result, target, options);
console.log('Categories:', Object.keys(output));
for (const [cat, fc] of Object.entries(output)) {
  console.log(cat, 'features', fc.features?.length ?? 0);
}
