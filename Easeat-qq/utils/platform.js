/**
 * QQ 版专用的设置。scripts/sync.js 同步代码时不会覆盖这个文件。
 */
module.exports = {
  isQQ: true,
  cloudEnv: 'easeat-8glhnn6u4a1c8a98',
  qqGroupId: '910716617',
  showShareMenu() {
    qq.showShareMenu({ showShareItems: ['qq', 'qzone', 'wechatFriends', 'wechatMoment'] });
  },
};
