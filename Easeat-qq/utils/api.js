/**
 * 调用易位的业务逻辑（core/service.js）。
 * 本机模式：直接在手机上运行，数据存在本地缓存里；
 * 云端模式：调用云函数 easeat，用 action 区分操作。
 * 两种模式的接口和返回值完全一样。
 */
const platform = require('./platform');

const FUNCTION = 'easeat';
// 本机模式只有一个用户（这台设备）
const LOCAL_USER = 'local';
const STORAGE_PREFIX = 'easeat:';

let localService = null;

function isLocal() {
  return platform.mode !== 'cloud';
}

function getLocalService() {
  if (!localService) {
    const { createService } = require('./core/service');
    const { createLocalDatabase } = require('./core/local-db');
    const db = createLocalDatabase({
      load(name) {
        try {
          const docs = qq.getStorageSync(STORAGE_PREFIX + name);
          return Array.isArray(docs) ? docs : null;
        } catch (e) {
          return null;
        }
      },
      save(name, docs) {
        qq.setStorageSync(STORAGE_PREFIX + name, docs);
      },
    });
    localService = createService({
      db,
      autoOnOpen: true,
      internalError: '保存失败，请重试。如果一直失败，可能是手机存储空间不足。',
    });
  }
  return localService;
}

function connectionError(err) {
  console.error(err);
  const msg = String((err && err.errMsg) || '');
  if (/FUNCTION_NOT_FOUND|-501000/.test(msg)) return '云函数还没有部署，请联系开发者';
  return '网络连接失败，请检查网络后重试';
}

/** 调用一个操作：成功时返回 data，失败时抛出 Error（message 可以直接展示） */
function call(action, data) {
  const event = Object.assign({ action }, data);
  if (isLocal()) {
    return getLocalService()
      .call(action, JSON.parse(JSON.stringify(event)), LOCAL_USER)
      .then((r) => {
        if (r.ok) return r.data;
        throw new Error(r.msg);
      });
  }
  return new Promise((resolve, reject) => {
    qq.cloud.callFunction({
      name: FUNCTION,
      data: event,
      success(res) {
        const r = res.result;
        if (r && r.ok) resolve(r.data);
        else reject(new Error((r && r.msg) || '服务器没有响应，请稍后再试'));
      },
      fail(err) {
        reject(new Error(connectionError(err)));
      },
    });
  });
}

function showError(message, title) {
  qq.showModal({ title: title || '没有成功', content: String(message || '出错了，请重试'), showCancel: false });
}

/**
 * 带加载提示的调用。失败时自动弹窗提示并返回 null，调用方只需要判断返回值。
 * options.loading：加载提示文字，传 false 不显示（本机模式很快，不显示加载提示）
 * options.success：成功后的提示文字
 */
async function run(action, data, options) {
  options = options || {};
  const loading = isLocal() || options.loading === false ? false : options.loading || '请稍候';
  if (loading) qq.showLoading({ title: loading, mask: true });
  try {
    const result = await call(action, data);
    if (loading) qq.hideLoading();
    if (options.success) qq.showToast({ title: options.success, icon: 'success' });
    return result === undefined || result === null ? true : result;
  } catch (e) {
    if (loading) qq.hideLoading();
    showError(e.message, options.errorTitle);
    return null;
  }
}

module.exports = { call, run, showError, isLocal };
