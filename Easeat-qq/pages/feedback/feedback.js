const platform = require('../../utils/platform');
const share = require('../../utils/share');

const ISSUES = 'https://github.com/surnamemei/Easeat/issues';

Page({
  data: {
    issues: ISSUES,
    isQQ: platform.isQQ,
    qqGroupId: platform.qqGroupId || '',
  },
  onLoad() {
    platform.showShareMenu();
  },
  copyLink() {
    qq.setClipboardData({ data: ISSUES });
  },
  onShareAppMessage: share.appMessage,
  onShareTimeline: share.timeline,
});
