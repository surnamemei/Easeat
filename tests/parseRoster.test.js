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
  mock.db.collection('class').add({ data: { _id: 'abc123', name: '班', owner: 'teacher' } });
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

test('only the owner of the class can read its uploaded roster', async (t) => {
  const { mock, fn } = setup(() => [{ name: 'Sheet1', data: [['张三', 160]] }]);
  t.after(() => mock.restore());
  mock.setContext({ OPENID: 'someone-else' });
  assert.match((await fn.main({ fileID: FILE })).msg, /只有班级的创建者/);
  assert.equal(mock.files.has(FILE), true, 'the teacher’s upload is not touched');
  mock.setContext({ OPENID: 'teacher' });
  assert.equal((await fn.main({ fileID: FILE })).ok, true);
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
