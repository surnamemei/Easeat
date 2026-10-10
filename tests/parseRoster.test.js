const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { installMockCloud } = require('./helpers/mock-cloud');

const FUNCTION_DIR = path.join(__dirname, '../Easeat-wx/cloudfunctions/parseRoster');
const FILE = 'cloud://env.1234/NameLists/abc123-1700000000000.xlsx';

function setup(parse) {
  const mock = installMockCloud({ 'node-xlsx': { parse } });
  for (const key of Object.keys(require.cache)) if (key.startsWith(FUNCTION_DIR)) delete require.cache[key];
  mock.setContext({ OPENID: 'teacher' });
  mock.files.set(FILE, Buffer.from('fake excel'));
  return { mock, fn: require(FUNCTION_DIR) };
}

test('returns the first columns of every sheet and deletes the upload', async (t) => {
  const { mock, fn } = setup(() => [
    { name: 'Sheet1', data: [['姓名', '身高', '备注', '多余'], ['张三', 160, null]] },
    { name: 'Sheet2', data: [['李四']] },
  ]);
  t.after(() => mock.restore());
  const res = await fn.main({ fileID: FILE });
  assert.deepEqual(res, { ok: true, data: { rows: [['姓名', '身高', '备注'], ['张三', 160, ''], ['李四']] } });
  assert.equal(mock.files.has(FILE), false);
});

test('rejects files outside the upload folder and unreadable files', async (t) => {
  const { mock, fn } = setup(() => {
    throw new Error('corrupt');
  });
  t.after(() => mock.restore());
  assert.match((await fn.main({ fileID: 'cloud://env.1234/other/secret.xlsx' })).msg, /上传失败/);
  assert.equal(mock.files.has(FILE), true, 'files outside NameLists are never touched');
  assert.match((await fn.main({ fileID: FILE })).msg, /无法读取/);
  assert.equal(mock.files.has(FILE), false);
});
