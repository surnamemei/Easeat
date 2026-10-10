const platform = require('../../utils/platform');
const share = require('../../utils/share');
const { writeStorage } = require('../../utils/util');

const NOTES = [
  {
    version: '2.0',
    date: '2026 年 10 月',
    items: [
      '新增「大组轮换」：每个大组整体右移一组，同桌和前后排不变。',
      '新增「不相邻的同学」：指定的两位同学不会做同桌或前后桌。',
      '新增「每周自动重排」：每周一早上自动换座位。',
      '座位表可以直接点选两个座位交换，也能切换为讲台视角。',
      '座位表可以生成图片，方便保存和转发到家长群；复制到 Excel 后每个名字自动占一格。',
      '学生名单支持直接粘贴，Excel 有没有表头都能识别，电脑版也能添加名单。',
      '分享班级卡片，学生和家长点开就能加入。',
      '修复：退出班级时会把其他成员一起移出、加入班级后成员被覆盖等问题。',
      '安全：只有班级的创建者可以修改名单和座位；名单和身高只有创建者能看到。',
      '全新界面，加载更快。',
    ],
  },
  {
    version: '1.0',
    date: '2022 年 8 月',
    items: [
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
    qq.navigateTo({ url: '/pages/tutorial/tutorial' });
  },
  onShareAppMessage: share.appMessage,
  onShareTimeline: share.timeline,
});
