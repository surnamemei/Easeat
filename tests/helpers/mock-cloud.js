/**
 * 内存版的云开发 SDK（wx-server-sdk / qq-server-sdk）替身，只实现了易位用到的接口。
 * 行为尽量贴近真实云数据库：
 * - doc().get() 记录不存在时报错
 * - doc().update() 记录不存在时不报错，stats.updated 为 0
 * - update 时普通对象会与原值合并，数组会被整体替换
 */
const Module = require('module');

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

class Command {
  constructor(op, value) {
    this.op = op;
    this.value = value;
  }
}

const command = {
  set: (v) => new Command('set', v),
  inc: (v) => new Command('inc', v),
  push: (v) => new Command('push', v),
  unshift: (v) => new Command('unshift', v),
  addToSet: (v) => new Command('addToSet', v),
  pull: (v) => new Command('pull', v),
  in: (v) => new Command('in', v),
};

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (typeof o[k] !== 'object' || o[k] === null) o[k] = {};
    o = o[k];
  }
  o[keys[keys.length - 1]] = value;
}

function applyUpdate(doc, data, prefix) {
  for (const [key, value] of Object.entries(data)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const current = getPath(doc, path);
    if (value instanceof Command) {
      const v = clone(value.value);
      switch (value.op) {
        case 'set':
          setPath(doc, path, v);
          break;
        case 'inc':
          setPath(doc, path, (current || 0) + v);
          break;
        case 'push':
        case 'unshift':
        case 'addToSet':
        case 'pull':
          if (current !== undefined && !Array.isArray(current)) throw new Error(`${path} is not an array`);
          {
            const arr = current ? current.slice() : [];
            const items = Array.isArray(v) && value.op !== 'pull' ? v : [v];
            if (value.op === 'push') arr.push(...items);
            if (value.op === 'unshift') arr.unshift(...items);
            if (value.op === 'addToSet') items.forEach((x) => arr.some((y) => JSON.stringify(y) === JSON.stringify(x)) || arr.push(x));
            setPath(doc, path, value.op === 'pull' ? arr.filter((x) => JSON.stringify(x) !== JSON.stringify(v)) : arr);
          }
          break;
        default:
          throw new Error(`unsupported update command ${value.op}`);
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value) && current && typeof current === 'object' && !Array.isArray(current)) {
      applyUpdate(doc, value, path);
    } else {
      setPath(doc, path, clone(value));
    }
  }
}

function matches(doc, query) {
  return Object.entries(query).every(([path, cond]) => {
    const value = getPath(doc, path);
    if (cond instanceof Command && cond.op === 'in') return cond.value.includes(value);
    if (Array.isArray(value) && !Array.isArray(cond)) return value.includes(cond);
    return JSON.stringify(value) === JSON.stringify(cond);
  });
}

function createDatabase() {
  const store = {};
  let autoId = 0;
  const table = (name) => store[name] || (store[name] = new Map());
  const notFound = (name, id) => {
    const e = new Error(`document.get:fail document with _id ${id} does not exist`);
    e.errMsg = e.message;
    return e;
  };

  function collection(name) {
    const docs = table(name);
    const query = (q, skip = 0, limit = 100) => {
      const list = () => [...docs.values()].filter((d) => matches(d, q));
      return {
        skip: (n) => query(q, n, limit),
        limit: (n) => query(q, skip, n),
        async get() {
          return { data: list().slice(skip, skip + limit).map(clone) };
        },
        async count() {
          return { total: list().length };
        },
        async update({ data }) {
          const hits = list();
          hits.forEach((d) => applyUpdate(d, data));
          return { stats: { updated: hits.length } };
        },
      };
    };
    return {
      doc(id) {
        return {
          async get() {
            if (!docs.has(id)) throw notFound(name, id);
            return { data: clone(docs.get(id)) };
          },
          async set({ data }) {
            if ('_id' in data) throw new Error('set() data must not contain _id');
            docs.set(id, Object.assign({ _id: id }, clone(data)));
            return { _id: id, stats: { updated: 1 } };
          },
          async update({ data }) {
            if (!docs.has(id)) return { stats: { updated: 0 } };
            applyUpdate(docs.get(id), data);
            return { stats: { updated: 1 } };
          },
          async remove() {
            const existed = docs.delete(id);
            return { stats: { removed: existed ? 1 : 0 } };
          },
        };
      },
      async add({ data }) {
        const id = data._id || `auto${++autoId}`;
        if (docs.has(id)) throw new Error(`duplicate key _id ${id}`);
        docs.set(id, Object.assign(clone(data), { _id: id }));
        return { _id: id };
      },
      where: (q) => query(q),
    };
  }

  return { collection, command, store, serverDate: () => new Date() };
}

/**
 * 创建一个模拟的云开发环境，并让 require('wx-server-sdk') / require('qq-server-sdk') 返回它。
 * 用 setContext({ OPENID }) 切换当前调用者。
 */
function installMockCloud(extraModules = {}) {
  const db = createDatabase();
  const files = new Map();
  let context = {};
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'mock-env',
    init() {},
    database: () => db,
    getWXContext: () => context,
    getQQContext: () => context,
    async downloadFile({ fileID }) {
      if (!files.has(fileID)) throw new Error('file not found');
      return { fileContent: files.get(fileID) };
    },
    async deleteFile({ fileIDList }) {
      fileIDList.forEach((id) => files.delete(id));
      return { fileList: fileIDList.map((fileID) => ({ fileID, status: 0 })) };
    },
  };
  const modules = Object.assign({ 'wx-server-sdk': cloud, 'qq-server-sdk': cloud }, extraModules);
  const originalLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (Object.prototype.hasOwnProperty.call(modules, request)) return modules[request];
    return originalLoad.call(this, request, ...rest);
  };
  return {
    cloud,
    db,
    files,
    setContext(ctx) {
      context = ctx;
    },
    restore() {
      Module._load = originalLoad;
    },
  };
}

module.exports = { installMockCloud, createDatabase };
