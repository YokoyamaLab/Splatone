// plugins/PluginBase.js
export class PluginBase {
  /** 例: static id = 'hello'; */
  static id = null;            // 一意ID（フォルダ名と一致させると運用しやすい）
  static name = null;          // 表示名
  static version = '0.0.0';
  static dependencies = [];    // ['auth','core'] のように他プラグインID
  static started = false;

  /** @param {object} api - ホストが提供する能力（権限を最小化） */
  constructor(api, options = {}) {
    this.api = api;
    this.options = options;
  }
  async init(options = {}) {
    Object.assign(this.options, options);
  }
  async start() {
    this.started = true;
    //this.api.log(`[${this.constructor.id}] start`);
  }
  async stop() {}
}
