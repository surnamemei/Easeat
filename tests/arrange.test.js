const test = require('node:test');
const assert = require('node:assert/strict');
const { arrange, fitToLayout, columnGroups, matchesLayout, ArrangeError } = require('../core/arrange');

/** 固定种子的随机数，保证测试结果可重复 */
function seeded(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROW = [true, true, false, true, true, false, true, true];
const layout = (rows, row = ROW) => Array.from({ length: rows }, () => row.slice());

function makeStudents(n, withHeight = true) {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `学生${i + 1}`, height: withHeight ? 140 + i : null }));
}

function seated(arrangement) {
  return arrangement.flat().filter((x) => typeof x === 'string' && x);
}

function positionsOf(arrangement) {
  const pos = new Map();
  arrangement.forEach((row, r) => row.forEach((name, c) => name && pos.set(name, [r, c])));
  return pos;
}

test('every student gets exactly one desk and aisles stay empty', () => {
  const seats = layout(5);
  const students = makeStudents(27);
  for (const mode of ['height', 'random']) {
    const { arrangement, unresolved } = arrange(students, seats, { mode, random: seeded(1) });
    assert.equal(unresolved, 0);
    assert.deepEqual(seated(arrangement).sort(), students.map((s) => s.name).sort());
    arrangement.forEach((row, r) =>
      row.forEach((cell, c) => {
        if (!seats[r][c]) assert.equal(cell, null);
        else assert.equal(typeof cell, 'string');
      })
    );
  }
});

test('height mode puts shorter students in front rows', () => {
  const seats = layout(4);
  const students = makeStudents(24).reverse();
  const { arrangement } = arrange(students, seats, { mode: 'height', jitter: 0, random: seeded(7) });
  const heightOf = new Map(students.map((s) => [s.name, s.height]));
  for (let r = 0; r + 1 < arrangement.length; r++) {
    const maxFront = Math.max(...seated([arrangement[r]]).map((n) => heightOf.get(n)));
    const minBack = Math.min(...seated([arrangement[r + 1]]).map((n) => heightOf.get(n)));
    assert.ok(maxFront <= minBack, `row ${r} should be shorter than row ${r + 1}`);
  }
});

test('height mode still varies the seats between runs', () => {
  const seats = layout(4);
  const students = makeStudents(24);
  const a = arrange(students, seats, { random: seeded(1) }).arrangement;
  const b = arrange(students, seats, { random: seeded(2) }).arrangement;
  assert.notDeepEqual(a, b);
});

test('students without height and legacy null entries are handled', () => {
  const seats = layout(3);
  const students = [null, ...makeStudents(10), { id: 99, name: '没身高', height: NaN }, { id: 100, name: '  ' }];
  const { arrangement } = arrange(students, seats, { random: seeded(3) });
  assert.equal(seated(arrangement).length, 11);
  assert.ok(seated(arrangement).includes('没身高'));
});

test('errors are friendly when there are too many students or none', () => {
  assert.throws(() => arrange(makeStudents(30), layout(2)), (e) => e instanceof ArrangeError && /座位不够/.test(e.message));
  assert.throws(() => arrange([], layout(2)), /还没有学生/);
  assert.throws(() => arrange(makeStudents(3), layout(2), { mode: 'nope' }), /未知的排座方式/);
});

test('separate pairs are never deskmates or front/back neighbours', () => {
  const seats = layout(5);
  const students = makeStudents(30);
  const separate = [
    [1, 2],
    [3, 4],
    [5, 6],
    [1, 3],
    [10, 11],
    [20, 21],
  ];
  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  for (let seed = 1; seed <= 200; seed++) {
    for (const mode of ['height', 'random']) {
      const { arrangement, unresolved } = arrange(students, seats, { mode, separate, random: seeded(seed) });
      assert.equal(unresolved, 0);
      const pos = positionsOf(arrangement);
      for (const [a, b] of separate) {
        const [r1, c1] = pos.get(nameOf.get(a));
        const [r2, c2] = pos.get(nameOf.get(b));
        const adjacent = Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
        assert.ok(!adjacent, `seed ${seed} ${mode}: ${a} and ${b} are neighbours`);
      }
    }
  }
});

test('impossible separate pairs are reported instead of looping forever', () => {
  const { unresolved } = arrange(makeStudents(2), [[true, true]], { separate: [[1, 2]], random: seeded(1) });
  assert.equal(unresolved, 1);
});

test('column groups are split by empty aisle columns', () => {
  assert.deepEqual(columnGroups(layout(2)), [
    [0, 1],
    [3, 4],
    [6, 7],
  ]);
  assert.deepEqual(columnGroups([[false, true, true, false]]), [[1, 2]]);
});

test('rotate moves every group one step to the right and keeps deskmates together', () => {
  const seats = layout(2);
  const current = [
    ['A', 'B', null, 'C', 'D', null, 'E', ''],
    ['F', 'G', null, 'H', 'I', null, 'J', 'K'],
  ];
  const students = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].map((name, i) => ({ id: i + 1, name }));
  const { arrangement } = arrange(students, seats, { mode: 'rotate', current });
  assert.deepEqual(arrangement, [
    ['E', '', null, 'A', 'B', null, 'C', 'D'],
    ['J', 'K', null, 'F', 'G', null, 'H', 'I'],
  ]);
});

test('rotate seats newly added students and keeps manually typed names', () => {
  const seats = layout(1);
  const current = [['A', 'B', null, '老师', '', null, '', '']];
  const students = [
    { id: 1, name: 'A' },
    { id: 2, name: 'B' },
    { id: 3, name: '新同学' },
  ];
  const { arrangement } = arrange(students, seats, { mode: 'rotate', current });
  assert.deepEqual(arrangement[0].slice(3, 5), ['A', 'B']);
  assert.deepEqual(arrangement[0].slice(6, 8), ['老师', '']);
  assert.equal(arrangement[0][0], '新同学');
});

test('rotate handles groups with different numbers of desks', () => {
  const seats = [[true, true, true, false, true, true]];
  const current = [['A', 'B', 'C', null, 'D', 'E']];
  const students = ['A', 'B', 'C', 'D', 'E'].map((name, i) => ({ id: i, name }));
  const { arrangement } = arrange(students, seats, { mode: 'rotate', current });
  assert.deepEqual(seated(arrangement).sort(), ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(arrangement[0].slice(0, 2), ['D', 'E']);
  assert.deepEqual(arrangement[0].slice(4, 6), ['A', 'B']);
});

test('rotate refuses when the layout changed or there is only one group', () => {
  const students = makeStudents(2);
  assert.throws(() => arrange(students, layout(1), { mode: 'rotate', current: [] }), /无法轮换/);
  assert.throws(() => arrange(students, [[true, true]], { mode: 'rotate', current: [['学生1', '学生2']] }), /只有一个大组/);
});

test('fitToLayout keeps students in place and moves displaced ones nearby', () => {
  const old = [
    ['A', 'B', null],
    ['C', 'D', null],
  ];
  const seats = [
    [true, false, true],
    [true, true, true],
  ];
  const next = fitToLayout(old, seats);
  assert.ok(matchesLayout(next, seats));
  assert.equal(next[0][0], 'A');
  assert.equal(next[0][2], 'B');
  assert.deepEqual(next[1].slice(0, 2), ['C', 'D']);
  assert.equal(fitToLayout(old, [[true, false, false]]), null);
  assert.deepEqual(fitToLayout([], seats), []);
});
