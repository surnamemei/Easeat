const platform = require('./utils/platform');

App({
  onLaunch() {
    if (platform.mode === 'cloud') wx.cloud.init({ env: platform.cloudEnv, traceUser: true });
  },
});
