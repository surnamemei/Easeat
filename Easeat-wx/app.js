//app.js
App({
  onLaunch: function () {
    console.log('进入onLaunch');
    wx.cloud.init({
      env: 'cloud1-3g6vi63xc9cd9974',
    });
    console.log('已初始化cloud环境');

    // 登录
    wx.login({
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
