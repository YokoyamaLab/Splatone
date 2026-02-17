import { ProviderBase } from 'splatone/lib/ProviderBase.js';

export default class HelloProvider extends ProviderBase {
  static id = 'hello';
  static name = 'Hello Provider';
  static description = 'デモ用: Hexごとにダミーの地点データを生成します（外部APIなし）';
  static version = '0.1.0';

  async yargv(yargv) {
    return yargv.option(this.argKey('PointsPerHex'), {
      group: `For ${this.id} Provider`,
      type: 'number',
      default: 20,
      description: 'Hex×カテゴリごとに生成する点の数'
    }).option(this.argKey('Seed'), {
      group: `For ${this.id} Provider`,
      type: 'string',
      default: '',
      description: '乱数シード（未指定なら毎回ランダム）'
    });
  }

  async check(options) {
    const n = Number(options?.PointsPerHex ?? 20);
    options.PointsPerHex = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 20;
    options.Seed = options?.Seed ? String(options.Seed) : '';
    return options;
  }

  async crawl({ hexGrid, triangles, categories, sessionId, providerOptions }) {
    if (!this.started) {
      await this.start();
    }

    const resolvedProviderOptions = {
      ...(this.options || {}),
      ...(providerOptions || {})
    };

    for (const hex of hexGrid.features) {
      for (const category of Object.keys(categories || {})) {
        this.api.emit('splatone:start', {
          provider: this.id,
          hex,
          triangles,
          bbox: null,
          category,
          tags: categories[category],
          providerOptions: resolvedProviderOptions,
          sessionId
        });
      }
    }

    return `${this.id}: scheduled ${hexGrid.features.length} hexes.`;
  }
}
