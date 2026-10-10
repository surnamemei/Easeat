const platform = require('../../utils/platform');
const share = require('../../utils/share');

Page({
  onLoad() {
    platform.showShareMenu();
  },
  onShareAppMessage: share.appMessage,
  onShareTimeline: share.timeline,
});
