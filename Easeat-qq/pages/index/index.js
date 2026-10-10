const api = require('../../utils/api');
const demo = require('../../utils/core/demo');
const platform = require('../../utils/platform');
const share = require('../../utils/share');
const { formatDate, readStorage, writeStorage } = require('../../utils/util');

// 和公告页的最新版本号保持一致；用户看过之后首页不再显示更新提示
const NOTICE_VERSION = '2.0';

Page({
  data: {
    local: api.isLocal(),
    loaded: false,
    owned: [],
    joined: [],
    showNotice: false,
    dialog: null,
  },

  onLoad(options) {
    platform.showShareMenu();
    this.setData({ showNotice: readStorage('noticeSeen', '') !== NOTICE_VERSION });
    // 从老师分享的班级卡片进入时带有 join 参数（只有云端模式可以加入别人的班级）
    this.pendingJoin = !this.data.local && options && options.join ? decodeURIComponent(options.join) : null;
  },

  async onShow() {
    await this.loadClasses();
    if (this.pendingJoin) {
      const id = this.pendingJoin;
      this.pendingJoin = null;
      this.askJoin(id);
    }
  },

  async onPullDownRefresh() {
    await this.loadClasses();
    qq.stopPullDownRefresh();
  },

  async loadClasses() {
    const list = await api.run('listClasses', {}, { loading: this.data.loaded ? false : '加载中' });
    if (!list) return this.setData({ loaded: true });
    // 本机模式下班级 ID 没有用处，显示创建日期
    const meta = (c) => (this.data.local ? (c.createdAt ? `创建于 ${formatDate(c.createdAt)}` : '') : `ID：${c.id}`);
    this.setData({
      loaded: true,
      owned: list.filter((c) => c.owned).map((c) => Object.assign({ meta: meta(c) }, c)),
      joined: list.filter((c) => !c.owned).map((c) => Object.assign({ meta: meta(c) }, c)),
    });
  },

  openClass(e) {
    this.goClass(e.currentTarget.dataset.id);
  },

  goClass(id) {
    qq.navigateTo({ url: `/pages/inclass/class?classId=${encodeURIComponent(id)}` });
  },

  showCreate() {
    this.setData({
      dialog: { mode: 'create', title: '创建班级', placeholder: '班级名称，如：高一（3）班', maxlength: 20, confirmText: '创建' },
    });
  },

  showJoin() {
    this.setData({
      dialog: {
        mode: 'join',
        title: '加入班级',
        hint: '向老师要班级 ID，加入后可以查看座位表',
        placeholder: '班级 ID',
        maxlength: 40,
        confirmText: '加入',
      },
    });
  },

  closeDialog() {
    this.setData({ dialog: null });
  },

  async onDialogConfirm(e) {
    const value = e.detail.value;
    if (!value) return qq.showToast({ title: '请先输入内容', icon: 'none' });
    const mode = this.data.dialog.mode;
    this.closeDialog();
    if (mode === 'create') {
      const created = await api.run('createClass', { name: value }, { loading: '正在创建' });
      if (created) {
        this.loadClasses();
        this.goClass(created.id);
      }
    } else {
      this.joinClass(value);
    }
  },

  /** 示例班级：40 名学生，已经按身高排好，可以直接体验各项功能 */
  async createDemo() {
    const existing = this.data.owned.find((c) => c.name === demo.NAME);
    if (existing) return this.goClass(existing.id);
    const created = await api.run('createClass', { name: demo.NAME }, { loading: '正在创建' });
    if (!created) return;
    await api.run('addStudents', { classId: created.id, text: demo.ROSTER }, { loading: false });
    await api.run('arrange', { classId: created.id, mode: 'height' }, { loading: false });
    this.loadClasses();
    this.goClass(created.id);
  },

  askJoin(id) {
    if (this.data.owned.concat(this.data.joined).some((c) => c.id === id)) return this.goClass(id);
    qq.showModal({
      title: '加入班级',
      content: `要加入班级 ${id} 吗？加入后可以查看这个班的座位表。`,
      confirmText: '加入',
      success: (res) => res.confirm && this.joinClass(id),
    });
  },

  async joinClass(id) {
    const res = await api.run('joinClass', { classId: id }, { loading: '正在加入' });
    if (!res) return;
    qq.showToast({ title: res.already ? '已在班级中' : '加入成功', icon: 'success' });
    this.loadClasses();
    this.goClass(res.id);
  },

  deleteClass(e) {
    const { id, name } = e.currentTarget.dataset;
    qq.showModal({
      title: '删除班级',
      content: `确定删除「${name}」吗？学生名单和座位表都会被删除，无法恢复。`,
      confirmText: '删除',
      confirmColor: '#d93a3f',
      success: async (res) => {
        if (!res.confirm) return;
        if (await api.run('deleteClass', { classId: id }, { loading: '正在删除', success: '已删除' })) this.loadClasses();
      },
    });
  },

  quitClass(e) {
    const { id, name } = e.currentTarget.dataset;
    qq.showModal({
      title: '退出班级',
      content: `确定退出「${name}」吗？之后可以用班级 ID 重新加入。`,
      confirmText: '退出',
      success: async (res) => {
        if (!res.confirm) return;
        if (await api.run('quitClass', { classId: id }, { loading: '正在退出', success: '已退出' })) this.loadClasses();
      },
    });
  },

  openNotice() {
    writeStorage('noticeSeen', NOTICE_VERSION);
    this.setData({ showNotice: false });
    qq.navigateTo({ url: '/pages/notice/notice' });
  },

  onShareAppMessage: share.appMessage,
  onShareTimeline: share.timeline,
});
