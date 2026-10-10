const cloud = require("wx-server-sdk");
cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV,
});
const db = cloud.database();
const classCollection = db.collection("class");
const classStudentCollection = db.collection("classStudent");
const classUserCollection = db.collection("classUser");
const classArrangementCollection = db.collection("classArrangement");
const classSeatCollection = db.collection("classSeat");
const _ = db.command;

exports.main = async (event) => {
    const { OPENID } = cloud.getWXContext();
    const owner = (await classCollection.doc(event.classId).get()).data.owner;
    if (owner != OPENID) throw "非创建者无权限删除班级。";
    else {
        classCollection
            .doc(event.classId)
            .remove()
            .then((res) => {
                console.log(res);
            });
        classStudentCollection
            .doc(event.classId)
            .remove()
            .then((res) => {
                console.log(res);
            });
        classUserCollection
            .doc(event.classId)
            .remove()
            .then((res) => {
                console.log(res);
            });
        classArrangementCollection
            .doc(event.classId)
            .remove()
            .then((res) => {
                console.log(res);
            });
        classSeatCollection
            .doc(event.classId)
            .remove()
            .then((res) => {
                console.log(res);
            });
    }
    return 0;
};
