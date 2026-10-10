/**
 * 在 Node 里模拟小程序运行环境：Page()、setData() 和测试用到的 wx/qq 接口。
 * 云端模式：wx.cloud.callFunction 直接调用真实的云函数代码（数据存在内存版数据库里）；
 * 本机模式：页面通过 utils/api.js 在“手机”上运行同一份业务逻辑，数据存在模拟的本地缓存里。
 * 所以测试可以像用户一样操作页面，从页面一直走到数据库。
 */
const path = require('path');
const { installMockCloud } = require('./mock-cloud');

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** 按小程序 setData 的规则写入数据，支持 'a.b'、'list[2].open' 这样的路径 */
function setPath(obj, keyPath, value) {
  const keys = keyPath.replace(/\[(\d+)\]/g, '.$1').split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (o[k] === null || typeof o[k] !== 'object') o[k] = {};
    o = o[k];
  }
  o[keys[keys.length - 1]] = value;
}

/**
 * options.platform：'wx' 或 'qq'
 * options.mode：'cloud' 或 'local'（默认，与小程序的默认设置一致）
 * options.storage：本地缓存的初始内容（用来模拟“过了一段时间再打开”）
 */
function createMiniProgram(options = {}) {
  const platform = options.platform || 'wx';
  const mode = options.mode || 'local';
  const root = path.join(__dirname, `../../Easeat-${platform}`);
  const cloud = installMockCloud();
  for (const key of Object.keys(require.cache)) if (key.startsWith(root)) delete require.cache[key];
  require(path.join(root, 'utils/platform')).mode = mode;
  const functions = { easeat: require(path.join(root, 'cloudfunctions/easeat')) };

  let user = 'teacher';
  let pending = 0;
  const storage = clone(options.storage || {});
  const modalAnswers = [];
  const files = new Map();
  const picked = [];
  const log = { calls: [], toasts: [], modals: [], navigations: [], titles: [], clipboard: null, actionSheets: [], sharedFiles: [], documents: [] };
  const fileSystem = {
    writeFileSync(filePath, data) {
      files.set(filePath, Buffer.from(data));
    },
    readFileSync(filePath) {
      if (!files.has(filePath)) throw new Error(`readFileSync:fail no such file ${filePath}`);
      const b = files.get(filePath);
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    },
  };

  const api = {
    cloud: {
      init() {},
      callFunction({ name, data, success, fail }) {
        log.calls.push(data.action || name);
        pending++;
        (async () => {
          if (!functions[name]) throw { errMsg: `cloud.callFunction:fail FUNCTION_NOT_FOUND ${name}` };
          cloud.setContext({ OPENID: user });
          return { result: await functions[name].main(clone(data)) };
        })()
          .then(success, fail)
          .finally(() => pending--);
      },
    },
    showLoading() {},
    hideLoading() {},
    showToast(o) {
      log.toasts.push(o.title);
    },
    showModal(o) {
      log.modals.push(o);
      // 没有预设回答时：提示框点“确定”，需要确认的操作点“取消”
      const answer = modalAnswers.length ? modalAnswers.shift() : o.showCancel === false ? { confirm: true } : { cancel: true };
      if (o.success) o.success(Object.assign({ confirm: false, cancel: false }, answer));
    },
    showActionSheet(o) {
      log.actionSheets.push(o.itemList);
    },
    setNavigationBarTitle(o) {
      log.titles.push(o.title);
    },
    navigateTo(o) {
      log.navigations.push(o.url);
    },
    navigateBack() {},
    showShareMenu() {},
    stopPullDownRefresh() {},
    getStorageSync(key) {
      return key in storage ? clone(storage[key]) : '';
    },
    setStorageSync(key, value) {
      storage[key] = clone(value);
    },
    setClipboardData(o) {
      log.clipboard = o.data;
      if (o.success) o.success();
    },
    getWindowInfo: () => ({ pixelRatio: 2 }),
    getSystemInfoSync: () => ({ pixelRatio: 2, platform: 'ios' }),
    getDeviceInfo: () => ({ platform: 'ios' }),
    env: { USER_DATA_PATH: 'wxfile://usr' },
    getFileSystemManager: () => fileSystem,
    chooseMessageFile(o) {
      if (!picked.length) return o.fail({ errMsg: 'chooseMessageFile:fail cancel' });
      const { name, bytes } = picked.shift();
      const filePath = `wxfile://tmp/${name}`;
      files.set(filePath, Buffer.from(bytes));
      o.success({ tempFiles: [{ path: filePath, name, size: bytes.length }] });
    },
    shareFileMessage(o) {
      log.sharedFiles.push({ fileName: o.fileName, filePath: o.filePath, bytes: files.get(o.filePath) });
      o.success();
    },
    openDocument(o) {
      log.documents.push(o);
      o.success();
    },
  };

  global.wx = api;
  global.qq = api;
  let lastDefinition = null;
  global.Page = (def) => {
    lastDefinition = def;
  };
  global.Component = (def) => {
    lastDefinition = def;
  };
  global.App = () => {};
  global.getApp = () => ({});

  /** 打开页面：执行页面 JS，调用 onLoad / onShow */
  function open(route, query = {}) {
    const file = path.join(root, `${route}.js`);
    delete require.cache[require.resolve(file)];
    require(file);
    const page = Object.assign({}, lastDefinition);
    page.data = clone(lastDefinition.data || {});
    page.setData = function (changes) {
      // 小程序会把数据序列化后传给视图层，这里同样做一次拷贝
      for (const [key, value] of Object.entries(changes)) setPath(this.data, key, clone(value));
    };
    if (page.onLoad) page.onLoad(query);
    if (page.onShow) page.onShow();
    return page;
  }

  /** 等待所有云函数调用和后续回调完成 */
  async function settle() {
    for (let i = 0; i < 200; i++) {
      await new Promise((resolve) => setImmediate(resolve));
      if (!pending) {
        await new Promise((resolve) => setImmediate(resolve));
        if (!pending) return;
      }
    }
    throw new Error('cloud calls did not finish');
  }

  return {
    platform,
    mode,
    root,
    cloud,
    log,
    storage,
    open,
    settle,
    as(openid) {
      user = openid;
    },
    /** 预设下一次 showModal 的回答，例如 { confirm: true } */
    answerModal(answer) {
      modalAnswers.push(answer);
    },
    /** 预设下一次 chooseMessageFile 选中的文件 */
    pickFile(name, bytes) {
      picked.push({ name, bytes });
    },
    restore() {
      cloud.restore();
      for (const name of ['wx', 'qq', 'Page', 'Component', 'App', 'getApp']) delete global[name];
    },
  };
}

/** 模拟点击事件 */
const tap = (dataset) => ({ currentTarget: { dataset }, detail: {} });

module.exports = { createMiniProgram, tap };
