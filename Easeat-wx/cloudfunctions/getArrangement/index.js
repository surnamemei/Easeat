const cloud = require("wx-server-sdk");
cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV,
});
const db = cloud.database();
const classArrangementCollection = db.collection("classArrangement");
const _ = db.command;

exports.main = async (event) => {
    const { OPENID } = cloud.getWXContext();
    return (await classArrangementCollection.doc(event.classId).get()).data
        .arrangement;
};
