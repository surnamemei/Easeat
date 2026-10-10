/**
 * 调用云函数。所有后台操作都在 easeat 云函数里，用 action 区分。
 */
const FUNCTION = 'easeat';

function connectionError(err) {
  console.error(err);
  const msg = String((err && err.errMsg) || '');
  if (/FUNCTION_NOT_FOUND|-501000/.test(msg)) return '云函数还没有部署，请联系开发者';
  return '网络连接失败，请检查网络后重试';
}

/** 调用云函数：成功时返回 data，失败时抛出 Error（message 可以直接展示） */
function call(action, data, name) {
  return new Promise((resolve, reject) => {
    qq.cloud.callFunction({
      name: name || FUNCTION,
      data: Object.assign({ action }, data),
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
 * options.loading：加载提示文字，传 false 不显示
 * options.success：成功后的提示文字
 * options.name：云函数名称（默认 easeat）
 */
async function run(action, data, options) {
  options = options || {};
  const loading = options.loading === undefined ? '请稍候' : options.loading;
  if (loading) qq.showLoading({ title: loading, mask: true });
  try {
    const result = await call(action, data, options.name);
    if (loading) qq.hideLoading();
    if (options.success) qq.showToast({ title: options.success, icon: 'success' });
    return result === undefined || result === null ? true : result;
  } catch (e) {
    if (loading) qq.hideLoading();
    showError(e.message, options.errorTitle);
    return null;
  }
}

module.exports = { call, run, showError };
