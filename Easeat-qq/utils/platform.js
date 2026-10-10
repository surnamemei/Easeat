/**
 * QQ 版专用的设置。scripts/sync.js 同步代码时不会覆盖这个文件。
 */
module.exports = {
  isQQ: true,
  /**
   * 数据保存在哪里：
   * 'local'：保存在手机上，不需要云开发，没有任何费用（默认）；
   * 'cloud'：使用云开发，学生和家长可以加入班级查看座位表，需要部署 cloudfunctions/easeat。
   */
  mode: 'local',
  cloudEnv: 'easeat-8glhnn6u4a1c8a98',
  qqGroupId: '910716617',
  showShareMenu() {
    qq.showShareMenu({ showShareItems: ['qq', 'qzone', 'wechatFriends', 'wechatMoment'] });
  },
};
