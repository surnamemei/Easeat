//logs.js
const util = require('../../utils/util.js');

Page({
  data: {
    logs: [],
    showConfirm: false,
    confirmTittle: 'Confirm Title',
    confirmPlaceHolder: 'Confirm Place Holder',
    bindConfirm: '',
    confirmInput: '',
  },

  notice:function(){
      qq.navigateTo({
        url: '/pages/notice/notice',
      });
  },
  joinClass: function () {
    let that = this;
    qq.cloud.callFunction({
      name: 'joinClass',
      data: {
        classId: that.data.confirmInput,
      },
      success(res) {
        console.log('加入班级成功', res);
        qq.showToast({
          title: '加入班级成功',
          icon: 'success',
          duration: 2000,
        });
        that.loadClassList();
      },
      fail(err) {
        console.log('加入班级失败', err);
        qq.showModal({
          title: '加入班级失败',
          showCancel: false,
          content: err.errMsg,
          success(res) {
            if (res.confirm) {
              console.log('用户点击确定');
            } else if (res.cancel) {
              console.log('用户点击取消');
            }
          },
        });
      },
    });
  },

  async loadClassList() {
    let that = this;
    await qq.cloud.callFunction({
      name: 'getClassList',
      success(res) {
        console.log('获取班级列表成功', res);
        that.setData({ classes: res.result });
        return res.result;
      },
      fail(err) {
        console.log('获取班级列表失败', err);
        return err;
      },
    });
  },

  nevigate2Class: function (event) {
    console.log('正在跳转至班级页面', event.currentTarget);
    qq.navigateTo({
      url:
        '/pages/class/class?classId=' +
        event.currentTarget.dataset.classid +
        '&owned=' +
        event.currentTarget.dataset.owned,
    });
  },

  deleteClass: function (e) {
    let that = this;
    qq.showModal({
      title: '删除班级',
      content: '是否确定删除班级？',
      success(res) {
        if (res.confirm) {
          console.log('用户点击确定');
          qq.cloud.callFunction({
            name: 'deleteClass',
            data: {
              classId: e.currentTarget.dataset.classid,
            },
            success(res) {
              console.log('删除成功', res);
              qq.showToast({
                title: '删除成功',
                icon: 'success',
                duration: 2000,
              });
              that.loadClassList();
            },
            fail(err) {
              console.log('删除失败', err);
              qq.showModal({
                title: '删除失败',
                showCancel: false,
                content: err.errMsg,
                success(res) {
                  if (res.confirm) {
                    console.log('用户点击确定');
                  } else if (res.cancel) {
                    console.log('用户点击取消');
                  }
                },
              });
            },
          });
        } else if (res.cancel) {
          console.log('用户点击取消');
        }
      },
    });
  },

  quitClass: function (e) {
    console.log(e);
    let that = this;
    qq.showModal({
      title: '退出班级',
      content: '是否确定退出班级？',
      success(res) {
        if (res.confirm) {
          console.log('用户点击确定');
          qq.cloud.callFunction({
            name: 'quitClass',
            data: {
              classId: e.currentTarget.dataset.classid,
            },
            success(res) {
              console.log('退出成功', res);
              qq.showToast({
                title: '退出成功',
                icon: 'success',
                duration: 2000,
              });
              that.loadClassList();
            },
            fail(err) {
              console.log('退出失败', err);
              qq.showToast({
                title: '退出失败',
                icon: 'none',
                duration: 2000,
              });
            },
          });
        } else if (res.cancel) {
          console.log('用户点击取消');
        }
      },
    });
  },

  onLoad: async function () {
    this.loadClassList();
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
  

  confirmCreateClass: function () {
    this.setData({
      confirmTittle: '创建班级',
      confirmPlaceHolder: '班级名',
      onConfirm: this.createClass,
    });
    this.setData({
      confirmInput: '',
      showConfirm: true,
    });
  },

  confirmJoinClass: function () {
    this.setData({
      confirmTittle: '加入班级',
      confirmPlaceHolder: '班级id',
      onConfirm: this.joinClass,
    });
    this.setData({
      confirmInput: '',
      showConfirm: true,
    });
  },

  setValue: function (e) {
    this.setData({
      confirmInput: e.detail.value,
    });
  },

  cancel: function () {
    console.log('cancle');
    var that = this;
    that.setData({
      showConfirm: false,
    });
  },

  createClass: function () {
    let that = this;
    qq.cloud.callFunction({
      name: 'createClass',
      data: {
        name: that.data.confirmInput,
      },
      success(res) {
        console.log('创建成功', res);
        qq.showToast({
          title: '创建成功',
          icon: 'success',
          duration: 2000,
        });
        that.loadClassList();
      },
      fail(err) {
        console.log('创建失败', err);
        qq.showModal({
          title: '创建失败',
          showCancel: false,
          content: err.errMsg,
          success(res) {
            if (res.confirm) {
              console.log('用户点击确定');
            } else if (res.cancel) {
              console.log('用户点击取消');
            }
          },
        });
      },
    });
  },

  async onPullDownRefresh() {
    await this.loadClassList();
    qq.stopPullDownRefresh();
  },

  confirmAcceptance: function () {
    this.setData({
      showConfirm: false,
    });
    this.data.onConfirm();
  },
});
