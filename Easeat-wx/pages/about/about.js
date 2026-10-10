const platform = require('../../utils/platform');
const share = require('../../utils/share');

const REPO = 'https://github.com/surnamemei/Easeat';

Page({
  data: { repo: REPO },
  onLoad() {
    platform.showShareMenu();
  },
  copyRepo() {
    wx.setClipboardData({ data: REPO });
  },
  onShareAppMessage: share.appMessage,
  onShareTimeline: share.timeline,
});
