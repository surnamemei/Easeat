/**
 * 微信版专用的设置。QQ 版有自己的一份（Easeat-qq/utils/platform.js），
 * 运行 node scripts/sync.js 同步代码时不会覆盖它。
 */
module.exports = {
  isQQ: false,
  /**
   * 数据保存在哪里：
   * 'local'：保存在手机上，不需要云开发，没有任何费用（默认）；
   * 'cloud'：使用云开发，学生和家长可以加入班级查看座位表，需要部署 cloudfunctions/easeat。
   */
  mode: 'local',
  cloudEnv: 'cloud1-3g6vi63xc9cd9974',
  showShareMenu() {
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
  },
};
