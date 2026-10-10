const platform = require('./utils/platform');

App({
  onLaunch() {
    qq.cloud.init({ env: platform.cloudEnv, traceUser: true });
  },
});
