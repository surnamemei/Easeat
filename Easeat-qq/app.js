//app.js
App({
  onLaunch: function () {
    console.log('进入onLaunch');
    qq.cloud.init({
      env: 'easeat-8glhnn6u4a1c8a98',
    });
    console.log('已初始化cloud环境');

    // 登录
    qq.login({
      success: (res) => {
        // 发送 res.code 到后台换取 openId, sessionKey, unionId
      },
    });
    console.log('已登录');
    console.log('onLaunch加载完毕');

    
  },
  globalData: {
    userInfo: null,
  },
});
