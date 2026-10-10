/**
 * 本机数据库：实现了易位用到的那部分云数据库接口（collection / doc / where / command），
 * 让 core/service.js 不用改就能把数据存在手机或浏览器里。
 *
 * createLocalDatabase({ load(name), save(name, docs) })
 *   load：读取一个集合的所有记录（数组），没有时返回 null
 *   save：保存一个集合的所有记录；每次写入后调用
 *
 * 行为和云数据库保持一致：
 * - doc().get() 记录不存在时报错
 * - doc().update() 记录不存在时不报错，stats.updated 为 0
 * - update 时普通对象会与原值合并，数组会被整体替换；支持 'a.b' 形式的字段名
 *
 * 注意：这个文件会在小程序里运行，遍历 Map 时请用 Array.from / forEach，
 * 不要用展开运算符或 for...of（编译成 ES5 后可能无法遍历 Map）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EaseatLocalDB = factory();
})(this, function () {
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

  function Command(op, value) {
    this.op = op;
    this.value = value;
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

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function applyUpdate(doc, data, prefix) {
    for (const key of Object.keys(data)) {
      const value = data[key];
      const path = prefix ? `${prefix}.${key}` : key;
      const current = getPath(doc, path);
      if (value instanceof Command) {
        const v = clone(value.value);
        if (value.op === 'set') setPath(doc, path, v);
        else if (value.op === 'inc') setPath(doc, path, (current || 0) + v);
        else if (['push', 'unshift', 'addToSet', 'pull'].includes(value.op)) {
          if (current !== undefined && !Array.isArray(current)) throw new Error(`${path} is not an array`);
          const arr = current ? current.slice() : [];
          const items = Array.isArray(v) && value.op !== 'pull' ? v : [v];
          if (value.op === 'push') arr.push(...items);
          if (value.op === 'unshift') arr.unshift(...items);
          if (value.op === 'addToSet') items.forEach((x) => arr.some((y) => same(x, y)) || arr.push(x));
          setPath(doc, path, value.op === 'pull' ? arr.filter((x) => !same(x, v)) : arr);
        } else throw new Error(`unsupported update command ${value.op}`);
      } else if (value && typeof value === 'object' && !Array.isArray(value) && current && typeof current === 'object' && !Array.isArray(current)) {
        applyUpdate(doc, value, path);
      } else {
        setPath(doc, path, clone(value));
      }
    }
  }

  function matches(doc, query) {
    return Object.keys(query).every((path) => {
      const cond = query[path];
      const value = getPath(doc, path);
      if (cond instanceof Command && cond.op === 'in') return cond.value.includes(value);
      if (Array.isArray(value) && !Array.isArray(cond)) return value.includes(cond);
      return same(value, cond);
    });
  }

  function createLocalDatabase(storage) {
    storage = storage || {};
    let tables = {};
    let autoId = 0;

    function table(name) {
      if (!tables[name]) {
        const map = new Map();
        const saved = storage.load ? storage.load(name) : null;
        if (Array.isArray(saved)) saved.forEach((d) => d && d._id !== undefined && map.set(String(d._id), d));
        tables[name] = map;
      }
      return tables[name];
    }

    /**
     * 修改一个集合并保存。保存失败时（例如存储空间已满）撤销内存中的修改，
     * 让内存和已保存的数据保持一致。
     */
    function write(name, ids, change) {
      const docs = table(name);
      const before = ids.map((id) => [id, docs.has(id) ? clone(docs.get(id)) : undefined]);
      const result = change(docs);
      try {
        if (storage.save) storage.save(name, Array.from(docs.values()));
      } catch (e) {
        before.forEach(([id, doc]) => (doc === undefined ? docs.delete(id) : docs.set(id, doc)));
        throw e;
      }
      return result;
    }

    function notFound(id) {
      const e = new Error(`document.get:fail document with _id ${id} does not exist`);
      e.errMsg = e.message;
      return e;
    }

    // 每次操作都重新取集合（而不是在创建时记住），这样 reset() 之后会读到最新保存的数据
    function collection(name) {
      const query = (q, skip, limit, order) => {
        const list = () => {
          const hits = Array.from(table(name).values()).filter((d) => matches(d, q));
          if (order) hits.sort((a, b) => (getPath(a, order[0]) < getPath(b, order[0]) ? -1 : 1) * (order[1] === 'desc' ? -1 : 1));
          return hits;
        };
        return {
          skip: (n) => query(q, n, limit, order),
          limit: (n) => query(q, skip, n, order),
          orderBy: (field, dir) => query(q, skip, limit, [field, dir]),
          get: async () => ({ data: list().slice(skip, skip + limit).map(clone) }),
          count: async () => ({ total: list().length }),
          update: async ({ data }) => {
            const hits = list();
            if (!hits.length) return { stats: { updated: 0 } };
            write(
              name,
              hits.map((d) => d._id),
              () => hits.forEach((d) => applyUpdate(d, data))
            );
            return { stats: { updated: hits.length } };
          },
        };
      };
      return {
        doc(id) {
          id = String(id);
          return {
            async get() {
              if (!table(name).has(id)) throw notFound(id);
              return { data: clone(table(name).get(id)) };
            },
            async set({ data }) {
              if ('_id' in data) throw new Error('set() data must not contain _id');
              write(name, [id], (docs) => docs.set(id, Object.assign({ _id: id }, clone(data))));
              return { _id: id, stats: { updated: 1 } };
            },
            async update({ data }) {
              if (!table(name).has(id)) return { stats: { updated: 0 } };
              write(name, [id], (docs) => applyUpdate(docs.get(id), data));
              return { stats: { updated: 1 } };
            },
            async remove() {
              if (!table(name).has(id)) return { stats: { removed: 0 } };
              write(name, [id], (docs) => docs.delete(id));
              return { stats: { removed: 1 } };
            },
          };
        },
        async add({ data }) {
          const id = data._id !== undefined ? String(data._id) : `auto${Date.now().toString(36)}${++autoId}`;
          if (table(name).has(id)) throw new Error(`duplicate key _id ${id}`);
          write(name, [id], (docs) => docs.set(id, Object.assign(clone(data), { _id: id })));
          return { _id: id };
        },
        where: (q) => query(q, 0, 100, null),
      };
    }

    return {
      collection,
      command,
      /** 内存中的数据（测试用） */
      get tables() {
        Object.keys(tables).forEach(table);
        return tables;
      },
      /** 丢弃内存中的数据，下次操作时重新读取保存的数据（例如网页在另一个标签页里被修改过） */
      reset() {
        tables = {};
      },
    };
  }

  return { createLocalDatabase };
});
