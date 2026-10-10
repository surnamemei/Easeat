const platform = require('../../utils/platform');
const share = require('../../utils/share');
const { writeStorage } = require('../../utils/util');

const NOTES = [
  {
    version: '2.0',
    date: '2026 年 10 月',
    items: [
      '不再需要服务器：班级数据保存在手机上，打开就能用，没有网络也能排座。',
      '新增「大组轮换」：每个大组整体右移一组，同桌和前后排不变。',
      '新增「不相邻的同学」：指定的两位同学不会做同桌或前后桌。',
      '新增「每周自动重排」：每周一以后第一次打开班级时自动换座位。',
      '座位表可以导出为 Excel 文件（.xlsx），直接打印；也可以生成图片或复制表格。',
      '复制网页链接发给学生和家长，在浏览器里就能查看座位表。',
      '新增「备份与恢复」，换手机也不会丢数据；备份还可以导入网页版。',
      '新增网页版，电脑上也能使用全部功能。',
      '座位表可以直接点选两个座位交换，也能切换为讲台视角。',
      '学生名单支持直接粘贴，导入 Excel 时有没有表头都能识别。',
      '全新界面。',
    ],
  },
  {
    version: '1.0',
    date: '2022 年 8 月',
    items: [
      'Wenbo Zhang 开发了 QQ 小程序原版，surnamemei 移植到微信并负责维护。',
      '支持 QQ、微信、TIM 平台（微信和 QQ 的数据不互通）。',
      '创建、加入班级，编辑教室布局，导入学生名单，按身高随机排座位。',
    ],
  },
];

Page({
  data: { notes: NOTES },
  onLoad() {
    platform.showShareMenu();
    writeStorage('noticeSeen', NOTES[0].version);
  },
  openTutorial() {
    wx.navigateTo({ url: '/pages/tutorial/tutorial' });
  },
  onShareAppMessage: share.appMessage,
  onShareTimeline: share.timeline,
});
