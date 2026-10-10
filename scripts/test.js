#!/usr/bin/env node
/** 运行 tests/ 下的所有 *.test.js（兼容 Node 18 到最新版本） */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'tests');
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.test.js'))
  .map((f) => path.join(dir, f));
const result = spawnSync(process.execPath, ['--test', ...files, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(result.status === null ? 1 : result.status);
