/**
 * 文件的导出和读取：导出 Excel、备份文件，导入名单。全部在手机上完成，不需要服务器。
 */
function fs() {
  return wx.getFileSystemManager();
}

function isDesktop() {
  try {
    const info = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync();
    const p = String(info.platform || '').toLowerCase();
    return p === 'windows' || p === 'mac';
  } catch (e) {
    return false;
  }
}

function toArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function cancelled(err) {
  return /cancel/i.test((err && err.errMsg) || '');
}

/** 能否把文件直接交给用户（转发到聊天或保存到电脑） */
function canShareFile() {
  return Boolean((isDesktop() && wx.saveFileToDisk) || wx.shareFileMessage);
}

/**
 * 把文件交给用户：手机上转发到聊天，电脑上保存到磁盘；都不支持时用文档预览打开（右上角菜单可以转发）。
 * 请在点击事件里直接调用，不要先 await 别的操作（iOS 只允许点击直接触发转发文件）。
 * bytes：Uint8Array；fileName：文件名；previewType：可以预览的类型（如 'xlsx'），没有时不支持预览
 * 返回 Promise：完成时为 true，用户取消时为 false
 */
function shareFile(bytes, fileName, previewType) {
  const safeName = fileName.replace(/[\\/:*?"<>|]/g, '_');
  const filePath = `${wx.env.USER_DATA_PATH}/${safeName}`;
  fs().writeFileSync(filePath, toArrayBuffer(bytes));
  return new Promise((resolve, reject) => {
    const preview = () => {
      if (!previewType || !wx.openDocument) return reject(new Error('当前版本不支持导出文件，请更新到最新版本'));
      wx.openDocument({
        filePath,
        fileType: previewType,
        showMenu: true,
        success: () => resolve(true),
        fail: (err) => reject(new Error(`无法打开文件（${err.errMsg}）`)),
      });
    };
    const done = { success: () => resolve(true), fail: (err) => (cancelled(err) ? resolve(false) : preview()) };
    if (isDesktop() && wx.saveFileToDisk) wx.saveFileToDisk(Object.assign({ filePath }, done));
    else if (wx.shareFileMessage) wx.shareFileMessage(Object.assign({ filePath, fileName: safeName }, done));
    else preview();
  });
}

/** 从聊天记录里选择一个文件，返回 { name, bytes }；用户取消时返回 null */
function chooseFile() {
  return new Promise((resolve, reject) => {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success(res) {
        const file = res.tempFiles[0];
        try {
          resolve({ name: file.name || file.path, bytes: new Uint8Array(fs().readFileSync(file.path)) });
        } catch (e) {
          reject(new Error('无法读取这个文件'));
        }
      },
      fail(err) {
        if (cancelled(err)) resolve(null);
        else reject(new Error(`无法选择文件（${err.errMsg}）。也可以用「粘贴名单」添加。`));
      },
    });
  });
}

/** 文件名里的日期，例如 2026-10-11 */
function dateStamp(ts) {
  const d = new Date(ts || Date.now());
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

module.exports = { shareFile, chooseFile, canShareFile, isDesktop, dateStamp };
