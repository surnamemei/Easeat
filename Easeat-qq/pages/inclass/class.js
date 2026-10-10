const api = require('../../utils/api');
const chart = require('../../utils/seat-chart');
const platform = require('../../utils/platform');
const { formatTime, readStorage, writeStorage } = require('../../utils/util');

const MODES = [
  { key: 'height', name: '按身高', desc: '矮的同学坐前面；身高相近的同学每次随机交换位置。' },
  { key: 'random', name: '完全随机', desc: '不考虑身高，所有人随机就座。' },
  { key: 'rotate', name: '大组轮换', desc: '每个大组整体向右移一组（最右边的组移到最左边），前后排和同桌都不变。' },
];
const MAX_ROWS = 20;
const MAX_COLS = 20;
const DEFAULT_LAYOUT = Array.from({ length: 6 }, () => [true, true, false, true, true, false, true, true, false, true, true]);

function toast(title) {
  qq.showToast({ title, icon: 'none' });
}

function pixelRatio() {
  const info = qq.getWindowInfo ? qq.getWindowInfo() : qq.getSystemInfoSync();
  return info.pixelRatio || 2;
}

Page({
  data: {
    classId: '',
    loaded: false,
    failed: false,
    owned: false,
    name: '',
    seats: [],
    arrangement: [],
    arrangedAt: null,
    arrangedBy: null,
    arrangedText: '',
    students: [],
    settings: { mode: 'height', autoWeekly: false, separate: [] },
    memberCount: 0,
    modes: MODES,
    modeName: MODES[0].name,
    modeDesc: MODES[0].desc,
    grid: null,
    flip: false,
    selected: null,
    unseated: [],
    unseatedText: '',
    pairs: [],
    pickA: -1,
    pickB: -1,
    open: { roster: false, rules: false, layout: false, share: false },
    draft: null,
    draftView: [],
    newName: '',
    newHeight: '',
    showBatch: false,
    batchText: '',
    dialog: null,
  },

  onLoad(options) {
    platform.showShareMenu();
    this.setData({
      classId: decodeURIComponent(options.classId || ''),
      flip: readStorage('flipChart', false) === true,
    });
    this.load(true);
  },

  async onPullDownRefresh() {
    await this.load(false);
    qq.stopPullDownRefresh();
  },

  async load(first) {
    const detail = await api.run('getClass', { classId: this.data.classId }, { loading: first ? '加载中' : false });
    if (!detail) return this.setData({ loaded: true, failed: !this.data.name });
    qq.setNavigationBarTitle({ title: detail.name });
    const changes = Object.assign({ loaded: true, failed: false }, detail);
    delete changes.id;
    if (!detail.settings) delete changes.settings;
    this.update(changes);
    if (this.data.open.layout) this.startLayoutEdit();
  },

  /** 更新数据，并重新计算座位网格、未就座名单等派生数据 */
  update(changes) {
    const s = Object.assign({}, this.data, changes);
    const nameOf = new Map(s.students.map((x) => [x.id, x.name]));
    const mode = MODES.find((m) => m.key === s.settings.mode) || MODES[0];
    const grid = s.seats.length ? chart.buildGrid(s.seats, s.arrangement, { flip: s.flip }) : null;
    const unseated = s.owned && grid && grid.match ? chart.unseatedNames(s.students, s.arrangement, s.seats) : [];
    const derived = {
      grid,
      unseated,
      unseatedText: unseated.length > 6 ? `${unseated.slice(0, 6).join('、')} 等 ${unseated.length} 人` : unseated.join('、'),
      pairs: (s.settings.separate || [])
        .filter(([a, b]) => nameOf.has(a) && nameOf.has(b))
        .map(([a, b]) => ({ key: `${a}-${b}`, a, b, text: `${nameOf.get(a)} ↔ ${nameOf.get(b)}` })),
      modeName: mode.name,
      modeDesc: mode.desc,
      arrangedText: s.arrangedAt ? `${formatTime(s.arrangedAt)} ${s.arrangedBy === 'auto' ? '自动重排' : '排座'}` : '',
    };
    if ('arrangement' in changes || 'seats' in changes) derived.selected = null;
    this.setData(Object.assign({}, changes, derived));
  },

  toggle(e) {
    const key = e.currentTarget.dataset.key;
    const opened = !this.data.open[key];
    this.setData({ [`open.${key}`]: opened });
    if (key === 'layout' && opened) this.startLayoutEdit();
  },

  toggleFlip() {
    const flip = !this.data.flip;
    writeStorage('flipChart', flip);
    this.update({ flip });
  },

  // ------------------------------------------------------------ 座位表

  tapSeat(e) {
    if (!this.data.owned) return;
    const { r, c } = e.currentTarget.dataset;
    const { selected, arrangement, grid } = this.data;
    if (!arrangement.length) {
      // 还没排过座：直接手动填写姓名
      this.setData({ selected: { r, c, name: '' } });
      return this.showSeatDialog();
    }
    if (!grid.match) return toast('教室布局修改过，请先重新排座');
    if (selected && selected.r === r && selected.c === c) return this.setData({ selected: null });
    if (!selected) return this.setData({ selected: { r, c, name: arrangement[r][c] || '' } });
    this.swapSeats(selected, { r, c });
  },

  clearSelected() {
    this.setData({ selected: null });
  },

  async swapSeats(a, b) {
    const res = await api.run('swapSeats', { classId: this.data.classId, a: [a.r, a.c], b: [b.r, b.c] }, { loading: false });
    if (res) this.update({ arrangement: res.arrangement });
    else this.setData({ selected: null });
  },

  showSeatDialog() {
    this.setData({
      dialog: {
        mode: 'seat',
        title: '填写座位上的姓名',
        hint: '留空表示这个座位空着',
        placeholder: '姓名',
        value: this.data.selected.name,
        maxlength: 20,
      },
    });
  },

  showRename() {
    this.setData({ dialog: { mode: 'rename', title: '修改班级名称', placeholder: '班级名称', value: this.data.name, maxlength: 20 } });
  },

  closeDialog() {
    this.setData({ dialog: null });
    if (!this.data.arrangement.length) this.setData({ selected: null });
  },

  async onDialogConfirm(e) {
    const value = e.detail.value;
    const { mode } = this.data.dialog;
    if (mode === 'rename' && !value) return toast('请输入班级名称');
    this.setData({ dialog: null });
    if (mode === 'seat') {
      const { r, c } = this.data.selected;
      const res = await api.run('setSeatName', { classId: this.data.classId, row: r, col: c, name: value }, { loading: false });
      if (res) this.update({ arrangement: res.arrangement });
      else this.setData({ selected: null });
    } else if (mode === 'rename') {
      const res = await api.run('updateClass', { classId: this.data.classId, name: value }, { success: '已改名' });
      if (res) {
        this.setData({ name: res.name });
        qq.setNavigationBarTitle({ title: res.name });
      }
    }
  },

  selectMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.settings.mode) return;
    this.update({ settings: Object.assign({}, this.data.settings, { mode }) });
    // 记住老师选择的方式，每周自动重排也会用它
    api.call('updateClass', { classId: this.data.classId, settings: { mode } }).catch((err) => console.warn(err));
  },

  arrange() {
    const go = async () => {
      const res = await api.run('arrange', { classId: this.data.classId, mode: this.data.settings.mode }, { loading: '正在排座' });
      if (!res) return;
      this.update({
        arrangement: res.arrangement,
        arrangedAt: res.arrangedAt,
        arrangedBy: 'manual',
        settings: Object.assign({}, this.data.settings, { mode: res.mode }),
      });
      if (res.unresolved) {
        qq.showModal({
          title: '排好了，但有同学没能分开',
          content: `座位比较紧张，有 ${res.unresolved} 组“不相邻”的同学仍然挨着坐。可以点选座位手动交换，或增加课桌后重新排座。`,
          showCancel: false,
        });
      } else {
        qq.showToast({ title: '排好了', icon: 'success' });
      }
    };
    if (this.data.grid && this.data.grid.seated) {
      qq.showModal({
        title: '重新排座',
        content: `将按「${this.data.modeName}」重新排座，当前座位表会被替换。`,
        confirmText: '排座',
        success: (res) => res.confirm && go(),
      });
    } else {
      go();
    }
  },

  exportChart() {
    if (!this.data.grid || !this.data.grid.seated) return toast('还没有座位表');
    qq.showActionSheet({
      itemList: ['生成图片（可保存、转发）', '复制到 Excel / WPS'],
      success: (res) => (res.tapIndex === 0 ? this.saveImage() : this.copyTable()),
    });
  },

  copyTable() {
    qq.setClipboardData({
      data: chart.toTSV(`${this.data.name} 座位表`, this.data.arrangement, this.data.flip),
      success: () =>
        qq.showModal({
          title: '已复制',
          content: '打开 Excel 或 WPS 表格，选中一个单元格后粘贴，每个名字会自动占一格。',
          showCancel: false,
        }),
    });
  },

  saveImage() {
    qq.showLoading({ title: '正在生成', mask: true });
    qq.createSelectorQuery()
      .select('#chart-canvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        const canvas = res && res[0] && res[0].node;
        if (!canvas) {
          qq.hideLoading();
          return api.showError('当前版本不支持生成图片，请更新到最新版本，或使用「复制到 Excel」。');
        }
        const size = chart.measure(this.data.seats);
        const ratio = Math.min(pixelRatio(), 3, 4000 / size.width, 4000 / size.height);
        canvas.width = Math.round(size.width * ratio);
        canvas.height = Math.round(size.height * ratio);
        const ctx = canvas.getContext('2d');
        ctx.scale(ratio, ratio);
        chart.draw(ctx, {
          title: `${this.data.name} 座位表`,
          subtitle: this.data.arrangedAt ? `排座时间：${formatTime(this.data.arrangedAt)}` : '',
          seats: this.data.seats,
          arrangement: this.data.arrangement,
          flip: this.data.flip,
        });
        qq.canvasToTempFilePath({
          canvas,
          fileType: 'png',
          success: (file) => {
            qq.hideLoading();
            // 在预览中长按图片即可保存到相册或发送给朋友
            qq.previewImage({ urls: [file.tempFilePath] });
          },
          fail: (err) => {
            qq.hideLoading();
            api.showError(`生成图片失败：${err.errMsg}`);
          },
        });
      });
  },

  // ------------------------------------------------------------ 学生名单

  onNewName(e) {
    this.setData({ newName: e.detail.value });
  },

  onNewHeight(e) {
    this.setData({ newHeight: e.detail.value });
  },

  async addOne() {
    const name = this.data.newName.trim();
    if (!name) return toast('请输入学生姓名');
    const res = await api.run(
      'addStudents',
      { classId: this.data.classId, students: [{ name, height: this.data.newHeight }] },
      { loading: '正在添加' }
    );
    if (!res) return;
    this.update({ students: res.students, newName: '', newHeight: '' });
    toast(`已添加 ${name}`);
  },

  toggleBatch() {
    this.setData({ showBatch: !this.data.showBatch });
  },

  onBatchInput(e) {
    this.setData({ batchText: e.detail.value });
  },

  async addBatch() {
    if (!this.data.batchText.trim()) return toast('请先粘贴名单');
    const res = await api.run('addStudents', { classId: this.data.classId, text: this.data.batchText }, { loading: '正在添加' });
    if (!res) return;
    this.update({ students: res.students, batchText: '', showBatch: false });
    qq.showToast({ title: `已添加 ${res.added} 人`, icon: 'success' });
  },

  importExcel() {
    qq.chooseMessageFile({
      count: 1,
      type: 'file',
      success: (res) => this.uploadRoster(res.tempFiles[0]),
      fail: (err) => {
        if (!/cancel/.test(err.errMsg)) api.showError(`无法选择文件（${err.errMsg}）。也可以用「粘贴名单」添加。`);
      },
    });
  },

  uploadRoster(file) {
    const ext = (/\.(xlsx|xls|csv)$/i.exec(file.name || file.path) || [])[1];
    if (!ext) return api.showError('请选择 Excel 表格文件（.xlsx 或 .xls）');
    qq.showLoading({ title: '正在上传', mask: true });
    qq.cloud.uploadFile({
      cloudPath: `NameLists/${this.data.classId}-${Date.now()}.${ext.toLowerCase()}`,
      filePath: file.path,
      success: async (uploaded) => {
        qq.hideLoading();
        const parsed = await api.run('', { fileID: uploaded.fileID }, { name: 'parseRoster', loading: '正在读取' });
        if (!parsed) return;
        const res = await api.run('addStudents', { classId: this.data.classId, rows: parsed.rows }, { loading: '正在添加' });
        if (!res) return;
        this.update({ students: res.students });
        qq.showToast({ title: `已添加 ${res.added} 人`, icon: 'success' });
      },
      fail: (err) => {
        qq.hideLoading();
        api.showError(`上传失败：${err.errMsg}`);
      },
    });
  },

  deleteStudent(e) {
    const { id, name } = e.currentTarget.dataset;
    qq.showModal({
      title: '删除学生',
      content: `确定把「${name}」从名单中删除吗？座位表里的名字也会一起清掉。`,
      confirmText: '删除',
      confirmColor: '#d93a3f',
      success: async (r) => {
        if (!r.confirm) return;
        const res = await api.run('deleteStudent', { classId: this.data.classId, studentId: id }, { loading: false });
        if (res) this.update({ students: res.students, arrangement: res.arrangement, settings: res.settings, pickA: -1, pickB: -1 });
      },
    });
  },

  // ------------------------------------------------------------ 排座规则

  async toggleAuto(e) {
    const autoWeekly = e.detail.value;
    const res = await api.run('updateClass', { classId: this.data.classId, settings: { autoWeekly } }, { loading: false });
    if (res) {
      this.update({ settings: res.settings });
      if (autoWeekly) toast('每周一早上 6:00 自动重排');
    } else {
      // 恢复开关的显示状态
      this.setData({ 'settings.autoWeekly': autoWeekly });
      this.setData({ 'settings.autoWeekly': !autoWeekly });
    }
  },

  onPickA(e) {
    this.setData({ pickA: Number(e.detail.value) });
  },

  onPickB(e) {
    this.setData({ pickB: Number(e.detail.value) });
  },

  async savePairs(pairs) {
    const res = await api.run('updateClass', { classId: this.data.classId, settings: { separate: pairs } }, { loading: false });
    if (res) this.update({ settings: res.settings, pickA: -1, pickB: -1 });
    return res;
  },

  async addPair() {
    const { students, pickA, pickB, pairs } = this.data;
    if (pickA < 0 || pickB < 0) return toast('请选择两位同学');
    const a = students[pickA].id;
    const b = students[pickB].id;
    if (a === b) return toast('请选择两位不同的同学');
    if (pairs.some((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a))) return toast('已经添加过了');
    if (await this.savePairs(pairs.map((p) => [p.a, p.b]).concat([[a, b]]))) toast('下次排座时生效');
  },

  removePair(e) {
    const key = e.currentTarget.dataset.key;
    this.savePairs(this.data.pairs.filter((p) => p.key !== key).map((p) => [p.a, p.b]));
  },

  // ------------------------------------------------------------ 教室布局

  startLayoutEdit() {
    const base = this.data.seats.length ? this.data.seats : DEFAULT_LAYOUT;
    this.setDraft(base.map((row) => row.slice()));
  },

  setDraft(draft) {
    const cols = draft.length ? draft[0].length : 0;
    this.setData({
      draft,
      draftView: draft.map((row, r) => ({ key: r, cells: row.map((on, c) => ({ key: c, on })) })),
      draftRows: draft.length,
      draftCols: cols,
      draftCell: Math.max(28, Math.min(64, Math.floor((640 - cols * 8) / Math.max(cols, 1)))),
      draftDesks: draft.reduce((n, row) => n + row.filter(Boolean).length, 0),
      draftChanged: JSON.stringify(draft) !== JSON.stringify(this.data.seats),
    });
  },

  toggleDesk(e) {
    const { r, c } = e.currentTarget.dataset;
    const draft = this.data.draft.map((row) => row.slice());
    draft[r][c] = !draft[r][c];
    this.setDraft(draft);
  },

  changeRows(e) {
    const delta = Number(e.currentTarget.dataset.delta);
    const draft = this.data.draft.map((row) => row.slice());
    if (delta > 0) {
      if (draft.length >= MAX_ROWS) return toast(`最多 ${MAX_ROWS} 排`);
      draft.push(draft[draft.length - 1].slice());
    } else {
      if (draft.length <= 1) return;
      draft.pop();
    }
    this.setDraft(draft);
  },

  changeCols(e) {
    const delta = Number(e.currentTarget.dataset.delta);
    const cols = this.data.draft[0].length;
    if (delta > 0 && cols >= MAX_COLS) return toast(`最多 ${MAX_COLS} 列`);
    if (delta < 0 && cols <= 1) return;
    this.setDraft(this.data.draft.map((row) => (delta > 0 ? row.concat(true) : row.slice(0, -1))));
  },

  resetLayout() {
    this.startLayoutEdit();
  },

  async saveLayout() {
    if (!this.data.draftChanged) return toast('布局没有变化');
    const res = await api.run('saveLayout', { classId: this.data.classId, seats: this.data.draft }, { loading: '正在保存' });
    if (!res) return;
    this.update({ seats: res.seats, arrangement: res.arrangement });
    this.setDraft(res.seats);
    if (res.cleared) {
      qq.showModal({ title: '布局已保存', content: '课桌变少了，原来的座位表放不下，已经清空。请点「重新排座」。', showCancel: false });
    } else {
      qq.showToast({ title: '已保存', icon: 'success' });
    }
  },

  // ------------------------------------------------------------ 分享

  copyId() {
    qq.setClipboardData({ data: this.data.classId });
  },

  onShareAppMessage() {
    return {
      title: `邀请你加入「${this.data.name}」，查看座位表`,
      path: `/pages/index/index?join=${encodeURIComponent(this.data.classId)}`,
      imageUrl: '/images/share.png',
    };
  },
});
