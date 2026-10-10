#!/usr/bin/env node
/**
 * 以微信版（Easeat-wx）为准，生成 QQ 版（Easeat-qq）的代码，并把排座算法复制给网页演示（docs/js）。
 *
 *   node scripts/sync.js          同步
 *   node scripts/sync.js --check  只检查是否已同步（测试里会运行）
 *
 * 转换规则：.wxml → .qml，.wxss → .qss，wx: → qq:，wx. → qq.，
 * 云函数里 wx-server-sdk → qq-server-sdk，getWXContext → getQQContext。
 * QQ 版自己的文件不会被覆盖：project.config.json、sitemap.json、utils/platform.js。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WX = path.join(ROOT, 'Easeat-wx');
const QQ = path.join(ROOT, 'Easeat-qq');
const DOCS_JS = path.join(ROOT, 'docs', 'js');

const QQ_SERVER_SDK = '^1.2.2-beta.2';
// QQ 版里由本脚本生成的内容；这些位置里多出来的旧文件会被删除
const GENERATED = ['app.js', 'app.json', 'app.qss', 'pages', 'components', 'utils', 'images', 'cloudfunctions', 'styles'];
// QQ 版自己维护、不会被覆盖或删除的文件
const QQ_OWNED = ['utils/platform.js'];
// 微信版里不需要复制的文件
const SKIP = [/(^|\/)node_modules\//, /package-lock\.json$/, /^project\..*json$/, /^sitemap\.json$/, /^\.vscode\//, /^\.prettierrc\.js$/, /^utils\/platform\.js$/];
const DOCS = {
  'arrange.js': 'cloudfunctions/easeat/arrange.js',
  'roster.js': 'cloudfunctions/easeat/roster.js',
  'seat-chart.js': 'utils/seat-chart.js',
};

function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, base);
    return [path.relative(base, full).split(path.sep).join('/')];
  });
}

function transformJs(text, file) {
  let out = text.replace(/\bwx\./g, 'qq.').replace(/\bwx:/g, 'qq:');
  if (file.startsWith('cloudfunctions/')) {
    out = out.replace(/wx-server-sdk/g, 'qq-server-sdk').replace(/getWXContext/g, 'getQQContext');
  }
  return out;
}

/** 生成 QQ 版和网页演示的全部文件：Map<绝对路径, Buffer> */
function buildOutputs() {
  const out = new Map();
  const qqApp = JSON.parse(fs.readFileSync(path.join(QQ, 'app.json'), 'utf8'));

  for (const file of walk(WX)) {
    if (SKIP.some((re) => re.test(file))) continue;
    const src = path.join(WX, file);
    let target = file;
    let content = fs.readFileSync(src);

    if (file.endsWith('.wxml')) {
      target = file.replace(/\.wxml$/, '.qml');
      content = content.toString('utf8').replace(/\bwx:/g, 'qq:');
    } else if (file.endsWith('.wxss')) {
      target = file.replace(/\.wxss$/, '.qss');
      content = content.toString('utf8').replace(/\.wxss\b/g, '.qss');
    } else if (file.endsWith('.js')) {
      content = transformJs(content.toString('utf8'), file);
    } else if (file === 'app.json') {
      const app = JSON.parse(content.toString('utf8'));
      if (qqApp.groupIdList) app.groupIdList = qqApp.groupIdList;
      content = JSON.stringify(app, null, 2) + '\n';
    } else if (/^cloudfunctions\/[^/]+\/package\.json$/.test(file)) {
      const pkg = JSON.parse(content.toString('utf8'));
      if (pkg.dependencies && pkg.dependencies['wx-server-sdk']) {
        delete pkg.dependencies['wx-server-sdk'];
        pkg.dependencies['qq-server-sdk'] = QQ_SERVER_SDK;
      }
      content = JSON.stringify(pkg, null, 2) + '\n';
    }
    out.set(path.join(QQ, target), Buffer.from(content));
  }

  for (const [name, from] of Object.entries(DOCS)) {
    out.set(path.join(DOCS_JS, name), fs.readFileSync(path.join(WX, from)));
  }
  return out;
}

/** QQ 版中应该删除的旧文件（不再由微信版生成，也不是 QQ 版自己的文件） */
function staleFiles(outputs) {
  const stale = [];
  for (const file of walk(QQ)) {
    const top = file.split('/')[0];
    if (!GENERATED.includes(top) || QQ_OWNED.includes(file) || /(^|\/)node_modules\//.test(file)) continue;
    if (!outputs.has(path.join(QQ, file))) stale.push(path.join(QQ, file));
  }
  return stale;
}

function main() {
  const check = process.argv.includes('--check');
  const outputs = buildOutputs();
  const stale = staleFiles(outputs);
  const changed = [...outputs].filter(([file, content]) => !fs.existsSync(file) || !fs.readFileSync(file).equals(content));
  const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');

  if (check) {
    if (!changed.length && !stale.length) return console.log('QQ 版和网页演示已与微信版同步。');
    changed.forEach(([f]) => console.log(`需要更新：${rel(f)}`));
    stale.forEach((f) => console.log(`需要删除：${rel(f)}`));
    console.log('请运行 node scripts/sync.js');
    process.exitCode = 1;
    return;
  }

  for (const file of stale) fs.unlinkSync(file);
  for (const [file, content] of changed) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  // 清理空目录
  const prune = (dir) => {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) prune(path.join(dir, entry.name));
    if (dir !== QQ && !fs.readdirSync(dir).length) fs.rmdirSync(dir);
  };
  GENERATED.forEach((top) => prune(path.join(QQ, top)));
  console.log(`已同步：更新 ${changed.length} 个文件，删除 ${stale.length} 个旧文件。`);
}

if (require.main === module) main();
module.exports = { buildOutputs, staleFiles };
