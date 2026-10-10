const platform = require('./utils/platform');

App({
  onLaunch() {
    if (platform.mode === 'cloud') qq.cloud.init({ env: platform.cloudEnv, traceUser: true });
  },
});
