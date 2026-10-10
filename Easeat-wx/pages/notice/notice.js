Page({
    onLoad() {
      
    },
    onShareAppMessage: function () {
      wx.showShareMenu({
    menus: ['shareAppMessage', 'shareTimeline']
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
    tutorial:function(){
        wx.navigateTo({
          url: '/pages/tutorial/tutorial',
        })
    },
  });
  