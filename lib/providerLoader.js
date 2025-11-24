// providerLoader.js
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadProviders({
  dir = path.resolve('providers'),
  api = {},
  optionsById = {},              // { hello: { ... }, greeter: { ... } }
  filter = () => true,           // 例: name => allow.includes(name)
} = {}) {
  const ctx = {
    log: console.log,
    ...api,
  };

  // 先に候補フォルダを列挙
  await fs.mkdir(dir, { recursive: true });
  const folders = (await fs.readdir(dir, { withFileTypes: true }))
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(filter);

  // 1) メタ読み（静的プロパティを得るため一旦 import）
  const metas = [];
  for (const folder of folders) {
    const entry = await resolveEntry(path.join(dir, folder));
    if (!entry) { ctx.log(`[provider] skip (no entry): ${folder}`); continue; }
    const mod = await import(pathToFileURL(entry).href);
    const ProviderClass = mod?.default ?? mod;
    validateClass(ProviderClass, entry);
    const id = ProviderClass.id || folder;
    metas.push({
      id,
      folder,
      entry,
      ProviderClass,
      deps: Array.isArray(ProviderClass.dependencies) ? ProviderClass.dependencies : [],
      version: ProviderClass.version || '0.0.0',
      name: ProviderClass.name || id,
    });
  }

  // 2) トポロジカルソート（依存を考慮した読み込み順）
  const order = topoSort(metas.map(m => ({ id: m.id, deps: m.deps })));
  const byId = new Map(metas.map(m => [m.id, m]));

  // 3) 生成→init→start
  const instances = new Map(); // id -> instance
  const getProvider = id => instances.get(id);
  for (const id of order) {
    const meta = byId.get(id);
    if (!meta) {
      // 依存にあるが存在しない
      throw new Error(`[provider] missing dependency: ${id}`);
    }
    // 依存がすべて存在しているか確認
    for (const dep of meta.deps) {
      if (!instances.has(dep)) throw new Error(`[provider] unmet dependency "${dep}" for "${id}"`);
    }
    const opts = optionsById[id] || {};
    const instance = new meta.ProviderClass({ ...ctx, getProvider }, opts);

    await instance.init?.();
    //await instance.start?.();

    instances.set(id, instance);
    ctx.log(`[provider] loaded: ${id}@${meta.version}`);
  }

  // 4) ファサード
  return {
    list() { return [...instances.keys()]; },
    get(id) { return instances.get(id); },
    has(id) { return instances.has(id); },
    /** 任意メソッドを呼ぶ */
    call(id, method, ...args) {
      const p = instances.get(id);
      if (!p) throw new Error(`provider "${id}" not loaded`);
      const fn = p[method];
      if (typeof fn !== 'function') throw new Error(`method "${method}" not found in provider "${id}"`);
      return fn.apply(p, args);
    },
    /** 終了時 */
    async stopAll() {
      for (const p of instances.values()) {
        try { await p.stop?.(); } catch (e) { ctx.log('[provider] stop error', e); }
      }
    },
  };
}

async function resolveEntry(folder) {
  const candidates = ['index.js', 'index.mjs'];
  for (const c of candidates) {
    const f = path.join(folder, c);
    try { await fs.access(f); return f; } catch {}
  }
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(folder, 'package.json'), 'utf8'));
    const entry = pkg.module || pkg.main;
    if (entry) return path.join(folder, entry);
  } catch {}
  return null;
}

function validateClass(ProviderClass, file) {
  if (typeof ProviderClass !== 'function') throw new Error(`Provider must export a class: ${file}`);
  // 静的メタ
  /*if (!ProviderClass.id || typeof ProviderClass.id !== 'string') {
    throw new Error(`static id (string) is required: ${file}`);
  }*/ //動的に決定する(ディレクトリ名)
  if (!ProviderClass.version || typeof ProviderClass.version !== 'string') {
    throw new Error(`static version (string) is required: ${file}`);
  }
}

function topoSort(nodes) {
  // nodes: [{id, deps:[]}]
  const incoming = new Map(nodes.map(n => [n.id, new Set(n.deps)]));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const res = [];
  const q = [...nodes.filter(n => n.deps.length === 0).map(n => n.id)];

  // 依存に存在しないIDがあっても最終的に検出できる
  while (q.length) {
    const id = q.shift();
    res.push(id);
    for (const [k, deps] of incoming) {
      if (deps.has(id)) {
        deps.delete(id);
        if (deps.size === 0) q.push(k);
      }
    }
  }
  // 未解決（循環 or 不明依存）
  const remaining = [...incoming.entries()].filter(([, s]) => s.size > 0).map(([k]) => k);
  if (remaining.length) {
    const detail = remaining.map(k => `${k}<-${[...incoming.get(k)].join(',')}`).join(' ; ');
    throw new Error(`circular or missing dependencies: ${detail}`);
  }

  // 依存なしノードで未訪問があれば（単独で push）
  for (const n of nodes) if (!res.includes(n.id)) res.push(n.id);
  return res;
}
