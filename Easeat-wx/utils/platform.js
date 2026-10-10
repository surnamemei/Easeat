/**
 * 微信版专用的设置。QQ 版有自己的一份（Easeat-qq/utils/platform.js），
 * 运行 node scripts/sync-qq.js 同步代码时不会覆盖它。
 */
module.exports = {
  isQQ: false,
  cloudEnv: 'cloud1-3g6vi63xc9cd9974',
  showShareMenu() {
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
  },
};
