/**
 * 页面测试：像用户一样操作小程序页面，页面 → 云函数 → 数据库全程走真实代码。
 */
const assert = require('node:assert/strict');
const { createMiniProgram, tap } = require('./helpers/mock-wx');

const ROSTER = ['姓名\t身高', '张一\t150', '李二\t152', '王三\t160', '赵四\t171', '钱五\t155', '孙六\t166', '周七', '吴八\t158'].join('\n');

function deskCells(page) {
  return page.data.grid.rows.flatMap((row) => row.cells).filter((cell) => cell.type === 'desk' || cell.type === 'empty');
}

for (const platform of ['wx', 'qq']) {
  const test = (name, fn) => require('node:test')(`[${platform}] ${name}`, fn);

  test('teacher creates a class, adds students, arranges and edits seats', async (t) => {
    const app = createMiniProgram({ platform });
    t.after(() => app.restore());

    // 首页创建班级
    const home = app.open('pages/index/index');
    await app.settle();
    assert.equal(home.data.loaded, true);
    assert.equal(home.data.showNotice, true);
    home.showCreate();
    assert.equal(home.data.dialog.mode, 'create');
    home.onDialogConfirm({ detail: { value: '高一（3）班' } });
    await app.settle();
    assert.equal(home.data.dialog, null);
    assert.equal(home.data.owned.length, 1);
    const url = app.log.navigations.pop();
    const classId = decodeURIComponent(url.split('classId=')[1]);
    assert.equal(url, `/pages/inclass/class?classId=${classId}`);

    // 班级页：默认布局，还没有学生
    const page = app.open('pages/inclass/class', { classId });
    await app.settle();
    assert.equal(page.data.owned, true);
    assert.equal(page.data.name, '高一（3）班');
    assert.equal(page.data.grid.desks, 48);
    assert.equal(page.data.grid.seated, 0);
    assert.deepEqual(app.log.titles.slice(-1), ['高一（3）班']);

    // 粘贴名单、逐个添加
    page.toggleBatch();
    page.onBatchInput({ detail: { value: ROSTER } });
    page.addBatch();
    await app.settle();
    assert.equal(page.data.students.length, 8);
    assert.equal(page.data.showBatch, false);
    page.onNewName({ detail: { value: '郑九' } });
    page.onNewHeight({ detail: { value: '1.62' } });
    page.addOne();
    await app.settle();
    assert.equal(page.data.students.length, 9);
    assert.equal(page.data.students[8].height, 162);
    assert.equal(page.data.newName, '');

    // 按身高排座：矮的在前排
    page.arrange();
    await app.settle();
    assert.equal(page.data.grid.seated, 9);
    assert.equal(page.data.unseated.length, 0);
    assert.match(page.data.arrangedText, /排座$/);
    const firstRow = page.data.arrangement[0].filter(Boolean);
    assert.ok(firstRow.includes('张一') && firstRow.includes('李二'));

    // 再次排座需要确认；取消时不会改变座位
    const before = JSON.stringify(page.data.arrangement);
    page.arrange();
    await app.settle();
    assert.equal(JSON.stringify(page.data.arrangement), before);

    // 点两个座位交换
    const [a, b] = deskCells(page).filter((c) => c.type === 'desk');
    page.tapSeat(tap({ r: a.r, c: a.c }));
    assert.deepEqual(page.data.selected, { r: a.r, c: a.c, name: a.name });
    page.tapSeat(tap({ r: b.r, c: b.c }));
    // 云函数还没返回时再点，不会再发出交换请求
    page.tapSeat(tap({ r: b.r, c: b.c }));
    page.tapSeat(tap({ r: a.r, c: a.c }));
    await app.settle();
    assert.equal(app.log.calls.filter((c) => c === 'swapSeats').length, 1);
    assert.equal(page.data.selected, null);
    assert.equal(page.data.arrangement[a.r][a.c], b.name);
    assert.equal(page.data.arrangement[b.r][b.c], a.name);

    // 选中空座位后改姓名
    const empty = deskCells(page).find((c) => c.type === 'empty');
    page.tapSeat(tap({ r: empty.r, c: empty.c }));
    page.showSeatDialog();
    assert.equal(page.data.dialog.mode, 'seat');
    page.onDialogConfirm({ detail: { value: '插班生' } });
    await app.settle();
    assert.equal(page.data.arrangement[empty.r][empty.c], '插班生');

    // 换成大组轮换，重新打开页面后仍然记得
    page.selectMode(tap({ mode: 'rotate' }));
    await app.settle();
    assert.equal(page.data.modeName, '大组轮换');
    const beforeRotate = page.data.arrangement;
    app.answerModal({ confirm: true });
    page.arrange();
    await app.settle();
    // 默认布局有 4 个大组（第 0-1、3-4、6-7、9-10 列），每组右移一组，最右边的组移到最左边
    assert.deepEqual(page.data.arrangement[0].slice(3, 5), beforeRotate[0].slice(0, 2));
    assert.deepEqual(page.data.arrangement[0].slice(0, 2), beforeRotate[0].slice(9, 11));
    const reopened = app.open('pages/inclass/class', { classId });
    await app.settle();
    assert.equal(reopened.data.settings.mode, 'rotate');

    // 不相邻名单和每周自动重排
    page.onPickA({ detail: { value: '0' } });
    page.onPickB({ detail: { value: '1' } });
    page.addPair();
    await app.settle();
    assert.deepEqual(page.data.pairs.map((p) => p.text), ['张一 ↔ 李二']);
    page.addPair();
    assert.equal(app.log.toasts.pop(), '请选择两位同学');
    page.toggleAuto({ detail: { value: true } });
    await app.settle();
    assert.equal(page.data.settings.autoWeekly, true);

    // 修改教室布局：加一排，原来的座位保留
    const kept = JSON.stringify(page.data.arrangement);
    page.toggle(tap({ key: 'layout' }));
    assert.equal(page.data.draftRows, 6);
    page.changeRows(tap({ delta: 1 }));
    assert.equal(page.data.draftDesks, 56);
    page.toggleDesk(tap({ r: 6, c: 0 }));
    assert.equal(page.data.draftDesks, 55);
    page.saveLayout();
    await app.settle();
    assert.equal(page.data.seats.length, 7);
    assert.equal(JSON.stringify(page.data.arrangement.slice(0, 6)), kept);

    // 复制到 Excel
    page.copyTable();
    const lines = app.log.clipboard.split('\n');
    assert.equal(lines[0], '高一（3）班 座位表');
    assert.equal(lines[1], '（讲台）');
    assert.equal(lines[2].split('\t').length, 11);

    // 讲台视角：上下左右都翻转，复制的表格讲台在最后
    page.toggleFlip();
    assert.equal(page.data.flip, true);
    assert.equal(page.data.grid.rows[0].key, 6);
    page.copyTable();
    assert.equal(app.log.clipboard.split('\n').pop(), '（讲台）');

    // 删除学生：名单、座位表和不相邻名单一起更新
    app.answerModal({ confirm: true });
    page.deleteStudent(tap({ id: page.data.students[0].id, name: '张一' }));
    await app.settle();
    assert.equal(page.data.students.length, 8);
    assert.ok(!page.data.arrangement.flat().includes('张一'));
    assert.deepEqual(page.data.pairs, []);
  });

  test('students and parents join from a shared card and can only view', async (t) => {
    const app = createMiniProgram({ platform });
    t.after(() => app.restore());

    const home = app.open('pages/index/index');
    await app.settle();
    home.showCreate();
    home.onDialogConfirm({ detail: { value: '初二2班' } });
    await app.settle();
    const classId = home.data.owned[0].id;
    const teacherPage = app.open('pages/inclass/class', { classId });
    await app.settle();
    teacherPage.onBatchInput({ detail: { value: 'A 150\nB 160' } });
    teacherPage.addBatch();
    await app.settle();
    teacherPage.arrange();
    await app.settle();
    const share = teacherPage.onShareAppMessage();
    assert.equal(share.path, `/pages/index/index?join=${classId}`);

    // 家长点开分享卡片
    app.as('parent');
    app.answerModal({ confirm: true });
    const parentHome = app.open('pages/index/index', { join: classId });
    await app.settle();
    assert.match(app.log.modals.find((m) => m.title === '加入班级').content, new RegExp(classId));
    assert.equal(parentHome.data.joined.length, 1);
    assert.equal(app.log.navigations.pop(), `/pages/inclass/class?classId=${classId}`);

    const view = app.open('pages/inclass/class', { classId });
    await app.settle();
    assert.equal(view.data.owned, false);
    assert.deepEqual(view.data.students, []);
    assert.equal(view.data.grid.seated, 2);
    view.tapSeat(tap({ r: 0, c: 0 }));
    assert.equal(view.data.selected, null);

    // 再次点开分享卡片时直接进入班级，不再询问
    const modalsBefore = app.log.modals.length;
    app.open('pages/index/index', { join: classId });
    await app.settle();
    assert.equal(app.log.modals.length, modalsBefore);
    assert.equal(app.log.navigations.pop(), `/pages/inclass/class?classId=${classId}`);

    // 退出班级
    app.answerModal({ confirm: true });
    parentHome.quitClass(tap({ id: classId, name: '初二2班' }));
    await app.settle();
    assert.deepEqual(parentHome.data.joined, []);
  });

  test('errors from the cloud are shown to the user', async (t) => {
    const app = createMiniProgram({ platform });
    t.after(() => app.restore());
    const home = app.open('pages/index/index');
    await app.settle();
    home.showJoin();
    home.onDialogConfirm({ detail: { value: 'zzzzzz' } });
    await app.settle();
    assert.match(app.log.modals.pop().content, /找不到这个班级/);

    const page = app.open('pages/inclass/class', { classId: 'zzzzzz' });
    await app.settle();
    assert.equal(page.data.failed, true);
  });

  test('other pages load', async (t) => {
    const app = createMiniProgram({ platform });
    t.after(() => app.restore());
    for (const route of ['personal/personal', 'tutorial/tutorial', 'notice/notice', 'about/about', 'feedback/feedback']) {
      const page = app.open(`pages/${route}`);
      if (page.onShareAppMessage) assert.equal(page.onShareAppMessage().path, '/pages/index/index');
    }
    assert.equal(app.storage.noticeSeen, '2.0');
    const tutorial = app.open('pages/tutorial/tutorial');
    tutorial.toggle(tap({ index: 2 }));
    assert.equal(tutorial.data.sections[2].open, true);
    const feedback = app.open('pages/feedback/feedback');
    feedback.copyLink();
    assert.equal(app.log.clipboard, 'https://github.com/surnamemei/Easeat/issues');
    assert.equal(feedback.data.isQQ, platform === 'qq');
  });
}
