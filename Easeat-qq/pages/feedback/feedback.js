Page({
  onLoad() {
    
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
});
