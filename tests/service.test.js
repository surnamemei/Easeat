const test = require('node:test');
const assert = require('node:assert/strict');
const { createService, weekStart } = require('../core/service');
const { createLocalDatabase } = require('../core/local-db');

const DAY = 24 * 3600 * 1000;
// 2026-10-14 是星期三
const WEDNESDAY = new Date(2026, 9, 14, 10, 0).getTime();

function localApp(start) {
  let clock = start;
  const saved = {};
  const db = createLocalDatabase({ load: (n) => saved[n] || null, save: (n, docs) => (saved[n] = JSON.parse(JSON.stringify(docs))) });
  const service = createService({ db, autoOnOpen: true, now: () => clock });
  const call = async (action, data) => {
    const res = await service.call(action, data, 'me');
    assert.equal(res.ok, true, res.msg);
    return res.data;
  };
  return { db, saved, call, service, tick: (ms) => (clock += ms) };
}

async function classWithSeats(app) {
  const { id } = await app.call('createClass', { name: '三班' });
  await app.call('addStudents', { classId: id, text: 'A 150\nB 160\nC 170\nD 155' });
  await app.call('arrange', { classId: id });
  return id;
}

test('the week starts on Monday at 06:00', () => {
  assert.equal(weekStart(WEDNESDAY), new Date(2026, 9, 12, 6, 0).getTime());
  assert.equal(weekStart(new Date(2026, 9, 12, 5, 59).getTime()), new Date(2026, 9, 5, 6, 0).getTime());
  assert.equal(weekStart(new Date(2026, 9, 18, 23, 0).getTime()), new Date(2026, 9, 12, 6, 0).getTime());
});

test('weekly catch-up only runs when the teacher opens the class in a new week', async () => {
  const app = localApp(WEDNESDAY);
  const id = await classWithSeats(app);
  await app.call('updateClass', { classId: id, settings: { autoWeekly: true } });

  // 同一周：不重排
  assert.equal((await app.call('getClass', { classId: id, open: true })).autoArranged, false);

  // 下周三：刷新（没有 open）不重排，打开时重排一次
  app.tick(7 * DAY);
  assert.equal((await app.call('getClass', { classId: id })).autoArranged, false);
  const opened = await app.call('getClass', { classId: id, open: true });
  assert.equal(opened.autoArranged, true);
  assert.equal(opened.arrangedBy, 'auto');
  assert.equal((await app.call('getClass', { classId: id, open: true })).autoArranged, false);
});

test('turning the switch on mid-week does not reshuffle until next Monday', async () => {
  const app = localApp(WEDNESDAY);
  const id = await classWithSeats(app);
  app.tick(14 * DAY);
  await app.call('updateClass', { classId: id, settings: { autoWeekly: true } });
  assert.equal((await app.call('getClass', { classId: id, open: true })).autoArranged, false);
  app.tick(7 * DAY);
  assert.equal((await app.call('getClass', { classId: id, open: true })).autoArranged, true);
});

test('restored backups keep their seating until next Monday', async () => {
  const app = localApp(WEDNESDAY);
  const id = await classWithSeats(app);
  await app.call('updateClass', { classId: id, settings: { autoWeekly: true } });
  const backup = await app.call('exportData', {});

  const other = localApp(WEDNESDAY + 21 * DAY);
  const { imported } = await other.call('importData', { backup });
  const restored = await other.call('getClass', { classId: imported[0].id, open: true });
  assert.equal(restored.autoArranged, false);
  assert.deepEqual(restored.arrangement, backup.classes[0].arrangement);
});

test('a catch-up that cannot run does not stop the class from opening', async () => {
  const app = localApp(WEDNESDAY);
  const id = await classWithSeats(app);
  await app.call('updateClass', { classId: id, settings: { autoWeekly: true, mode: 'rotate' } });
  app.tick(14 * DAY);
  // 只有一个大组，无法轮换
  await app.call('saveLayout', { classId: id, seats: [[true, true, true, true]] });
  const opened = await app.call('getClass', { classId: id, open: true });
  assert.equal(opened.autoArranged, false);
});

test('local-db re-reads saved data after reset (another browser tab wrote to it)', async () => {
  const saved = {};
  const storage = { load: (n) => saved[n] || null, save: (n, docs) => (saved[n] = JSON.parse(JSON.stringify(docs))) };
  const tab1 = createService({ db: createLocalDatabase(storage), autoOnOpen: true });
  const db2 = createLocalDatabase(storage);
  const tab2 = createService({ db: db2, autoOnOpen: true });
  await tab1.call('listClasses', {}, 'me');
  await tab2.call('listClasses', {}, 'me');
  await tab1.call('createClass', { name: 'A' }, 'me');
  db2.reset();
  await tab2.call('createClass', { name: 'B' }, 'me');
  assert.deepEqual(saved.class.map((c) => c.name).sort(), ['A', 'B']);
});

test('local-db keeps memory and storage in sync when saving fails', async () => {
  let full = false;
  const saved = {};
  const db = createLocalDatabase({
    load: (n) => saved[n] || null,
    save: (n, docs) => {
      if (full) throw new Error('quota exceeded');
      saved[n] = JSON.parse(JSON.stringify(docs));
    },
  });
  await db.collection('class').add({ data: { _id: 'a', name: 'A' } });
  full = true;
  await assert.rejects(db.collection('class').doc('a').update({ data: { name: 'B' } }));
  await assert.rejects(db.collection('class').add({ data: { _id: 'b', name: 'B' } }));
  await assert.rejects(db.collection('class').doc('a').remove());
  assert.deepEqual((await db.collection('class').where({}).get()).data, [{ _id: 'a', name: 'A' }]);

  const service = createService({ db, internalError: '保存失败' });
  full = true;
  assert.deepEqual(await service.call('createClass', { name: 'C' }, 'me'), { ok: false, msg: '保存失败' });
});
