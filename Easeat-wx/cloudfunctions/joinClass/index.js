const cloud = require("wx-server-sdk");
cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV,
});
const db = cloud.database();
const classCollection = db.collection("class");
const classStudentCollection = db.collection("classStudent");
const classUserCollection = db.collection("classUser");
const _ = db.command;

exports.main = async (event) => {
    const { OPENID } = cloud.getWXContext();
    try {
        await classCollection.doc(event.classId).get();
    } catch (e) {
        throw "班级不存在。请输入正确的班级id（在班级页面分享菜单复制）。";
    }
    const members = await classUserCollection.doc(event.classId).get();
    console.log(members);
    if (members.data.members.includes(OPENID)) throw "已经在此班中";
    classUserCollection.doc(event.classId).update({
        data: {
            members: OPENID,
        },
    });
};
