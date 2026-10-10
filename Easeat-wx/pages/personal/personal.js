const api = require('../../utils/api');
const platform = require('../../utils/platform');
const share = require('../../utils/share');

Page({
  data: {
    local: api.isLocal(),
  },
  onLoad() {
    platform.showShareMenu();
  },
  onShareAppMessage: share.appMessage,
  onShareTimeline: share.timeline,
});
