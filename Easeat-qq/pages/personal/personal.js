var app = getApp();

Page({
  data: {
    showLoginBtn: false,
  },

  onLoad: function () {
  },
  onShareAppMessage: function () {
    qq.showShareMenu({
  showShareItems: ['qq', 'qzone', 'wechatFriends', 'wechatMoment']
})
  },
  onShareAppMessage(res) {
    if (res.from === 'button') {
      // 来自页面内转发按钮
      console.log(res.target)
    }
    return {
      title: '易位',
      path: '/pages/index/index',
      imageUrl: '/images/logo.png',
      shareType: "miniapp"
    }
  },
  onLogout:function() {
 
    qq.removeStorage({
 
      key: 'userInfo',
 
      success (res) {
 
        wx.showModal({
 
          title: '提示',
 
          content: '真的要退出登录吗',
 
          cancelText:'取消',
 
          confirmText:'确定',
 
          confirmColor:'#000000',
 
          cancelColor:'#576b95',
 
          success (res) {
 
            if (res.confirm) {
 
              wx.reLaunch({
 
                url: '/pages/index/index',
 
              })
 
            } else if (res.cancel) {
 
              console.log('用户点击取消')
 
            }
 
          }
 
        })
    }
})
  },
});
