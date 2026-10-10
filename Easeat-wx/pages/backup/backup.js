const api = require('../../utils/api');
const files = require('../../utils/files');
const fflate = require('../../utils/core/fflate');
const xlsx = require('../../utils/core/xlsx');
const shareLink = require('../../utils/core/share-link');
const platform = require('../../utils/platform');
const share = require('../../utils/share');

function toast(title) {
  wx.showToast({ title, icon: 'none' });
}

Page({
  data: {
    local: api.isLocal(),
    loading: true,
    count: 0,
    summary: '',
    canShareFile: false,
    showPaste: false,
    pasteText: '',
    siteUrl: shareLink.SITE_URL,
  },

  onLoad() {
    platform.showShareMenu();
    this.setData({ canShareFile: files.canShareFile() });
  },

  onShow() {
    this.prepare();
  },

  /** 先准备好备份内容：点按钮时要立即转发文件，中间不能再等待 */
  async prepare() {
    try {
      const backup = await api.call('exportData', {});
      const students = backup.classes.reduce((n, c) => n + c.students.length, 0);
      this.backup = backup;
      this.setData({
        loading: false,
        count: backup.classes.length,
        summary: backup.classes.length ? `${backup.classes.length} 个班级 · ${students} 名学生` : '还没有班级',
      });
    } catch (err) {
      this.setData({ loading: false, summary: '' });
      api.showError(err.message);
    }
  },

  exportFile() {
    if (!this.backup || !this.backup.classes.length) return toast('还没有可以备份的班级');
    const bytes = fflate.strToU8(JSON.stringify(this.backup));
    files.shareFile(bytes, `易位备份-${files.dateStamp()}.json`).catch(() =>
      wx.showModal({ title: '无法发送文件', content: '当前版本不支持发送文件，请改用「复制备份内容」。', showCancel: false })
    );
  },

  copyBackup() {
    if (!this.backup || !this.backup.classes.length) return toast('还没有可以备份的班级');
    wx.setClipboardData({
      data: JSON.stringify(this.backup),
      success: () =>
        wx.showModal({
          title: '已复制',
          content: '请粘贴到「文件传输助手」或备忘录里保存。恢复时选择「粘贴备份内容」。',
          showCancel: false,
        }),
    });
  },

  async restoreFile() {
    let text;
    try {
      const file = await files.chooseFile();
      if (!file) return;
      text = xlsx.decodeUtf8(file.bytes);
    } catch (err) {
      return api.showError(err.message);
    }
    this.restore(text);
  },

  togglePaste() {
    this.setData({ showPaste: !this.data.showPaste });
  },

  onPaste(e) {
    this.setData({ pasteText: e.detail.value });
  },

  restorePasted() {
    if (!this.data.pasteText.trim()) return toast('请先粘贴备份内容');
    this.restore(this.data.pasteText);
  },

  restore(text) {
    let backup;
    try {
      backup = JSON.parse(text);
    } catch (e) {
      backup = null;
    }
    if (!backup || backup.app !== 'easeat' || !Array.isArray(backup.classes)) return api.showError('这不是易位的备份文件');
    wx.showModal({
      title: '从备份恢复',
      content: `备份里有 ${backup.classes.length} 个班级，将作为新班级添加，不会覆盖现有的班级。`,
      confirmText: '恢复',
      success: async (r) => {
        if (!r.confirm) return;
        const res = await api.run('importData', { backup }, { loading: '正在恢复' });
        if (!res) return;
        this.setData({ pasteText: '', showPaste: false });
        wx.showToast({ title: `已恢复 ${res.imported.length} 个班级`, icon: 'success' });
        this.prepare();
      },
    });
  },

  copySite() {
    wx.setClipboardData({ data: shareLink.SITE_URL });
  },

  onShareAppMessage: share.appMessage,
});
