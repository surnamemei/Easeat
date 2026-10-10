const test = require('node:test');
const assert = require('node:assert/strict');
const { parseText, parseRows, parseHeight, normalize } = require('../core/roster');

test('pasted text: tabs from Excel, commas, spaces and header rows', () => {
  const text = ['姓名\t身高', '张三\t165', '李四,158cm', '王 五 1.72', 'Tom Lee 170', '', '赵六'].join('\n');
  assert.deepEqual(parseText(text), [
    { name: '张三', height: 165 },
    { name: '李四', height: 158 },
    { name: '王 五', height: 172 },
    { name: 'Tom Lee', height: 170 },
    { name: '赵六', height: null },
  ]);
});

test('Excel rows: blank first row, numbering column, numeric heights', () => {
  const rows = [[], ['序号', '姓名', '身高'], [1, '张三', 160], [2, '李四', '1.6'], ['', ''], [3, '王五']];
  assert.deepEqual(parseRows(rows), [
    { name: '张三', height: 160 },
    { name: '李四', height: 160 },
    { name: '王五', height: null },
  ]);
});

test('title rows such as “高一（3）班学生名单” are skipped', () => {
  assert.deepEqual(parseRows([['高一（3）班学生名单'], ['姓名', '身高'], ['张三', 160]]), [{ name: '张三', height: 160 }]);
});

test('heights outside a sensible range are ignored', () => {
  assert.equal(parseHeight('abc'), null);
  assert.equal(parseHeight(30), null);
  assert.equal(parseHeight(400), null);
  assert.equal(parseHeight('165.5厘米'), 165.5);
});

test('long names are trimmed and control characters removed', () => {
  const [s] = normalize([{ name: '一二三四五六七八九十一二三四五六七八九十多余', height: '' }]);
  assert.equal(Array.from(s.name).length, 20);
  assert.equal(normalize([{ name: 'a\u0000b' }])[0].name, 'ab');
});
