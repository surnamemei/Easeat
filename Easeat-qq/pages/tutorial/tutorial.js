Page({
    data:{
        bilibili:false,
        tiktok:false,
        show1:false,
        show2:false,
        show3:false,
        show4:false
    },
    showbilibili:function(){
        // this.setData({
        //     bilibili:true,
        // });
    },
    showtiktok:function(){
        // this.setData({
        //     tiktok:true,
        // });
    },

  switch(e) {
    let that = this;
    let key = e.currentTarget.dataset.key;
    that.setData({
      [key]: !this.data[key],
    });
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