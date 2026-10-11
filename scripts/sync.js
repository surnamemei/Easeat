#!/usr/bin/env node
/**
 * 同步共用代码。
 *
 * 微信 / QQ 小程序已经在 2.0 存档，以后只更新网页版，所以默认只把 core/ 复制到网页版（docs/js/core）：
 *
 *   node scripts/sync.js                同步网页版
 *   node scripts/sync.js --check        只检查是否已同步（测试里会运行）
 *
 * 如果以后要再更新小程序，加上 --all：同时把 core/ 复制到微信版（utils/core、云函数 easeat/core），
 * 再以微信版（Easeat-wx）为准生成 QQ 版（Easeat-qq）。不加 --all 时只检查 QQ 版和存档的微信版是否一致。
 *
 *   node scripts/sync.js --all
 *
 * 转换规则：.wxml → .qml，.wxss → .qss，wx: → qq:，wx. → qq.，
 * 云函数里 wx-server-sdk → qq-server-sdk，getWXContext → getQQContext。
 * QQ 版自己的文件不会被覆盖：project.config.json、sitemap.json、utils/platform.js。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CORE = path.join(ROOT, 'core');
const WX = path.join(ROOT, 'Easeat-wx');
const QQ = path.join(ROOT, 'Easeat-qq');
const DOCS_CORE = path.join(ROOT, 'docs', 'js', 'core');

// core/ 里的模块复制到哪里（云函数只需要业务逻辑）。miniprogram 为 true 的位置只在 --all 时更新
const CORE_TARGETS = [
  { dir: path.join(WX, 'utils', 'core'), files: null, miniprogram: true },
  { dir: path.join(WX, 'cloudfunctions', 'easeat', 'core'), files: ['arrange.js', 'roster.js', 'service.js'], miniprogram: true },
  { dir: DOCS_CORE, files: null },
];

function targets(options) {
  return CORE_TARGETS.filter((t) => (options && options.all) || !t.miniprogram);
}
const BANNER = '// 此文件由 scripts/sync.js 从仓库根目录的 core/ 复制而来，请修改 core/ 中的原文件。\n';

const QQ_SERVER_SDK = '^1.2.2-beta.2';
// QQ 版里由本脚本生成的内容；这些位置里多出来的旧文件会被删除
const GENERATED = ['app.js', 'app.json', 'app.qss', 'pages', 'components', 'utils', 'images', 'cloudfunctions', 'styles'];
// QQ 版自己维护、不会被覆盖或删除的文件
const QQ_OWNED = ['utils/platform.js'];
// 微信版里不需要复制的文件
const SKIP = [/(^|\/)node_modules\//, /package-lock\.json$/, /^project\..*json$/, /^sitemap\.json$/, /^\.vscode\//, /^\.prettierrc\.js$/, /^utils\/platform\.js$/];

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

/** core/ 复制出去的文件：Map<绝对路径, Buffer> */
function coreOutputs(options) {
  const out = new Map();
  const modules = fs.readdirSync(CORE).filter((f) => f.endsWith('.js'));
  for (const target of targets(options)) {
    for (const name of target.files || modules) {
      out.set(path.join(target.dir, name), Buffer.concat([Buffer.from(BANNER), fs.readFileSync(path.join(CORE, name))]));
    }
  }
  return out;
}

/** 生成的全部文件（core 的副本和 QQ 版）：Map<绝对路径, Buffer>。options.all：同时更新小程序 */
function buildOutputs(options) {
  const out = coreOutputs(options);
  const qqApp = JSON.parse(fs.readFileSync(path.join(QQ, 'app.json'), 'utf8'));
  // QQ 版从微信版生成，微信版里的 core 副本以这次生成的内容为准
  const inCoreCopy = (abs) => targets(options).some((t) => abs.startsWith(t.dir + path.sep));
  const wxFiles = new Map(
    walk(WX)
      .map((file) => [file, path.join(WX, file)])
      .filter(([, abs]) => !inCoreCopy(abs) || out.has(abs))
  );
  for (const key of out.keys()) {
    if (key.startsWith(WX + path.sep)) wxFiles.set(path.relative(WX, key).split(path.sep).join('/'), key);
  }

  for (const [file, src] of wxFiles) {
    if (SKIP.some((re) => re.test(file))) continue;
    let target = file;
    let content = out.has(src) ? out.get(src) : fs.readFileSync(src);

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

  return out;
}

/** 应该删除的旧文件：QQ 版里不再由微信版生成的文件，以及各个 core 副本目录里多出来的文件 */
function staleFiles(outputs, options) {
  const stale = [];
  for (const file of walk(QQ)) {
    const top = file.split('/')[0];
    if (!GENERATED.includes(top) || QQ_OWNED.includes(file) || /(^|\/)node_modules\//.test(file)) continue;
    if (!outputs.has(path.join(QQ, file))) stale.push(path.join(QQ, file));
  }
  for (const { dir } of targets(options)) {
    for (const file of walk(dir)) if (!outputs.has(path.join(dir, file))) stale.push(path.join(dir, file));
  }
  return stale;
}

function main() {
  const check = process.argv.includes('--check');
  const options = { all: process.argv.includes('--all') };
  const outputs = buildOutputs(options);
  const stale = staleFiles(outputs, options);
  const changed = [...outputs].filter(([file, content]) => !fs.existsSync(file) || !fs.readFileSync(file).equals(content));
  const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');

  if (check) {
    if (!changed.length && !stale.length) return console.log(options.all ? '网页版和小程序都已同步。' : '网页版已同步，QQ 版与存档的微信版一致。');
    changed.forEach(([f]) => console.log(`需要更新：${rel(f)}`));
    stale.forEach((f) => console.log(`需要删除：${rel(f)}`));
    console.log(`请运行 node scripts/sync.js${options.all ? ' --all' : ''}`);
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
  prune(path.join(ROOT, 'docs', 'js'));
  console.log(`已同步：更新 ${changed.length} 个文件，删除 ${stale.length} 个旧文件。`);
}

if (require.main === module) main();
module.exports = { buildOutputs, staleFiles };
