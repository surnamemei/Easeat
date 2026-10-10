Page({
  
  data: {
    showArrangement: true,
    showNameList: false,
    showSeats: false,
    showShare: false,
    updateDay:Number,
    showConfirm: false,
    confirmTittle: 'Confirm Title',
    confirmPlaceHolder: 'Confirm Place Holder',
    bindConfirm: '',
    confirmInput: '',
    column:Number,
    rows:Number,
  },

  inputStudentName: function (e) {
    this.setData({ addStudentName: e.detail.value });
  },

  inputStudentHeight: function (e) {
    this.setData({ addStudentHeight: e.detail.value });
  },

  

  addStudent: function () {
    let that = this;
    console.log(that.data);
    qq.cloud
      .callFunction({
        name: 'addStudent',
        data: {
          classId: that.data.classId,
          name: that.data.addStudentName,
          height: parseFloat(that.data.addStudentHeight) === NaN ? undefined : parseFloat(that.data.addStudentHeight),
        },
      })
      .then((res) => {
        console.log(res.result);
        that.loadStudents();
      });
  },

  chooseNamelistFile() {
    let that = this;
    qq.chooseMessageFile({
      count: 1,
      type: 'file',
      success(res) {
        let path = res.tempFiles[0].path;
        console.log('选择excel成功', path);
        that.uploadExcel(path);
      },
    });
  },

  uploadExcel(path) {
    let that = this;
    qq.cloud.uploadFile({
      cloudPath: 'NameLists/' + this.data.classId + '.xls',
      filePath: path,
      success: (res) => {
        console.log('上传成功', res.fileID);
        qq.cloud.callFunction({
          name: 'addStudentByFile',
          data: {
            classId: that.data.classId,
            fileID: res.fileID,
          },
          success(res) {
            console.log('添加学生成功', res);
            that.loadStudents();
            qq.showToast({
              title: '添加学生成功',
              icon: 'success',
              duration: 2000,
            });
          },
          fail(err) {
            console.log('添加学生失败', err);
            qq.showModal({
              title: '添加学生失败',
              showCancel: false,
              content: err.errMsg,
            });
          },
        });
      },
      fail: (err) => {
        console.log('上传失败', err);
        qq.showModal({
          title: '上传失败',
          showCancel: false,
          content: err.errMsg,
        });
      },
    });
  },

  async loadStudents() {
    console.log('正在获取名单');
    let that = this;
    await qq.cloud.callFunction({
      name: 'getStudents',
      data: {
        classId: this.data.classId,
      },
      success(res) {
        console.log('获取名单成功', res);
        that.setData({
          students: res.result,
        });
      },
      fail(err) {
        console.log('获取名单失败', err);
        qq.showModal({
          title: '获取名单失败',
          showCancel: false,
          content: err.errMsg,
        });
      },
    });
  },

  rearrangeSeat: function () {
    let that = this;
    qq.cloud.callFunction({
      name: 'rearrangeSeat',
      data: {
        classId: that.data.classId,
      },
      success(res) {
        console.log('重排座位成功', res);
        qq.showToast({
          title: '重排座位成功',
          icon: 'success',
          duration: 2000,
        });
        that.loadArrangement();
      },
      fail(err) {
        console.log('重排座位失败', err);
        qq.showModal({
          title: '重排座位失败',
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

  setSeat: function () {
    console.log(this.data);
    qq.cloud
      .callFunction({
        name: 'setSeat',
        data: {
          classId: this.data.classId,
          seats: this.data.seats,
        },
      })
      .then((res) => {
        console.log(res.result);
      });
  },

  changeSeatState: function (e) {
    console.log(i, j);
    var i = e.currentTarget.dataset.i;
    var j = e.currentTarget.dataset.j;
    var key = 'seats[' + i + '][' + j + ']';
    this.setData({
      [key]: !this.data.seats[i][j],
    });
  },

  async loadArrangement() {
    console.log('正在获取当前座位表');
    let that = this;
    await qq.cloud.callFunction({
      name: 'getArrangement',
      data: {
        classId: that.data.classId,
      },
      success(res) {
        console.log('获取当前座位表成功', res);
        let arrangement = res.result;
        let fontSizes = Array(arrangement.length)
          .fill(null)
          .map(() => Array(arrangement[0].length));
        for (r in arrangement) {
          for (c in arrangement[r]) {
            if (typeof arrangement[r][c] == 'string' && arrangement[r][c].length > 0)
              fontSizes[r][c] = Math.min(80 / arrangement[r].length / arrangement[r][c].length, 30);
          }
        }
        console.log('完成字体大小计算', fontSizes);
        that.setData({
          arrangement: res.result,
          fontSizes: fontSizes,
          noArrangement: arrangement.length == 0,
        });
      },
      fail(err) {
        console.log('获取当前座位表失败', err);
        qq.showModal({
          title: '获取当前座位表失败',
          showCancel: false,
          content: err.errMsg,
        });
      },
    });
  },

  async loadSeats() {
    console.log('正在获取座位');
    let that = this;
    await qq.cloud.callFunction({
      name: 'getSeat',
      data: {
        classId: this.data.classId,
      },
      success(res) {
        console.log('获取座位成功', res);
        that.setData({
          seats: res.result,
          row: res.result.length,
          col: res.result[0].length,
        });
      },
      fail(err) {
        console.log('获取座位失败', err);
        qq.showModal({
          title: '获取座位失败',
          showCancel: false,
          content: err.errMsg,
        });
      },
    });
  },

  copyClassId() {
    console.log('复制classId');
    qq.setClipboardData({
      data: this.data.classId,
      success: function (res) {
        console.log('复制成功', res);
        qq.showToast({
          title: '复制成功',
        });
      },
      fail(err) {
        console.log('复制失败', err);
        qq.showModal({
          title: '复制失败',
          showCancel: false,
          content: err.errMsg,
        });
      },
    });
  },

copyArrangement() {
    console.log('复制座位排布');
    let that = this;
    var a = that.data.arrangement;
    var b = a.join("\n");
    wx.setClipboardData({
      data: b,
      success: function (res) {
        console.log('复制成功', res);
        wx.showToast({
          title: '复制成功',
        });
      },
      fail(err) {
        console.log('复制失败', err);
        wx.showModal({
          title: '复制失败',
          showCancel: false,
          content: err.errMsg,
        });
      },
    });
  },
  
  deleteStudent(e) {
    let studentId = e.currentTarget.dataset.studentid;
    console.log('正在删除学生', e);
    let that = this;
    qq.cloud.callFunction({
      name: 'deleteStudent',
      data: {
        classId: that.data.classId,
        studentId: studentId,
      },
      success(res) {
        console.log('删除学生成功', res);
        that.loadStudents();
      },
      fail(err) {
        console.log('删除学生失败', err);
        qq.showModal({
          title: '删除学生失败',
          showCancel: false,
          content: err.errMsg,
        });
      },
    });
  },

  setSeatDimensions() {
    let seats = this.data.seats;
    let r = this.data.row;
    let c = this.data.col;
    seats.length = r;
    for (let i = 0; i < seats.length; i++) {
      if (seats[i] === undefined) {
        seats[i] = Array(c).fill(true);
        console.log(seats[i], '=', Array(c));
      } else {
        let l = seats[i].length;
        seats[i].length = c;
        if (l < c) seats[i].fill(true, l, c);
      }
    }
    this.setData({
      seats: seats,
    });
    console.log(this.data.seats);
  },

  inputRow: function (e) {
    this.setData({
      row: parseInt(e.detail.value),
    });
  },

  inputCol: function (e) {
    this.setData({
      col: parseInt(e.detail.value),
    });
  },

  switch(e) {
    let that = this;
    let key = e.currentTarget.dataset.key;
    that.setData({
      [key]: !this.data[key],
    });
  },

  onLoad: async function (option) {
    
    console.log('加载班级页面', option);
    this.setData({
      classId: option.classId,
      owned: option.owned == 'true',
    });
    
    this.loadStudents();
    this.loadArrangement();
    this.loadSeats();
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

  async onPullDownRefresh() {
    await Promise.all([this.loadArrangement(), this.loadSeats(), this.loadStudents()]);
    qq.stopPullDownRefresh();
  },


  notice: function () {
    const that=this;
    qq.subscribeAppMsg({
  tmplIds: ['da59ddf37d941c979d5998f7eee2f847'],
  subscribe: true,
  success(res) {
    console.log("----subscribeAppMsg----success", res);
    qq.cloud.callFunction({
      name: 'notice',
      success(res) {
        console.log( res);
        that.loadStudents();
      },
      fail(err) {
        console.log( err);
        qq.showModal({
          title: '错误',
          showCancel: false,
          content: err.errMsg,
        });
      },
    });
  },
  fail(res) {
    console.log("----subscribeAppMsg----fail", res);
  }
});
  },
  cancelnotice: function () {
    qq.subscribeAppMsg({
  tmplIds: ['da59ddf37d941c979d5998f7eee2f847'],
  subscribe: false,
  success(res) {
    console.log("----subscribeAppMsg----success", res);
  },
  fail(res) {
    console.log("----subscribeAppMsg----fail", res);
  }
});
  },
  opensetting: function(){
    qq.openSetting({
      success(res){
      console.log(res.authSetting)
      }
    })
  },
    confirmChangeData: function(e){
        var column=e.currentTarget.dataset.column;
        var row=e.currentTarget.dataset.row;
        this.setData({
        column:column,
        rows:row,
      });
      this.confirmData();
  },
  confirmData(){
      this.setData({
        confirmTittle: '更改数据',
        confirmPlaceHolder: '数据',
        onConfirm: this.changeData,
      });
      this.setData({
        confirmInput: '',
        showConfirm: true,
      });
  },
  confirmAcceptance: function () {
    this.setData({
      showConfirm: false,
    });
    this.data.onConfirm();
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
  changeData:function(){
      console.log(this);
      var that=this;
      qq.cloud.callFunction({
        name: 'changeData',
        data: {
            classId:that.data.classId,
          column:that.data.column,
          row:that.data.rows,
          afterdata:that.data.confirmInput,
        },
        success(res) {
          console.log('修改成功', res);
          console.log(that.data);
          wx.showToast({
            title: '修改成功',
            icon: 'success',
            duration: 2000,
          });
        },
        fail(err) {
          console.log('修改失败', err);
          wx.showModal({
            title: '修改失败',
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
      qq.switchTab({
        url:
          '/pages/index/index',
      });
  },
});
