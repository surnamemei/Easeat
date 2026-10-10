const cloud = require("wx-server-sdk");
cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV,
});
const db = cloud.database();
const classCollection = db.collection("class");
const classStudentCollection = db.collection("classStudent");
const classUserCollection = db.collection("classStudent");
const classSeatCollection = db.collection("classSeat");
const _ = db.command;

exports.main = async (event) => {
    const { OPENID } = cloud.getWXContext();
    if (typeof event.classId != "string") throw "缺少string参数classId";
    if (typeof event.seats != "object") throw "缺少Array参数seats数组";
    classSeatCollection
        .doc(event.classId)
        .update({
            data: {
                seats: event.seats,
            },
        })
        .then((res) => {
            console.log(res);
            return res;
        });
};
