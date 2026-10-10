/**
 * 易位 eaSEAT 云函数：小程序的所有后台操作都通过这一个云函数完成。
 * 调用方式：wx.cloud.callFunction({ name: 'easeat', data: { action: 'getClass', classId } })
 * 返回 { ok: true, data } 或 { ok: false, msg }。
 *
 * 另外配置了定时触发器（见 config.json），每周一早上为开启“每周自动重排”的班级重新排座。
 */
const crypto = require('crypto');
const cloud = require('wx-server-sdk');
const { arrange, fitToLayout, cleanStudents, matchesLayout, MODES } = require('./arrange');
const roster = require('./roster');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const classes = db.collection('class');
const classStudents = db.collection('classStudent');
const classUsers = db.collection('classUser');
const classSeats = db.collection('classSeat');
const classArrangements = db.collection('classArrangement');

const MAX_CLASSES_PER_USER = 50;
const MAX_STUDENTS = 150;
const MAX_ROWS = 20;
const MAX_COLS = 20;
const MAX_PAIRS = 100;
const ID_CHARS = '23456789abcdefghjkmnpqrstuvwxyz';

// 6 排，每排 4 个大组、每组 2 张课桌
const DEFAULT_SEATS = Array.from({ length: 6 }, () => [true, true, false, true, true, false, true, true, false, true, true]);
const DEFAULT_SETTINGS = { mode: 'height', autoWeekly: false, separate: [] };

/** 抛出一个可以直接显示给用户的错误 */
function fail(msg) {
  const e = new Error(msg);
  e.expose = true;
  throw e;
}

async function getDoc(collection, id) {
  try {
    return (await collection.doc(id).get()).data;
  } catch (e) {
    if (/not exist|不存在/.test(String(e.errMsg || e.message))) return null;
    throw e;
  }
}

function normalizeId(classId) {
  const id = typeof classId === 'string' ? classId.trim().toLowerCase() : '';
  if (!/^[0-9a-z]{1,40}$/.test(id)) fail('班级 ID 格式不对，请检查后重新输入');
  return id;
}

function cleanText(value, label, max) {
  const text = roster.cleanName(value);
  if (!text) fail(`请输入${label}`);
  if (Array.from(String(value).trim()).length > max) fail(`${label}最多 ${max} 个字`);
  return text;
}

function membersOf(doc) {
  const m = doc && doc.members;
  if (Array.isArray(m)) return m.filter((x) => typeof x === 'string');
  return typeof m === 'string' ? [m] : [];
}

function settingsOf(cls) {
  const s = Object.assign({}, DEFAULT_SETTINGS, cls && cls.settings);
  return {
    mode: MODES[s.mode] ? s.mode : 'height',
    autoWeekly: s.autoWeekly === true,
    separate: Array.isArray(s.separate) ? s.separate : [],
  };
}

/** 读取班级并检查权限。need: 'owner' 只有创建者可以，'member' 创建者或成员都可以 */
async function loadClass(classId, openid, need) {
  const id = normalizeId(classId);
  const cls = await getDoc(classes, id);
  if (!cls) fail('班级不存在，可能已被删除');
  const owned = cls.owner === openid;
  if (need === 'owner' && !owned) fail('只有班级的创建者可以修改');
  if (need === 'member' && !owned) {
    if (!membersOf(await getDoc(classUsers, id)).includes(openid)) fail('你还没有加入这个班级');
  }
  return { id, cls, owned };
}

async function loadStudents(id) {
  const doc = await getDoc(classStudents, id);
  return { students: cleanStudents(doc && doc.students), top: (doc && doc.studentIdTop) || 1 };
}

async function loadArrangement(id) {
  const doc = await getDoc(classArrangements, id);
  return (doc && Array.isArray(doc.arrangement) && doc.arrangement) || [];
}

async function loadSeats(id) {
  const doc = await getDoc(classSeats, id);
  return (doc && Array.isArray(doc.seats) && doc.seats) || [];
}

/** 保存座位表。by 为 'manual' 或 'auto' 时表示重新排了座，同时记录排座时间 */
async function saveArrangement(id, arrangement, by) {
  if (by) {
    const arrangedAt = Date.now();
    await classArrangements.doc(id).set({ data: { arrangement, arrangedAt, arrangedBy: by } });
    return arrangedAt;
  }
  const res = await classArrangements.doc(id).update({ data: { arrangement: _.set(arrangement) } });
  // 旧版本创建的班级可能缺少这条记录
  if (!(res.stats && res.stats.updated) && !(await getDoc(classArrangements, id))) {
    await classArrangements.doc(id).set({ data: { arrangement } });
  }
  return null;
}

function saveStudents(id, students, top) {
  return classStudents.doc(id).set({ data: { students, studentIdTop: top } });
}

/** 只保留名单里还存在的学生组成的不相邻组合 */
function cleanPairs(pairs, students) {
  const ids = new Set(students.map((s) => s.id));
  const seen = new Set();
  const out = [];
  for (const pair of pairs || []) {
    if (!Array.isArray(pair) || pair.length !== 2) continue;
    const [a, b] = pair.map(Number);
    if (a === b || !ids.has(a) || !ids.has(b)) continue;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([a, b]);
  }
  return out.slice(0, MAX_PAIRS);
}

function validateSeats(seats) {
  if (!Array.isArray(seats) || !seats.length || seats.length > MAX_ROWS) fail(`教室最多 ${MAX_ROWS} 排`);
  const cols = Array.isArray(seats[0]) ? seats[0].length : 0;
  if (!cols || cols > MAX_COLS) fail(`教室最多 ${MAX_COLS} 列`);
  if (!seats.every((row) => Array.isArray(row) && row.length === cols)) fail('教室布局数据有误，请重试');
  const clean = seats.map((row) => row.map((desk) => desk === true));
  if (!clean.some((row) => row.some(Boolean))) fail('教室里至少要有一张课桌');
  return clean;
}

function validatePosition(arrangement, pos) {
  if (!Array.isArray(pos) || pos.length !== 2) fail('座位位置有误');
  const [r, c] = pos.map(Number);
  if (!arrangement[r] || arrangement[r][c] === undefined || arrangement[r][c] === null) fail('这里没有课桌');
  return [r, c];
}

async function newClassId() {
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = Array.from(crypto.randomBytes(6), (b) => ID_CHARS[b % ID_CHARS.length]).join('');
    if (!(await getDoc(classes, id))) return id;
  }
  fail('创建失败，请重试');
}

// ---------------------------------------------------------------- 班级

async function listClasses(event, openid) {
  const [own, joined] = await Promise.all([
    classes.where({ owner: openid }).limit(100).get(),
    classUsers.where({ members: openid }).limit(100).get(),
  ]);
  const ownIds = new Set(own.data.map((c) => c._id));
  const joinedIds = joined.data.map((d) => d._id).filter((id) => !ownIds.has(id));
  const joinedClasses = joinedIds.length ? (await classes.where({ _id: _.in(joinedIds) }).limit(100).get()).data : [];
  const summary = (owned) => (c) => ({ id: c._id, name: c.name || '未命名班级', owned, createdAt: c.createdAt || 0 });
  const byNewest = (a, b) => b.createdAt - a.createdAt;
  return own.data.map(summary(true)).sort(byNewest).concat(joinedClasses.map(summary(false)).sort(byNewest));
}

async function createClass(event, openid) {
  const name = cleanText(event.name, '班级名称', 20);
  const { total } = await classes.where({ owner: openid }).count();
  if (total >= MAX_CLASSES_PER_USER) fail(`每人最多创建 ${MAX_CLASSES_PER_USER} 个班级，请先删除不用的班级`);
  const id = await newClassId();
  await classes.add({ data: { _id: id, owner: openid, name, createdAt: Date.now(), settings: DEFAULT_SETTINGS } });
  await Promise.all([
    classStudents.add({ data: { _id: id, studentIdTop: 1, students: [] } }),
    classUsers.add({ data: { _id: id, members: [] } }),
    classSeats.add({ data: { _id: id, seats: DEFAULT_SEATS } }),
    classArrangements.add({ data: { _id: id, arrangement: [] } }),
  ]);
  return { id, name };
}

async function joinClass(event, openid) {
  const id = normalizeId(event.classId);
  const cls = await getDoc(classes, id);
  if (!cls) fail('找不到这个班级，请检查班级 ID 是否正确');
  if (cls.owner === openid) return { id, name: cls.name, already: true };
  const doc = await getDoc(classUsers, id);
  const members = membersOf(doc);
  if (members.includes(openid)) return { id, name: cls.name, already: true };
  if (!doc) await classUsers.add({ data: { _id: id, members: [openid] } });
  else if (!Array.isArray(doc.members)) await classUsers.doc(id).update({ data: { members: _.set(members.concat(openid)) } });
  else await classUsers.doc(id).update({ data: { members: _.addToSet(openid) } });
  return { id, name: cls.name, already: false };
}

async function quitClass(event, openid) {
  const id = normalizeId(event.classId);
  const doc = await getDoc(classUsers, id);
  if (doc && Array.isArray(doc.members)) await classUsers.doc(id).update({ data: { members: _.pull(openid) } });
  else if (doc) await classUsers.doc(id).update({ data: { members: _.set(membersOf(doc).filter((m) => m !== openid)) } });
  return true;
}

async function deleteClass(event, openid) {
  const { id } = await loadClass(event.classId, openid, 'owner');
  const remove = (collection) => collection.doc(id).remove().catch((e) => console.warn('remove', id, e));
  await Promise.all([classStudents, classUsers, classSeats, classArrangements].map(remove));
  await classes.doc(id).remove();
  return true;
}

async function getClass(event, openid) {
  const { id, cls, owned } = await loadClass(event.classId, openid, 'member');
  const [seats, arrDoc, roll, users] = await Promise.all([
    loadSeats(id),
    getDoc(classArrangements, id),
    owned ? loadStudents(id) : null,
    owned ? getDoc(classUsers, id) : null,
  ]);
  const settings = settingsOf(cls);
  return {
    id,
    name: cls.name || '未命名班级',
    owned,
    seats,
    arrangement: (arrDoc && Array.isArray(arrDoc.arrangement) && arrDoc.arrangement) || [],
    arrangedAt: (arrDoc && arrDoc.arrangedAt) || null,
    arrangedBy: (arrDoc && arrDoc.arrangedBy) || null,
    // 名单（含身高）和设置只给创建者看
    students: owned ? roll.students : [],
    settings: owned ? Object.assign(settings, { separate: cleanPairs(settings.separate, roll.students) }) : null,
    memberCount: owned ? membersOf(users).length : null,
  };
}

async function updateClass(event, openid) {
  const { id, cls } = await loadClass(event.classId, openid, 'owner');
  const data = {};
  const result = {};
  if (event.name !== undefined) data.name = result.name = cleanText(event.name, '班级名称', 20);
  if (event.settings && typeof event.settings === 'object') {
    const next = settingsOf({ settings: Object.assign(settingsOf(cls), event.settings) });
    next.separate = cleanPairs(next.separate, (await loadStudents(id)).students);
    data.settings = _.set(next);
    result.settings = next;
  }
  if (Object.keys(data).length) await classes.doc(id).update({ data });
  return result;
}

// ---------------------------------------------------------------- 学生名单

async function addToRoster(id, incoming) {
  if (!incoming.length) fail('没有识别到学生姓名。请每行写一个学生：姓名 身高（身高可不填）');
  const { students, top } = await loadStudents(id);
  if (students.length + incoming.length > MAX_STUDENTS) {
    fail(`每个班最多 ${MAX_STUDENTS} 名学生，现在有 ${students.length} 名，这次要添加 ${incoming.length} 名`);
  }
  let next = Math.max(top, ...students.map((s) => s.id + 1));
  const added = incoming.map((s) => ({ id: next++, name: s.name, height: s.height }));
  const all = students.concat(added);
  await saveStudents(id, all, next);
  return { students: all, added: added.length };
}

/**
 * 添加学生，三种格式任选其一：
 * students: [{ name, height }]（逐个添加）
 * text: 粘贴的文字，每行“姓名 身高”
 * rows: Excel 表格的行（由 parseRoster 云函数读取）
 */
async function addStudents(event, openid) {
  const { id } = await loadClass(event.classId, openid, 'owner');
  let incoming;
  if (Array.isArray(event.students)) incoming = roster.normalize(event.students);
  else if (Array.isArray(event.rows)) incoming = roster.parseRows(event.rows);
  else incoming = roster.parseText(event.text);
  return addToRoster(id, incoming);
}

async function deleteStudent(event, openid) {
  const { id, cls } = await loadClass(event.classId, openid, 'owner');
  const [{ students, top }, arrangement] = await Promise.all([loadStudents(id), loadArrangement(id)]);
  const target = students.find((s) => s.id === Number(event.studentId));
  if (!target) return { students, arrangement, settings: settingsOf(cls) };
  const rest = students.filter((s) => s !== target);
  const tasks = [saveStudents(id, rest, top)];

  // 同名的同学都还在名单里时不动座位表，否则把这个名字从座位表中清掉
  let seated = 0;
  let last = null;
  arrangement.forEach((row, r) =>
    (row || []).forEach((name, c) => {
      if (name === target.name) {
        seated++;
        last = [r, c];
      }
    })
  );
  if (seated > rest.filter((s) => s.name === target.name).length) {
    arrangement[last[0]][last[1]] = '';
    tasks.push(saveArrangement(id, arrangement));
  }

  const settings = settingsOf(cls);
  const pairs = cleanPairs(settings.separate, rest);
  if (pairs.length !== settings.separate.length) {
    settings.separate = pairs;
    tasks.push(classes.doc(id).update({ data: { settings: _.set(settings) } }));
  }
  await Promise.all(tasks);
  return { students: rest, arrangement, settings };
}

// ---------------------------------------------------------------- 座位

async function saveLayout(event, openid) {
  const { id } = await loadClass(event.classId, openid, 'owner');
  const seats = validateSeats(event.seats);
  const fitted = fitToLayout(await loadArrangement(id), seats);
  await classSeats.doc(id).set({ data: { seats } });
  const arrangement = fitted || [];
  await saveArrangement(id, arrangement);
  return { seats, arrangement, cleared: fitted === null };
}

async function arrangeClass(id, cls, mode, by) {
  const settings = settingsOf(cls);
  const [{ students }, seats, current] = await Promise.all([loadStudents(id), loadSeats(id), loadArrangement(id)]);
  if (!seats.length) fail('还没有设置教室布局');
  const result = arrange(students, seats, { mode, current, separate: cleanPairs(settings.separate, students) });
  result.arrangedAt = await saveArrangement(id, result.arrangement, by);
  return result;
}

async function arrangeSeats(event, openid) {
  const { id, cls } = await loadClass(event.classId, openid, 'owner');
  const settings = settingsOf(cls);
  const mode = MODES[event.mode] ? event.mode : settings.mode;
  const result = await arrangeClass(id, cls, mode, 'manual');
  if (mode !== settings.mode) {
    await classes.doc(id).update({ data: { settings: _.set(Object.assign(settings, { mode })) } });
  }
  return { arrangement: result.arrangement, unresolved: result.unresolved, mode, arrangedAt: result.arrangedAt };
}

async function swapSeats(event, openid) {
  const { id } = await loadClass(event.classId, openid, 'owner');
  const [arrangement, seats] = await Promise.all([loadArrangement(id), loadSeats(id)]);
  if (!matchesLayout(arrangement, seats)) fail('座位表和教室布局对不上，请先重新排座');
  const [r1, c1] = validatePosition(arrangement, event.a);
  const [r2, c2] = validatePosition(arrangement, event.b);
  const t = arrangement[r1][c1];
  arrangement[r1][c1] = arrangement[r2][c2];
  arrangement[r2][c2] = t;
  await saveArrangement(id, arrangement);
  return { arrangement };
}

async function setSeatName(event, openid) {
  const { id } = await loadClass(event.classId, openid, 'owner');
  const [stored, seats] = await Promise.all([loadArrangement(id), loadSeats(id)]);
  // 还没排过座时，从空座位表开始手动填写
  const arrangement = stored.length ? stored : seats.map((row) => row.map((desk) => (desk ? '' : null)));
  if (!matchesLayout(arrangement, seats)) fail('座位表和教室布局对不上，请先重新排座');
  const [r, c] = validatePosition(arrangement, [event.row, event.col]);
  const name = roster.cleanName(event.name);
  arrangement[r][c] = name;
  await saveArrangement(id, arrangement);
  return { arrangement };
}

// ---------------------------------------------------------------- 定时任务

/** 每周一为开启“每周自动重排”的班级重新排座（按班级当前选择的排座方式） */
async function autoArrangeAll() {
  const batch = 100;
  let done = 0;
  let skipped = 0;
  for (let offset = 0; ; offset += batch) {
    const { data } = await classes.where({ 'settings.autoWeekly': true }).skip(offset).limit(batch).get();
    await Promise.all(
      data.map((cls) =>
        arrangeClass(cls._id, cls, settingsOf(cls).mode, 'auto').then(
          () => done++,
          (e) => {
            skipped++;
            console.warn('自动重排跳过', cls._id, e.message);
          }
        )
      )
    );
    if (data.length < batch) break;
  }
  console.log(`自动重排完成：${done} 个班级，跳过 ${skipped} 个`);
  return { done, skipped };
}

const ACTIONS = {
  listClasses,
  createClass,
  joinClass,
  quitClass,
  deleteClass,
  getClass,
  updateClass,
  addStudents,
  deleteStudent,
  saveLayout,
  arrange: arrangeSeats,
  swapSeats,
  setSeatName,
};

exports.main = async (event) => {
  const { OPENID, SOURCE } = cloud.getWXContext();
  if (!OPENID && (SOURCE === 'wx_trigger' || event.Type === 'Timer' || event.TriggerName)) {
    return autoArrangeAll();
  }
  try {
    if (!OPENID) fail('请在小程序中使用');
    if (!Object.prototype.hasOwnProperty.call(ACTIONS, event.action)) fail('小程序版本太旧，请删除后重新打开小程序');
    return { ok: true, data: await ACTIONS[event.action](event, OPENID) };
  } catch (e) {
    if (e.expose) return { ok: false, msg: e.message };
    console.error(event.action, e);
    return { ok: false, msg: '服务器开小差了，请稍后再试' };
  }
};
