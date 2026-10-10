const test = require('node:test');
const assert = require('node:assert/strict');
const link = require('../core/share-link');

const data = {
  name: '高一（3）班',
  seats: [
    [true, true, false, true],
    [true, false, false, true],
  ],
  arrangement: [
    ['张三', '', null, 'Tom Lee'],
    ['李四', null, null, '王五'],
  ],
  arrangedAt: 1760000000000,
};

test('a seating chart survives the trip through a link', () => {
  const url = link.viewUrl(data);
  assert.ok(url.startsWith('https://surnamemei.github.io/Easeat/#view='));
  assert.match(url.split('#view=')[1], /^[A-Za-z0-9_-]+$/, 'the code is URL-safe');
  assert.deepEqual(link.decode(url.split('#view=')[1]), data);
});

test('a class of 48 students fits in a reasonably short link', () => {
  const names = Array.from({ length: 48 }, (_, i) => `学生${i + 1}号`);
  const seats = Array.from({ length: 6 }, () => [true, true, false, true, true, false, true, true, false, true, true]);
  let k = 0;
  const arrangement = seats.map((row) => row.map((d) => (d ? names[k++] : null)));
  const code = link.encode({ name: '高一（3）班', seats, arrangement, arrangedAt: 1 });
  assert.ok(code.length < 1200, `link code is ${code.length} characters`);
});

test('base64url round-trips every byte length', () => {
  for (let n = 0; n < 10; n++) {
    const bytes = new Uint8Array(Array.from({ length: n }, (_, i) => (i * 97 + 13) & 255));
    assert.deepEqual(link.fromBase64Url(link.toBase64Url(bytes)), bytes);
  }
});

test('broken or tampered links are rejected with a friendly message', () => {
  assert.throws(() => link.decode('abc'), /链接不完整/);
  assert.throws(() => link.decode('!!!'), /链接不完整/);
  const code = link.encode(data);
  assert.throws(() => link.decode(code.slice(0, code.length - 6)), /链接不完整/);
});

test('backups can be packed into a short code and survive line breaks from chat apps', () => {
  const backup = { app: 'easeat', version: 1, classes: [{ name: '高一（3）班', students: Array.from({ length: 40 }, (_, i) => ({ id: i + 1, name: `学生${i + 1}`, height: 150 + i })) }] };
  const code = link.packBackup(backup);
  assert.ok(code.startsWith('EASEAT1:'));
  assert.ok(code.length < JSON.stringify(backup).length / 2, `packed ${code.length} vs raw ${JSON.stringify(backup).length}`);
  const wrapped = code.replace(/(.{60})/g, '$1\n  ');
  assert.deepEqual(link.unpackBackup(`  ${wrapped}  `), backup);
  assert.deepEqual(link.unpackBackup(JSON.stringify(backup)), backup);
  assert.throws(() => link.unpackBackup('EASEAT1:!!!'));
});

test('links that would expand into something huge are rejected', () => {
  const fflate = require('../core/fflate');
  const bomb = link.toBase64Url(fflate.deflateSync(new Uint8Array(5 * 1024 * 1024).fill(32)));
  assert.throws(() => link.decode(bomb), /链接不完整/);
  assert.throws(() => link.decode('A'.repeat(30000)), /链接不完整/);
});

