const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const xlsx = require('../core/xlsx');
const chart = require('../core/seat-chart');
const roster = require('../core/roster');
const fflate = require('../core/fflate');

const seats = [
  [true, true, false, true, true],
  [true, true, false, true, false],
];
const arrangement = [
  ['张三', '李四', null, '王五', ''],
  ['赵六', '', null, 'Tom & <Jerry>', null],
];

test('writes a workbook that reads back with the same values', () => {
  const bytes = xlsx.write([
    chart.chartSheet({ title: '高一（3）班 座位表', subtitle: '排座时间：10月12日', seats, arrangement }),
    chart.rosterSheet(
      [
        { id: 1, name: '张三', height: 160 },
        { id: 2, name: '孙七', height: null },
      ],
      seats,
      arrangement
    ),
  ]);
  assert.equal(bytes[0], 0x50, 'xlsx files are zip archives');
  const sheets = xlsx.readWorkbook(bytes);
  assert.deepEqual(sheets.map((s) => s.name), ['座位表', '学生名单']);

  const rows = sheets[0].rows;
  assert.equal(rows[0][0], '高一（3）班 座位表');
  assert.equal(rows[1][0], '排座时间：10月12日');
  assert.ok(rows[3].includes('讲 台'));
  assert.deepEqual(rows[4], ['张三', '李四', '', '王五', '']);
  assert.deepEqual(rows[5].slice(0, 4), ['赵六', '', '', 'Tom & <Jerry>']);

  assert.deepEqual(sheets[1].rows, [
    ['序号', '姓名', '身高（厘米）', '座位'],
    [1, '张三', 160, '第 1 排第 1 列'],
    [2, '孙七', '', '未安排'],
  ]);
});

test('the chart sheet is set up for printing on one landscape page', () => {
  const files = fflate.unzipSync(xlsx.write([chart.chartSheet({ title: 't', seats, arrangement })]));
  const sheet = fflate.strFromU8(files['xl/worksheets/sheet1.xml']);
  assert.match(sheet, /<pageSetUpPr fitToPage="1"\/>/);
  assert.match(sheet, /orientation="landscape" fitToWidth="1" fitToHeight="1"/);
  assert.match(sheet, /<mergeCell ref="A1:E1"\/>/);
  // 过道列比课桌列窄
  assert.match(sheet, /<col min="3" max="3" width="3" customWidth="1"\/>/);
});

test('podium view puts the podium last and mirrors the columns', () => {
  const sheets = xlsx.readWorkbook(xlsx.write([chart.chartSheet({ title: 't', seats, arrangement, flip: true })]));
  const rows = sheets[0].rows;
  assert.deepEqual(rows[3], ['', 'Tom & <Jerry>', '', '', '赵六']);
  assert.ok(rows[rows.length - 1].includes('讲 台'));
});

test('reads an Excel file with shared strings, merged title, header and numbering', () => {
  const rows = xlsx.readTable(fs.readFileSync(path.join(__dirname, 'fixtures/roster.xlsx')));
  assert.deepEqual(roster.parseRows(rows), [
    { name: '张三', height: 165 },
    { name: '李四', height: 158 },
    { name: 'Tom & Jerry <A>', height: 172 },
    { name: '王五', height: null },
  ]);
});

test('reads CSV in UTF-8 (with or without BOM), with quotes and tabs', () => {
  const csv = '﻿姓名,身高\n"张,三",160\r\n李四,"1.58"\n';
  assert.deepEqual(xlsx.readTable(Buffer.from(csv, 'utf8')), [
    ['姓名', '身高'],
    ['张,三', '160'],
    ['李四', '1.58'],
  ]);
  assert.deepEqual(xlsx.readTable(Buffer.from('王五\t170\n赵六\t\n', 'utf8')), [
    ['王五', '170'],
    ['赵六', ''],
  ]);
});

test('reads GBK CSV files saved by Excel on Chinese Windows when the runtime can decode GBK', (t) => {
  let gbk;
  try {
    new TextDecoder('gbk');
    // “张三,160” in GBK
    gbk = Buffer.from([0xd5, 0xc5, 0xc8, 0xfd, 0x2c, 0x31, 0x36, 0x30]);
  } catch (e) {
    return t.skip('this Node build has no GBK decoder');
  }
  assert.deepEqual(xlsx.readTable(gbk), [['张三', '160']]);
});

test('old .xls files and broken files get a helpful message', () => {
  assert.throws(() => xlsx.readTable(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0])), /另存为/);
  assert.throws(() => xlsx.readTable(Buffer.from([0x50, 0x4b, 1, 2, 3])), /无法读取/);
  assert.equal(xlsx.decodeUtf8(Buffer.from([0xc3, 0x28])), null);
});

test('column names', () => {
  assert.deepEqual([0, 25, 26, 27, 701].map(xlsx.columnName), ['A', 'Z', 'AA', 'AB', 'ZZ']);
});

test('importing an Excel file exported by Easeat reads only the roster sheet', () => {
  const students = [
    { id: 1, name: '张三', height: 160 },
    { id: 2, name: '李四', height: null },
    { id: 3, name: '赵六', height: 150.5 },
  ];
  const bytes = xlsx.write([
    chart.chartSheet({ title: '高一（3）班 座位表', subtitle: '排座时间：10月14日 周三 10:00', seats, arrangement }),
    chart.rosterSheet(students, seats, arrangement),
  ]);
  assert.deepEqual(roster.parseRows(xlsx.readTable(bytes)), [
    { name: '张三', height: 160 },
    { name: '李四', height: null },
    { name: '赵六', height: 150.5 },
  ]);
  // 只有座位表的文件（例如家长下载的）也不会把“讲台”“排座时间”当成学生
  const chartOnly = xlsx.write([chart.chartSheet({ title: '座位表', subtitle: '排座时间：今天', seats: [[true, true, true]], arrangement: [['甲', '乙', '']] })]);
  const names = roster.parseRows(xlsx.readTable(chartOnly)).map((s) => s.name);
  assert.ok(!names.some((n) => /讲|排座时间/.test(n)), names.join());
});

test('plain text with spaces and CSV with a title line are split correctly', () => {
  assert.deepEqual(xlsx.readTable(Buffer.from('张三 165\nTom Lee 170\n李四\n', 'utf8')), [['张三', '165'], ['Tom Lee', '170'], ['李四']]);
  assert.deepEqual(roster.parseRows(xlsx.readTable(Buffer.from('高一3班名单\n张三,165\n李四,158\n', 'utf8'))), [
    { name: '张三', height: 165 },
    { name: '李四', height: 158 },
  ]);
});

test('reads UTF-16 text saved by Excel as “Unicode 文本”', () => {
  const text = '姓名\t身高\r\n张三\t165\r\n';
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
  assert.deepEqual(xlsx.readTable(le), [['姓名', '身高'], ['张三', '165']]);
  const be = Buffer.from(le);
  for (let i = 0; i < be.length; i += 2) [be[i], be[i + 1]] = [be[i + 1], be[i]];
  assert.deepEqual(xlsx.readTable(be), [['姓名', '身高'], ['张三', '165']]);
});

test('malformed workbooks give a friendly error instead of crashing', () => {
  const files = fflate.unzipSync(xlsx.write([{ name: 'S', rows: [{ cells: [{ v: 'x' }] }] }]));
  files['xl/worksheets/sheet1.xml'] = fflate.strToU8(
    fflate.strFromU8(files['xl/worksheets/sheet1.xml']).replace('<t xml:space="preserve">x</t>', '<t>&#x110000;&#xD800;张三</t>')
  );
  const rows = xlsx.readTable(fflate.zipSync(files));
  assert.deepEqual(rows, [['张三']]);
});

