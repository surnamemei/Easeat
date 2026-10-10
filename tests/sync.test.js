const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildOutputs, staleFiles } = require('../scripts/sync');

test('QQ version and the web demo are in sync with the WeChat version (run node scripts/sync.js)', () => {
  const outputs = buildOutputs();
  const outdated = [...outputs]
    .filter(([file, content]) => !fs.existsSync(file) || !fs.readFileSync(file).equals(content))
    .map(([file]) => path.relative(path.join(__dirname, '..'), file));
  assert.deepEqual(outdated, []);
  assert.deepEqual(staleFiles(outputs), []);
});
