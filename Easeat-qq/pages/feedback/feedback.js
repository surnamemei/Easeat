const platform = require('../../utils/platform');
const share = require('../../utils/share');

const EMAIL = 'pr_eaSEAT@163.com';

Page({
  data: {
    email: EMAIL,
    isQQ: platform.isQQ,
    qqGroupId: platform.qqGroupId || '',
  },
  onLoad() {
    platform.showShareMenu();
  },
  copyEmail() {
    qq.setClipboardData({ data: EMAIL });
  },
  onShareAppMessage: share.appMessage,
  onShareTimeline: share.timeline,
});
