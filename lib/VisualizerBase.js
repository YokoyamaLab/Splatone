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
  getOptionSchema() {
    if (typeof this.constructor.getOptionSchema === 'function') {
      return this.constructor.getOptionSchema();
    }
    return this.constructor.optionSchema ?? null;
  }
  applyOptionSchemaToYargs(yargv) {
    const schema = this.getOptionSchema();
    if (!schema || !Array.isArray(schema.fields)) {
      return yargv;
    }
    const group = schema.group || (`For ${this.id} Visualizer`);
    const mapType = (fieldType) => {
      switch (fieldType) {
        case 'number':
          return 'number';
        case 'boolean':
          return 'boolean';
        case 'select':
        case 'text':
        default:
          return 'string';
      }
    };
    const describeField = (field) => {
      const parts = [];
      if (field.description) {
        parts.push(field.description);
      } else if (field.label) {
        parts.push(field.label);
      } else if (field.key) {
        parts.push(field.key);
      }
      const bounds = [];
      if (Number.isFinite(field.min)) bounds.push(`min=${field.min}`);
      if (Number.isFinite(field.max)) bounds.push(`max=${field.max}`);
      if (Number.isFinite(field.step)) bounds.push(`step=${field.step}`);
      if (bounds.length) {
        parts.push(bounds.join(', '));
      }
      if (field.placeholder) {
        parts.push(`例: ${field.placeholder}`);
      }
      return parts.filter(Boolean).join(' | ');
    };
    for (const field of schema.fields) {
      if (!field || typeof field !== 'object' || !field.key) {
        continue;
      }
      const optionName = this.argKey(field.key);
      const type = mapType(field.type);
      const optionConfig = {
        group,
        type,
        description: describeField(field)
      };
      if (field.default !== undefined) {
        optionConfig.default = field.default;
      }
      if (field.type === 'select' && Array.isArray(field.options) && field.options.length > 0) {
        optionConfig.choices = field.options;
      }
      yargv = yargv.option(optionName, optionConfig);
    }
    return yargv;
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
