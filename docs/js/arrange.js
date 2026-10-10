/**
 * 易位 eaSEAT 排座算法（纯函数，不依赖数据库，可在云函数、网页演示和测试中共用）
 *
 * 教室布局 seats：二维布尔数组，seats[r][c] 为 true 表示这里有课桌。第 0 行离讲台最近。
 * 座位表 arrangement：与 seats 形状相同；null 表示没有课桌，'' 表示空课桌，其余为学生姓名。
 * 学生 student：{ id, name, height }，height 单位厘米，可以为空。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EaseatArrange = factory();
})(this, function () {
  const MODES = {
    height: '按身高',
    random: '完全随机',
    rotate: '大组轮换',
  };

  function isMode(mode) {
    return typeof mode === 'string' && Object.prototype.hasOwnProperty.call(MODES, mode);
  }

  /** 排座失败时抛出，message 可以直接展示给老师 */
  class ArrangeError extends Error {
    constructor(message) {
      super(message);
      this.name = 'ArrangeError';
      this.expose = true;
    }
  }

  function shuffle(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function isStudent(cell) {
    return cell !== null && typeof cell === 'object';
  }

  function hasHeight(s) {
    return typeof s.height === 'number' && isFinite(s.height) && s.height > 0;
  }

  /** 所有课桌的位置，按从前到后、从左到右排列 */
  function deskPositions(seats) {
    const out = [];
    seats.forEach((row, r) =>
      row.forEach((desk, c) => {
        if (desk) out.push([r, c]);
      })
    );
    return out;
  }

  function countDesks(seats) {
    return deskPositions(seats).length;
  }

  /**
   * 把课桌按“大组”分开：整列都没有课桌的列视为过道。
   * 返回每个大组包含的列号，例如 [[0, 1], [3, 4, 5], [7, 8]]。
   */
  function columnGroups(seats) {
    const cols = Math.max(0, ...seats.map((row) => row.length));
    const groups = [];
    let current = [];
    for (let c = 0; c < cols; c++) {
      if (seats.some((row) => row[c])) current.push(c);
      else if (current.length) {
        groups.push(current);
        current = [];
      }
    }
    if (current.length) groups.push(current);
    return groups;
  }

  function emptyGrid(seats) {
    return seats.map((row) => row.map((desk) => (desk ? '' : null)));
  }

  /** 按身高从矮到高排序；身高加入少量随机扰动，让身高相近的同学每次排的位置不同 */
  function heightOrder(students, rand, jitter) {
    const measured = students
      .filter(hasHeight)
      .map((s) => ({ s, key: s.height + (rand() * 2 - 1) * jitter }))
      .sort((a, b) => a.key - b.key)
      .map((x) => x.s);
    // 没填身高的同学随机插入队伍中
    for (const s of shuffle(students.filter((s) => !hasHeight(s)), rand)) {
      measured.splice(Math.floor(rand() * (measured.length + 1)), 0, s);
    }
    return measured;
  }

  /** 按顺序从前排往后排坐满，同一排内随机安排左右位置 */
  function fillByRows(order, seats, rand) {
    const grid = emptyGrid(seats);
    let k = 0;
    seats.forEach((row, r) => {
      const cols = [];
      row.forEach((desk, c) => desk && cols.push(c));
      const group = order.slice(k, k + cols.length);
      k += group.length;
      const spots = shuffle(cols, rand);
      group.forEach((s, i) => {
        grid[r][spots[i]] = s;
      });
    });
    return grid;
  }

  /** 检查旧座位表是否和当前教室布局对得上 */
  function matchesLayout(arrangement, seats) {
    if (!Array.isArray(arrangement) || arrangement.length !== seats.length) return false;
    return seats.every(
      (row, r) =>
        Array.isArray(arrangement[r]) &&
        arrangement[r].length === row.length &&
        row.every((desk, c) => (arrangement[r][c] === null) === !desk)
    );
  }

  /**
   * 把座位表中的姓名换回学生对象。名单里找不到的姓名（老师手动填写的）保留为只有姓名的临时对象。
   * 返回 { grid, missing }，missing 是名单里有、座位表里没有的学生。
   */
  function gridFromNames(arrangement, seats, students) {
    const byName = new Map();
    for (const s of students) {
      if (!byName.has(s.name)) byName.set(s.name, []);
      byName.get(s.name).push(s);
    }
    const grid = seats.map((row, r) =>
      row.map((desk, c) => {
        if (!desk) return null;
        const v = arrangement[r][c];
        const name = typeof v === 'string' ? v.trim() : '';
        if (!name) return '';
        const list = byName.get(name);
        return list && list.length ? list.shift() : { id: null, name };
      })
    );
    const missing = [];
    for (const list of byName.values()) missing.push(...list);
    return { grid, missing };
  }

  /** 把学生放进空课桌：先放在 preferRow 那一排，再放离它最近的排 */
  function placeInEmptyDesks(grid, people, preferRow) {
    for (const person of people) {
      const spots = [];
      grid.forEach((row, r) =>
        row.forEach((cell, c) => {
          if (cell === '') spots.push([r, c]);
        })
      );
      if (!spots.length) return false;
      const target = preferRow === undefined ? spots[0] : spots.sort((a, b) => Math.abs(a[0] - preferRow) - Math.abs(b[0] - preferRow))[0];
      grid[target[0]][target[1]] = person;
    }
    return true;
  }

  /** 大组轮换：每个大组整体向右移一组，最右边的大组移到最左边，前后排和同桌都不变 */
  function rotateGrid(current, seats, students) {
    if (!matchesLayout(current, seats)) {
      throw new ArrangeError('教室布局修改过或还没有排过座位，无法轮换。请先用“按身高”或“完全随机”排一次。');
    }
    const groups = columnGroups(seats);
    if (groups.length < 2) {
      throw new ArrangeError('教室里只有一个大组，无法轮换。请在“教室布局”里留出整列空白作为过道。');
    }
    const { grid: old, missing } = gridFromNames(current, seats, students);
    const grid = emptyGrid(seats);
    const overflow = [];

    seats.forEach((row, r) => {
      groups.forEach((cols, g) => {
        const from = cols.filter((c) => row[c]);
        const to = groups[(g + 1) % groups.length].filter((c) => row[c]);
        if (from.length === to.length) {
          // 课桌数一样：原样平移，空位也跟着移动
          from.forEach((c, i) => {
            grid[r][to[i]] = old[r][c];
          });
          return;
        }
        const people = from.map((c) => old[r][c]).filter(isStudent);
        to.forEach((c, i) => {
          if (i < people.length) grid[r][c] = people[i];
        });
        for (let i = to.length; i < people.length; i++) overflow.push({ person: people[i], row: r });
      });
    });

    const seated =
      overflow.every(({ person, row }) => placeInEmptyDesks(grid, [person], row)) &&
      // 上次排座后新加入名单的同学，从前往后找空位
      placeInEmptyDesks(grid, missing);
    if (!seated) throw new ArrangeError('座位不够，无法轮换。请在“教室布局”里增加课桌，或在座位表里清空多余的姓名。');
    return grid;
  }

  function neighbours(seats, r, c) {
    return [
      [r, c - 1],
      [r, c + 1],
      [r - 1, c],
      [r + 1, c],
    ].filter(([nr, nc]) => seats[nr] && seats[nr][nc]);
  }

  /**
   * 不相邻名单：让指定的两个同学既不做同桌，也不坐前后桌。
   * 冲突时优先和同一排的同学交换（不打乱身高顺序），再考虑相邻的排。
   * 返回仍无法分开的组数（座位太挤时可能无解）。
   */
  function separatePairs(grid, seats, pairs, rand) {
    const banned = new Map();
    const ban = (a, b) => {
      if (!banned.has(a)) banned.set(a, new Set());
      banned.get(a).add(b);
    };
    for (const pair of pairs || []) {
      if (!Array.isArray(pair) || pair.length !== 2) continue;
      const [a, b] = pair;
      if (a === null || a === undefined || b === null || b === undefined || a === b) continue;
      ban(a, b);
      ban(b, a);
    }
    if (!banned.size) return 0;

    const conflictsAt = (r, c) => {
      const who = grid[r][c];
      if (!isStudent(who) || !banned.has(who.id)) return [];
      const avoid = banned.get(who.id);
      return neighbours(seats, r, c).filter(([nr, nc]) => isStudent(grid[nr][nc]) && avoid.has(grid[nr][nc].id));
    };
    const desks = deskPositions(seats);
    const swap = (a, b) => {
      const t = grid[a[0]][a[1]];
      grid[a[0]][a[1]] = grid[b[0]][b[1]];
      grid[b[0]][b[1]] = t;
    };

    for (let round = 0; round < desks.length * 4; round++) {
      const bad = desks.filter(([r, c]) => conflictsAt(r, c).length);
      if (!bad.length) return 0;
      const from = bad[Math.floor(rand() * bad.length)];
      // 打乱后按排的距离稳定排序：同一排的候选在前，排内顺序随机
      const candidates = shuffle(
        desks.filter(([r, c]) => r !== from[0] || c !== from[1]),
        rand
      ).sort((a, b) => Math.abs(a[0] - from[0]) - Math.abs(b[0] - from[0]));
      let moved = false;
      for (const to of candidates) {
        swap(from, to);
        if (!conflictsAt(from[0], from[1]).length && !conflictsAt(to[0], to[1]).length) {
          moved = true;
          break;
        }
        swap(from, to);
      }
      if (!moved) break;
    }

    // 冲突是双向的，每组会被数两次
    return desks.reduce((n, [r, c]) => n + conflictsAt(r, c).length, 0) / 2;
  }

  function toNames(grid) {
    return grid.map((row) => row.map((cell) => (isStudent(cell) ? cell.name : cell)));
  }

  /** 清理学生名单：去掉旧版本删除学生后留下的 null，修正身高格式 */
  function cleanStudents(students) {
    return (students || [])
      .filter((s) => s && typeof s.name === 'string' && s.name.trim())
      .map((s) => ({ ...s, name: s.name.trim(), height: hasHeight(s) ? s.height : null }));
  }

  /**
   * 排座位。
   * options.mode: 'height' | 'random' | 'rotate'
   * options.current: 当前座位表（大组轮换时需要）
   * options.separate: 不相邻名单，例如 [[学生id, 学生id], ...]
   * options.jitter: 按身高排时的随机扰动（厘米），默认 3
   * options.random: 随机数函数，测试时可以传入固定种子的版本
   * 返回 { arrangement, unresolved }
   */
  function arrange(students, seats, options) {
    options = options || {};
    const rand = options.random || Math.random;
    const mode = options.mode || 'height';
    if (!isMode(mode)) throw new ArrangeError('未知的排座方式');
    const list = cleanStudents(students);
    const desks = countDesks(seats);
    if (!list.length) throw new ArrangeError('名单里还没有学生，请先添加学生。');
    if (list.length > desks) {
      throw new ArrangeError(`座位不够：有 ${list.length} 名学生，但只有 ${desks} 张课桌。请在“教室布局”里增加课桌。`);
    }

    let grid;
    if (mode === 'rotate') {
      grid = rotateGrid(options.current, seats, list);
    } else {
      const order = mode === 'random' ? shuffle(list.slice(), rand) : heightOrder(list, rand, options.jitter === undefined ? 3 : options.jitter);
      grid = fillByRows(order, seats, rand);
    }
    const unresolved = separatePairs(grid, seats, options.separate, rand);
    return { arrangement: toNames(grid), unresolved };
  }

  /**
   * 修改教室布局后尽量保留原来的座位：仍是课桌的位置保持不动，被撤掉课桌的同学挪到最近的空位。
   * 空位不够时返回 null，需要重新排座。
   */
  function fitToLayout(arrangement, seats) {
    if (!Array.isArray(arrangement) || !arrangement.length) return [];
    const grid = emptyGrid(seats);
    const displaced = [];
    arrangement.forEach((row, r) =>
      (row || []).forEach((name, c) => {
        if (typeof name !== 'string' || !name) return;
        if (seats[r] && seats[r][c]) grid[r][c] = name;
        else displaced.push({ name, row: r });
      })
    );
    for (const { name, row } of displaced) {
      if (!placeInEmptyDesks(grid, [{ id: null, name }], row)) return null;
    }
    return toNames(grid);
  }

  return {
    MODES,
    isMode,
    ArrangeError,
    arrange,
    fitToLayout,
    columnGroups,
    countDesks,
    matchesLayout,
    cleanStudents,
  };
});
