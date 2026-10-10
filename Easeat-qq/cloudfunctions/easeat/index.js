/**
 * 易位 eaSEAT 云函数（云端模式才需要部署）。所有业务逻辑在 core/service.js，
 * 由 scripts/sync.js 从仓库根目录的 core/ 复制过来，小程序本机模式和网页版用的是同一份代码。
 *
 * 调用方式：qq.cloud.callFunction({ name: 'easeat', data: { action: 'getClass', classId } })
 * 返回 { ok: true, data } 或 { ok: false, msg }。
 * 另外配置了定时触发器（见 config.json），每周一早上为开启“每周自动重排”的班级重新排座。
 */
const crypto = require('crypto');
const cloud = require('qq-server-sdk');
const { createService } = require('./core/service');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const service = createService({ db: cloud.database(), randomBytes: (n) => crypto.randomBytes(n) });

exports.main = async (event) => {
  const { OPENID, SOURCE } = cloud.getQQContext();
  if (!OPENID && (SOURCE === 'wx_trigger' || event.Type === 'Timer' || event.TriggerName)) {
    return service.autoArrangeAll();
  }
  return service.call(event.action, event, OPENID);
};
