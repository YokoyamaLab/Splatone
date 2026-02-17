// providers/ProviderBase.js
export class ProviderBase {
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
    // NPM 等で配布される Provider はコンストラクタで this.id を設定しない場合があるため、
    // static id をフォールバックとして利用する。
    this.id = this.id ?? this.constructor.id ?? null;
  }

  argKey(key) {
    return "p-" + this.id + "-" + key;
  }
  async yargv(yargv) {
    return yargv;
  }
  async check(option) {
    //throw Error("Provider Option Error!");
    return options;
  }

  async init(options = {}) {
    Object.assign(this.options, options);
  }

  async options(yargs) {

    return yargs;
  }

  async start() {
    this.started = true;
    //this.api.log(`[${this.constructor.id}] start`);
  }
  async stop() { }
}
