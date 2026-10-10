/**
 * 云开发 SDK（wx-server-sdk / qq-server-sdk）的替身，用来在 Node 里运行云函数。
 * 数据库直接使用 core/local-db.js（行为与云数据库一致，数据只存在内存里）。
 */
const Module = require('module');
const { createLocalDatabase } = require('../../core/local-db');

/**
 * 让 require('wx-server-sdk') / require('qq-server-sdk') 返回模拟的云环境。
 * 用 setContext({ OPENID }) 切换当前调用者。
 */
function installMockCloud(extraModules = {}) {
  const db = createLocalDatabase();
  db.store = db.tables;
  let context = {};
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'mock-env',
    init() {},
    database: () => db,
    getWXContext: () => context,
    getQQContext: () => context,
  };
  const modules = Object.assign({ 'wx-server-sdk': cloud, 'qq-server-sdk': cloud }, extraModules);
  const originalLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (Object.prototype.hasOwnProperty.call(modules, request)) return modules[request];
    return originalLoad.call(this, request, ...rest);
  };
  return {
    cloud,
    db,
    setContext(ctx) {
      context = ctx;
    },
    restore() {
      Module._load = originalLoad;
    },
  };
}

module.exports = { installMockCloud };
