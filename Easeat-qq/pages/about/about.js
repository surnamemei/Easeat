const api = require('../../utils/api');
const shareLink = require('../../utils/core/share-link');
const platform = require('../../utils/platform');
const share = require('../../utils/share');

const REPO = 'https://github.com/surnamemei/Easeat';

Page({
  data: { repo: REPO, site: shareLink.SITE_URL, local: api.isLocal() },
  onLoad() {
    platform.showShareMenu();
  },
  copyRepo() {
    qq.setClipboardData({ data: REPO });
  },
  copySite() {
    qq.setClipboardData({ data: shareLink.SITE_URL });
  },
  onShareAppMessage: share.appMessage,
  onShareTimeline: share.timeline,
});
