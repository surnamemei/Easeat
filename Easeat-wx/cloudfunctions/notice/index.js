const cloud = require("wx-server-sdk");
cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV,
});
const db = cloud.database();
const _ = db.command;

exports.main = async () => {
    const { OPENID } = cloud.getWXContext();
try{
    const result = await cloud.openapi.subscribeMessage.send({
  "touser": "OPENID",
  "template_id": "_azDOZcxwCtJfq96hTzz97T_a-mq5-lp5bxH5t0VLPc",
  "page": "pages/index/index",
  "data": {
    "keyword1": {
      "thing1": "易位Easeat",
      "thing11": "易位Easeat提醒您座位可能需要重排啦~"
    }
  },
  "emphasis_keyword": "thing11.DATA"
})
    return result;
}catch (err) {
    return err}
};
