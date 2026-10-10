// 此文件由 scripts/sync.js 从仓库根目录的 core/ 复制而来，请修改 core/ 中的原文件。
/**
 * 易位 eaSEAT 的全部业务逻辑：班级、名单、布局、排座、备份。
 *
 * 同一份代码在三个地方运行：
 * - 云函数（云端模式）：db 为 cloud.database()，openid 为微信 / QQ 用户；
 * - 小程序本机模式：db 为 local-db（数据存在手机上），openid 固定；
 * - 网页版：db 为 local-db（数据存在浏览器里）。
 *
 * createService(options) 返回 { call(action, data, openid), autoArrangeAll() }，
 * call 返回 { ok: true, data } 或 { ok: false, msg }。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./arrange'), require('./roster'));
  else root.EaseatService = factory(root.EaseatArrange, root.EaseatRoster);
})(this, function (A, roster) {
  const { arrange, fitToLayout, cleanStudents, matchesLayout, isMode } = A;

  const MAX_CLASSES_PER_USER = 50;
  const MAX_STUDENTS = 150;
  const MAX_ROWS = 20;
  const MAX_COLS = 20;
  const MAX_PAIRS = 100;
  const AUTO_CONCURRENCY = 10;
  const ID_CHARS = '23456789abcdefghjkmnpqrstuvwxyz';
  const BACKUP_APP = 'easeat';
  const BACKUP_VERSION = 1;

  // 6 排，每排 4 个大组、每组 2 张课桌
  const DEFAULT_SEATS = Array.from({ length: 6 }, () => [true, true, false, true, true, false, true, true, false, true, true]);
  const DEFAULT_SETTINGS = { mode: 'height', autoWeekly: false, separate: [] };

  /** 抛出一个可以直接显示给用户的错误 */
  function fail(msg) {
    const e = new Error(msg);
    e.expose = true;
    throw e;
  }

  function mathRandomBytes(n) {
    return Array.from({ length: n }, () => Math.floor(Math.random() * 256));
  }

  /** 本周一早上 6:00（当地时间）；还没到周一 6:00 时取上一周 */
  function weekStart(ts) {
    const d = new Date(ts);
    const sinceMonday = (d.getDay() + 6) % 7;
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - sinceMonday, 6, 0, 0, 0);
    if (monday.getTime() > ts) monday.setDate(monday.getDate() - 7);
    return monday.getTime();
  }

  function membersOf(doc) {
    const m = doc && doc.members;
    if (Array.isArray(m)) return m.filter((x) => typeof x === 'string');
    return typeof m === 'string' ? [m] : [];
  }

  function settingsOf(cls) {
    const s = Object.assign({}, DEFAULT_SETTINGS, cls && cls.settings);
    return {
      mode: isMode(s.mode) ? s.mode : 'height',
      autoWeekly: s.autoWeekly === true,
      separate: Array.isArray(s.separate) ? s.separate : [],
    };
  }

  /**
   * 旧版本导入 Excel 后没有更新 studentIdTop，名单里可能有重复的学生编号。
   * 按名单顺序给重复的编号重新分配（结果是确定的，每次读取都一样），下次保存名单时写回数据库。
   */
  function uniqueIds(students) {
    const valid = (id) => typeof id === 'number' && isFinite(id);
    let next = students.reduce((max, s) => (valid(s.id) ? Math.max(max, s.id + 1) : max), 1);
    const seen = new Set();
    return students.map((s) => {
      if (valid(s.id) && !seen.has(s.id)) {
        seen.add(s.id);
        return s;
      }
      return Object.assign({}, s, { id: next++ });
    });
  }

  /** 座位表中的姓名去掉首尾空格（旧版本导入的姓名可能带空格） */
  function cleanArrangement(arrangement) {
    if (!Array.isArray(arrangement)) return [];
    return arrangement.map((row) =>
      (Array.isArray(row) ? row : []).map((v) => (v === null || v === undefined ? null : typeof v === 'string' ? v.trim() : String(v)))
    );
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

  /**
   * options.db           云数据库或 local-db
   * options.randomBytes  (n) => 字节数组，用来生成班级 ID（云函数里用 crypto）
   * options.now          () => 时间戳
   * options.autoOnOpen   true 时（本机模式、网页版），打开班级时补上本周的“每周自动重排”
   * options.internalError 意外错误时显示给用户的提示
   */
  function createService(options) {
    const db = options.db;
    const _ = db.command;
    const now = options.now || (() => Date.now());
    const randomBytes = options.randomBytes || mathRandomBytes;
    const internalError = options.internalError || '服务器开小差了，请稍后再试';

    const classes = db.collection('class');
    const classStudents = db.collection('classStudent');
    const classUsers = db.collection('classUser');
    const classSeats = db.collection('classSeat');
    const classArrangements = db.collection('classArrangement');

    async function getDoc(collection, id) {
      try {
        return (await collection.doc(id).get()).data;
      } catch (e) {
        if (/not exist|不存在/.test(String(e.errMsg || e.message))) return null;
        throw e;
      }
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
      const students = uniqueIds(cleanStudents(doc && doc.students));
      const top = students.reduce((max, s) => Math.max(max, s.id + 1), (doc && doc.studentIdTop) || 1);
      return { students, top };
    }

    async function loadArrangement(id) {
      const doc = await getDoc(classArrangements, id);
      return cleanArrangement(doc && doc.arrangement);
    }

    async function loadSeats(id) {
      const doc = await getDoc(classSeats, id);
      return (doc && Array.isArray(doc.seats) && doc.seats) || [];
    }

    /** 保存座位表。by 为 'manual' 或 'auto' 时表示重新排了座，同时记录排座时间 */
    async function saveArrangement(id, arrangement, by) {
      if (by) {
        const arrangedAt = now();
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

    async function newClassId() {
      for (let attempt = 0; attempt < 8; attempt++) {
        const id = Array.from(randomBytes(6), (b) => ID_CHARS[b % ID_CHARS.length]).join('');
        if (!(await getDoc(classes, id))) return id;
      }
      fail('创建失败，请重试');
    }

    async function checkClassLimit(openid, adding) {
      const { total } = await classes.where({ owner: openid }).count();
      if (total + adding > MAX_CLASSES_PER_USER) fail(`每人最多创建 ${MAX_CLASSES_PER_USER} 个班级，请先删除不用的班级`);
    }

    /** 新建班级的五条记录 */
    async function insertClass(openid, fields) {
      const id = await newClassId();
      await classes.add({
        data: { _id: id, owner: openid, name: fields.name, createdAt: fields.createdAt || now(), settings: fields.settings || DEFAULT_SETTINGS },
      });
      const students = fields.students || [];
      await Promise.all([
        classStudents.add({ data: { _id: id, studentIdTop: students.reduce((max, s) => Math.max(max, s.id + 1), 1), students } }),
        classUsers.add({ data: { _id: id, members: [] } }),
        classSeats.add({ data: { _id: id, seats: fields.seats || DEFAULT_SEATS } }),
        classArrangements.add({
          data: Object.assign(
            { _id: id, arrangement: fields.arrangement || [] },
            fields.arrangedAt ? { arrangedAt: fields.arrangedAt, arrangedBy: fields.arrangedBy || 'manual' } : {}
          ),
        }),
      ]);
      return id;
    }

    // -------------------------------------------------------------- 班级

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
      await checkClassLimit(openid, 1);
      const id = await insertClass(openid, { name });
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
      const settings = settingsOf(cls);
      let arrDoc = await getDoc(classArrangements, id);

      // 本机模式没有定时任务：本周第一次打开时补上“每周自动重排”
      let autoArranged = false;
      if (owned && options.autoOnOpen && settings.autoWeekly && arrDoc && arrDoc.arrangedAt && arrDoc.arrangedAt < weekStart(now())) {
        try {
          await arrangeClass(id, cls, settings.mode, 'auto');
          arrDoc = await getDoc(classArrangements, id);
          autoArranged = true;
        } catch (e) {
          if (!e.expose) throw e;
        }
      }

      const [seats, roll, users] = await Promise.all([loadSeats(id), owned ? loadStudents(id) : null, owned ? getDoc(classUsers, id) : null]);
      return {
        id,
        name: cls.name || '未命名班级',
        owned,
        seats,
        arrangement: cleanArrangement(arrDoc && arrDoc.arrangement),
        arrangedAt: (arrDoc && arrDoc.arrangedAt) || null,
        arrangedBy: (arrDoc && arrDoc.arrangedBy) || null,
        autoArranged,
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
      const changes = event.settings && typeof event.settings === 'object' ? event.settings : null;
      if (changes) {
        const next = settingsOf(cls);
        // 只更新这次修改的字段，避免几乎同时的两次修改互相覆盖
        if ('mode' in changes) {
          if (!isMode(changes.mode)) fail('未知的排座方式');
          next.mode = data['settings.mode'] = changes.mode;
        }
        if ('autoWeekly' in changes) next.autoWeekly = data['settings.autoWeekly'] = changes.autoWeekly === true;
        if ('separate' in changes) {
          next.separate = cleanPairs(changes.separate, (await loadStudents(id)).students);
          data['settings.separate'] = _.set(next.separate);
        }
        result.settings = next;
      }
      if (Object.keys(data).length) await classes.doc(id).update({ data });
      return result;
    }

    // -------------------------------------------------------------- 学生名单

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
     * rows: 表格的行（Excel 文件在手机或浏览器上读取）
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
        tasks.push(classes.doc(id).update({ data: { 'settings.separate': _.set(pairs) } }));
      }
      await Promise.all(tasks);
      return { students: rest, arrangement, settings };
    }

    // -------------------------------------------------------------- 座位

    async function saveLayout(event, openid) {
      const { id } = await loadClass(event.classId, openid, 'owner');
      const seats = validateSeats(event.seats);
      const current = await loadArrangement(id);
      const fitted = fitToLayout(current, seats);
      await classSeats.doc(id).set({ data: { seats } });
      // 放不下原来的座位表时保留它：改回原来的布局就能恢复，重新排座时会被替换
      if (fitted) await saveArrangement(id, fitted);
      return { seats, arrangement: fitted || current, fits: fitted !== null };
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
      const mode = isMode(event.mode) ? event.mode : settings.mode;
      const result = await arrangeClass(id, cls, mode, 'manual');
      if (mode !== settings.mode) await classes.doc(id).update({ data: { 'settings.mode': mode } });
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
      arrangement[r][c] = roster.cleanName(event.name);
      await saveArrangement(id, arrangement);
      return { arrangement };
    }

    // -------------------------------------------------------------- 备份

    /** 导出自己创建的所有班级（不含加入的班级和成员） */
    async function exportData(event, openid) {
      const own = (await classes.where({ owner: openid }).limit(100).get()).data;
      const list = await Promise.all(
        own.map(async (cls) => {
          const [{ students }, seats, arrDoc] = await Promise.all([loadStudents(cls._id), loadSeats(cls._id), getDoc(classArrangements, cls._id)]);
          const settings = settingsOf(cls);
          return {
            // id 只用于显示，导入备份时会分配新的 ID
            id: cls._id,
            name: cls.name || '未命名班级',
            createdAt: cls.createdAt || null,
            settings: Object.assign(settings, { separate: cleanPairs(settings.separate, students) }),
            students,
            seats,
            arrangement: cleanArrangement(arrDoc && arrDoc.arrangement),
            arrangedAt: (arrDoc && arrDoc.arrangedAt) || null,
            arrangedBy: (arrDoc && arrDoc.arrangedBy) || null,
          };
        })
      );
      list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now(), classes: list };
    }

    /** 从备份恢复：备份里的每个班级都作为新班级添加 */
    async function importData(event, openid) {
      const backup = event.backup;
      if (!backup || backup.app !== BACKUP_APP || !Array.isArray(backup.classes)) fail('这不是易位的备份文件');
      if (backup.version > BACKUP_VERSION) fail('备份文件来自更新的版本，请先更新易位');
      if (!backup.classes.length) fail('备份里没有班级');
      await checkClassLimit(openid, backup.classes.length);
      const imported = [];
      for (const item of backup.classes) {
        if (!item || typeof item !== 'object') continue;
        const name = roster.cleanName(item.name) || '未命名班级';
        const students = uniqueIds(cleanStudents(Array.isArray(item.students) ? item.students : [])).slice(0, MAX_STUDENTS);
        let seats;
        try {
          seats = validateSeats(item.seats);
        } catch (e) {
          seats = DEFAULT_SEATS;
        }
        const stored = cleanArrangement(item.arrangement);
        const arrangement = matchesLayout(stored, seats) ? stored : fitToLayout(stored, seats) || [];
        const settings = settingsOf({ settings: item.settings });
        settings.separate = cleanPairs(settings.separate, students);
        const id = await insertClass(openid, {
          name,
          createdAt: typeof item.createdAt === 'number' ? item.createdAt : now(),
          settings,
          students,
          seats,
          arrangement,
          arrangedAt: arrangement.length && typeof item.arrangedAt === 'number' ? item.arrangedAt : null,
          arrangedBy: item.arrangedBy === 'auto' ? 'auto' : 'manual',
        });
        imported.push({ id, name });
      }
      return { imported };
    }

    // -------------------------------------------------------------- 定时任务

    /** 每周一为开启“每周自动重排”的班级重新排座（按班级当前选择的排座方式） */
    async function autoArrangeAll() {
      const batch = 100;
      let done = 0;
      let skipped = 0;
      for (let offset = 0; ; offset += batch) {
        const { data } = await classes.where({ 'settings.autoWeekly': true }).orderBy('_id', 'asc').skip(offset).limit(batch).get();
        // 每次同时处理少量班级，避免数据库并发过高
        for (let i = 0; i < data.length; i += AUTO_CONCURRENCY) {
          await Promise.all(
            data.slice(i, i + AUTO_CONCURRENCY).map((cls) =>
              arrangeClass(cls._id, cls, settingsOf(cls).mode, 'auto').then(
                () => done++,
                (e) => {
                  skipped++;
                  console.warn('自动重排跳过', cls._id, e.message);
                }
              )
            )
          );
        }
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
      exportData,
      importData,
    };

    async function call(action, event, openid) {
      try {
        if (!openid) fail('请在小程序中使用');
        if (!Object.prototype.hasOwnProperty.call(ACTIONS, action)) fail('版本太旧，请重新打开后再试');
        return { ok: true, data: await ACTIONS[action](event || {}, openid) };
      } catch (e) {
        if (e.expose) return { ok: false, msg: e.message };
        console.error(action, e);
        return { ok: false, msg: internalError };
      }
    }

    return { call, autoArrangeAll };
  }

  return { createService, weekStart, BACKUP_APP, BACKUP_VERSION };
});
