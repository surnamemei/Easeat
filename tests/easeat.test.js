const assert = require('node:assert/strict');
const path = require('path');
const { installMockCloud } = require('./helpers/mock-cloud');

// 微信版和 QQ 版（由 scripts/sync.js 生成）的云函数跑同一套测试
for (const platform of ['wx', 'qq']) {
  const FUNCTION_DIR = path.join(__dirname, `../Easeat-${platform}/cloudfunctions/easeat`);
  const test = (name, fn) => require('node:test')(`[${platform}] ${name}`, fn);

  /** 每个测试使用一个全新的模拟云环境 */
  function setup() {
    const mock = installMockCloud();
    for (const key of Object.keys(require.cache)) if (key.startsWith(FUNCTION_DIR)) delete require.cache[key];
    const fn = require(FUNCTION_DIR);
    const as = (openid) => async (action, data = {}) => {
      mock.setContext(openid ? { OPENID: openid } : {});
      return fn.main(Object.assign({ action }, data));
    };
    return { mock, fn, teacher: as('teacher'), parent: as('parent'), other: as('other'), as };
  }

  const ok = (res) => {
    assert.equal(res.ok, true, res.msg);
    return res.data;
  };
  const err = (res, pattern) => {
    assert.equal(res.ok, false, 'expected the call to fail');
    assert.match(res.msg, pattern);
  };

  test('create, join, list and quit classes', async (t) => {
    const { mock, teacher, parent, other } = setup();
    t.after(() => mock.restore());

    const created = ok(await teacher('createClass', { name: '  高一（3）班 ' }));
    assert.match(created.id, /^[2-9a-z]{6}$/);
    assert.equal(created.name, '高一（3）班');

    // 班级 ID 不区分大小写，前后空格会被忽略
    const joined = ok(await parent('joinClass', { classId: ` ${created.id.toUpperCase()} ` }));
    assert.equal(joined.already, false);
    assert.equal(ok(await parent('joinClass', { classId: created.id })).already, true);
    assert.equal(ok(await teacher('joinClass', { classId: created.id })).already, true);
    ok(await other('joinClass', { classId: created.id }));

    assert.deepEqual(
      ok(await teacher('listClasses')).map((c) => [c.name, c.owned]),
      [['高一（3）班', true]]
    );
    assert.deepEqual(
      ok(await parent('listClasses')).map((c) => [c.name, c.owned]),
      [['高一（3）班', false]]
    );

    // 旧版本的 bug：一个人退出会清空所有成员
    ok(await parent('quitClass', { classId: created.id }));
    assert.deepEqual(ok(await parent('listClasses')), []);
    assert.equal(ok(await other('listClasses')).length, 1);

    err(await parent('joinClass', { classId: 'nothere' }), /找不到这个班级/);
    err(await parent('createClass', { name: '   ' }), /请输入班级名称/);
  });

  test('only the owner can see the roster or change anything', async (t) => {
    const { mock, teacher, parent, other } = setup();
    t.after(() => mock.restore());
    const { id } = ok(await teacher('createClass', { name: '初二1班' }));
    ok(await parent('joinClass', { classId: id }));
    ok(await teacher('addStudents', { classId: id, text: '张三 160\n李四 150' }));
    ok(await teacher('arrange', { classId: id }));

    const view = ok(await parent('getClass', { classId: id }));
    assert.equal(view.owned, false);
    assert.deepEqual(view.students, []);
    assert.equal(view.settings, null);
    assert.equal(view.arrangement.flat().filter(Boolean).length, 2);

    err(await other('getClass', { classId: id }), /还没有加入/);
    for (const [action, data] of [
      ['addStudents', { text: '王五' }],
      ['deleteStudent', { studentId: 1 }],
      ['arrange', {}],
      ['saveLayout', { seats: [[true]] }],
      ['swapSeats', { a: [0, 0], b: [0, 1] }],
      ['setSeatName', { row: 0, col: 0, name: 'x' }],
      ['updateClass', { name: 'hacked' }],
      ['deleteClass', {}],
    ]) {
      err(await parent(action, Object.assign({ classId: id }, data)), /只有班级的创建者/);
    }
    err(await teacher('nonsense'), /版本太旧/);
    mock.setContext({});
    err(await require(FUNCTION_DIR).main({ action: 'listClasses' }), /请在小程序中使用/);
  });

  test('roster, layout, arranging and editing seats', async (t) => {
    const { mock, teacher } = setup();
    t.after(() => mock.restore());
    const { id } = ok(await teacher('createClass', { name: '三班' }));

    const added = ok(await teacher('addStudents', { classId: id, text: '姓名\t身高\n甲\t170\n乙\t150\n丙\n丁\t160' }));
    assert.equal(added.added, 4);
    assert.deepEqual(
      added.students.map((s) => [s.id, s.name, s.height]),
      [
        [1, '甲', 170],
        [2, '乙', 150],
        [3, '丙', null],
        [4, '丁', 160],
      ]
    );
    ok(await teacher('addStudents', { classId: id, students: [{ name: '戊', height: '1.55' }] }));
    ok(await teacher('addStudents', { classId: id, rows: [['姓名', '身高'], ['己', 158]] }));
    err(await teacher('addStudents', { classId: id, text: '\n\n' }), /没有识别到学生姓名/);

    const seats = [
      [true, true, false, true, true],
      [true, true, false, true, true],
    ];
    ok(await teacher('saveLayout', { classId: id, seats }));
    const arranged = ok(await teacher('arrange', { classId: id, mode: 'random' }));
    assert.equal(arranged.mode, 'random');
    assert.ok(arranged.arrangedAt > 0);
    assert.deepEqual(arranged.arrangement.flat().filter(Boolean).sort(), ['丁', '丙', '乙', '己', '戊', '甲'].sort());

    let detail = ok(await teacher('getClass', { classId: id }));
    assert.equal(detail.settings.mode, 'random');
    assert.equal(detail.arrangedBy, 'manual');

    // 交换两个座位、手动改名
    const before = detail.arrangement;
    const swapped = ok(await teacher('swapSeats', { classId: id, a: [0, 0], b: [1, 4] })).arrangement;
    assert.equal(swapped[0][0], before[1][4]);
    assert.equal(swapped[1][4], before[0][0]);
    err(await teacher('swapSeats', { classId: id, a: [0, 2], b: [0, 0] }), /没有课桌/);
    const renamed = ok(await teacher('setSeatName', { classId: id, row: 0, col: 1, name: ' 班长 ' })).arrangement;
    assert.equal(renamed[0][1], '班长');
    detail = ok(await teacher('getClass', { classId: id }));
    assert.ok(detail.arrangedAt > 0, 'editing seats keeps the arranged time');

    // 删除学生时，名字从座位表和不相邻名单中一起移除
    const target = detail.students.find((s) => detail.arrangement.flat().includes(s.name));
    ok(await teacher('updateClass', { classId: id, settings: { separate: [[target.id, 6]] } }));
    const afterDelete = ok(await teacher('deleteStudent', { classId: id, studentId: target.id }));
    assert.ok(!afterDelete.arrangement.flat().includes(target.name));
    assert.deepEqual(afterDelete.settings.separate, []);
    assert.ok(!afterDelete.students.some((s) => s.id === target.id));

    // 新学生的编号不会和已删除的重复
    const more = ok(await teacher('addStudents', { classId: id, text: '庚' })).students;
    assert.equal(more[more.length - 1].id, 7);
  });

  test('changing the layout keeps the seating when it still fits', async (t) => {
    const { mock, teacher } = setup();
    t.after(() => mock.restore());
    const { id } = ok(await teacher('createClass', { name: '四班' }));
    ok(await teacher('addStudents', { classId: id, text: 'A\nB\nC' }));
    ok(await teacher('saveLayout', { classId: id, seats: [[true, true, true, true]] }));
    const { arrangement } = ok(await teacher('arrange', { classId: id }));

    const twoRows = [[true, true, true, true], [true, true, true, true]];
    const grown = ok(await teacher('saveLayout', { classId: id, seats: twoRows }));
    assert.equal(grown.fits, true);
    assert.deepEqual(grown.arrangement[0], arrangement[0]);

    // 放不下时保留原来的座位表，改回原来的布局就能恢复
    const shrunk = ok(await teacher('saveLayout', { classId: id, seats: [[true, false]] }));
    assert.equal(shrunk.fits, false);
    assert.deepEqual(shrunk.arrangement, grown.arrangement);
    const restored = ok(await teacher('saveLayout', { classId: id, seats: twoRows }));
    assert.equal(restored.fits, true);
    assert.deepEqual(ok(await teacher('getClass', { classId: id })).arrangement, grown.arrangement);
    ok(await teacher('saveLayout', { classId: id, seats: [[true, false]] }));

    err(await teacher('saveLayout', { classId: id, seats: [[false]] }), /至少要有一张课桌/);
    err(await teacher('saveLayout', { classId: id, seats: [[true], [true, true]] }), /布局数据有误/);
    err(await teacher('arrange', { classId: id }), /座位不够/);
  });

  test('settings are validated and the weekly timer only touches opted-in classes', async (t) => {
    const { mock, teacher, fn } = setup();
    t.after(() => mock.restore());
    const auto = ok(await teacher('createClass', { name: '自动班' })).id;
    const manual = ok(await teacher('createClass', { name: '手动班' })).id;
    for (const id of [auto, manual]) {
      ok(await teacher('addStudents', { classId: id, text: 'A 150\nB 160\nC 170' }));
      ok(await teacher('arrange', { classId: id }));
    }

    const saved = ok(
      await teacher('updateClass', {
        classId: auto,
        name: '自动班（改名）',
        settings: { mode: 'rotate', autoWeekly: true, separate: [[1, 2], [2, 1], [1, 1], [1, 99]], junk: 1 },
      })
    );
    assert.deepEqual(saved.settings, { mode: 'rotate', autoWeekly: true, separate: [[1, 2]] });
    assert.equal(saved.name, '自动班（改名）');
    err(await teacher('updateClass', { classId: auto, name: '' }), /请输入班级名称/);

    const before = ok(await teacher('getClass', { classId: auto })).arrangement;
    const manualBefore = ok(await teacher('getClass', { classId: manual }));

    mock.setContext({ SOURCE: 'wx_trigger' });
    const result = await fn.main({ Type: 'Timer', TriggerName: 'weeklyRearrange' });
    assert.deepEqual(result, { done: 1, skipped: 0 });

    const after = ok(await teacher('getClass', { classId: auto }));
    assert.equal(after.arrangedBy, 'auto');
    assert.notDeepEqual(after.arrangement, before, 'rotate mode moved the groups');
    assert.deepEqual(ok(await teacher('getClass', { classId: manual })).arrangedAt, manualBefore.arrangedAt);
  });

  test('a client cannot trigger the weekly job by pretending to be a timer', async (t) => {
    const { mock, teacher } = setup();
    t.after(() => mock.restore());
    const res = await teacher('listClasses', { Type: 'Timer', TriggerName: 'weeklyRearrange' });
    assert.equal(res.ok, true);
  });

  test('settings changes made at the same time do not undo each other', async (t) => {
    const { mock, teacher } = setup();
    t.after(() => mock.restore());
    const { id } = ok(await teacher('createClass', { name: '五班' }));
    await Promise.all([
      teacher('updateClass', { classId: id, settings: { mode: 'random' } }),
      teacher('updateClass', { classId: id, settings: { autoWeekly: true } }),
    ]);
    assert.deepEqual(ok(await teacher('getClass', { classId: id })).settings, { mode: 'random', autoWeekly: true, separate: [] });
    for (const mode of ['constructor', 'toString', '__proto__']) {
      err(await teacher('updateClass', { classId: id, settings: { mode } }), /未知的排座方式/);
    }
  });

  test('duplicate student ids and untrimmed names from the old version are repaired', async (t) => {
    const { mock, teacher } = setup();
    t.after(() => mock.restore());
    const put = (name, doc) => mock.db.collection(name).add({ data: doc });
    // 旧版本导入 Excel 后没有更新 studentIdTop，所以出现了重复的编号；姓名也可能带空格
    await put('class', { _id: '2b7', name: '旧班', owner: 'teacher' });
    await put('classStudent', {
      _id: '2b7',
      studentIdTop: 2,
      students: [{ id: 1, name: '新同学', height: null }, { id: 1, name: '张三 ', height: 160 }, { id: 2, name: '李四', height: 150 }],
    });
    await put('classUser', { _id: '2b7', members: [] });
    await put('classSeat', { _id: '2b7', seats: [[true, true, true]] });
    await put('classArrangement', { _id: '2b7', arrangement: [['张三 ', '李四', '新同学']] });

    const detail = ok(await teacher('getClass', { classId: '2b7' }));
    assert.deepEqual(detail.students.map((s) => [s.id, s.name]), [[1, '新同学'], [3, '张三'], [2, '李四']]);
    assert.deepEqual(detail.arrangement, [['张三', '李四', '新同学']]);

    const after = ok(await teacher('deleteStudent', { classId: '2b7', studentId: 3 }));
    assert.deepEqual(after.students.map((s) => s.name), ['新同学', '李四']);
    assert.deepEqual(after.arrangement, [['', '李四', '新同学']]);
    const added = ok(await teacher('addStudents', { classId: '2b7', text: '王五' })).students;
    assert.equal(added[added.length - 1].id, 4);
  });

  test('classes created by the old version still work', async (t) => {
    const { mock, teacher, parent } = setup();
    t.after(() => mock.restore());
    const { store } = mock.db;
    const put = (name, doc) => mock.db.collection(name).add({ data: doc });
    await put('class', { _id: '1a6', name: '9班', owner: 'teacher' });
    await put('classStudent', { _id: '1a6', studentIdTop: 4, students: [{ id: 3, name: '丙', height: null }, null, { id: 1, name: '甲', height: 165 }] });
    await put('classUser', { _id: '1a6', members: 'someone-else' });
    await put('classSeat', { _id: '1a6', seats: [[true, true, false, true, true, true, false, true, true]] });
    // classArrangement 记录缺失

    const detail = ok(await teacher('getClass', { classId: '1A6' }));
    assert.deepEqual(detail.students.map((s) => s.name), ['丙', '甲']);
    assert.deepEqual(detail.arrangement, []);
    assert.equal(detail.memberCount, 1);
    assert.deepEqual(detail.settings, { mode: 'height', autoWeekly: false, separate: [] });

    ok(await parent('joinClass', { classId: '1a6' }));
    assert.deepEqual(store.classUser.get('1a6').members, ['someone-else', 'parent']);

    const { arrangement } = ok(await teacher('arrange', { classId: '1a6' }));
    assert.equal(arrangement.flat().filter(Boolean).length, 2);
    ok(await teacher('setSeatName', { classId: '1a6', row: 0, col: 0, name: '' }));

    const { students } = ok(await teacher('addStudents', { classId: '1a6', text: '丁' }));
    assert.equal(students[students.length - 1].id, 4);
    assert.ok(!store.classStudent.get('1a6').students.includes(null));
  });

  test('deleting a class removes all its records', async (t) => {
    const { mock, teacher, parent } = setup();
    t.after(() => mock.restore());
    const { id } = ok(await teacher('createClass', { name: '要删除的班' }));
    ok(await parent('joinClass', { classId: id }));
    ok(await teacher('deleteClass', { classId: id }));
    for (const name of ['class', 'classStudent', 'classUser', 'classSeat', 'classArrangement']) {
      assert.equal(mock.db.store[name].has(id), false, `${name} should be removed`);
    }
    assert.deepEqual(ok(await parent('listClasses')), []);
    err(await teacher('getClass', { classId: id }), /班级不存在/);
  });
}
