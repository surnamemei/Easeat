const platform = require('./utils/platform');

App({
  onLaunch() {
    wx.cloud.init({ env: platform.cloudEnv, traceUser: true });
  },
});
