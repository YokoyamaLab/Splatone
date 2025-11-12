// lib/VisualizerBase.js
export class VisualizerBase {
  /** 例: static id = 'hello'; */
  static id = null;            // 一意ID（フォルダ名と一致させると運用しやすい）
  static name = null;          // 表示名
  static description = "可視化のための抽象クラス";
  static version = '0.0.0';

  /** @param {object} api - ホストが提供する能力（権限を最小化） */
  constructor() {
  }
  argKey(key) {
    return "v-" + this.id + "-" + key;
  }
  async yargv(yargv) {
    return yargv;
  }
  async check(option) {
    //throw Error("Plugin Option Error!");
    return options;
  }
  async init() { }
  async start() { }
  async stop() { }
}
