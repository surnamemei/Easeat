const cloud = require("wx-server-sdk");
cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV,
});
const db = cloud.database();
const classCollection = db.collection("class");
const classStudentCollection = db.collection("classStudent");
const classUserCollection = db.collection("classUser");
const classSeatCollection = db.collection("classSeat");
const classArrangementCollection = db.collection("classArrangement");
const _ = db.command;

exports.main = async (event) => {
    const { OPENID } = cloud.getWXContext();
    const { classId, studentId } = event;
    const owner = (await classCollection.doc(classId).get()).data.owner;
    console.log("classId", classId);
    console.log("studentId", studentId);
    classStudentCollection
        .where({
            _id: classId,
            students: {
                id: studentId,
            },
        })
        .update({
            data: { "students.$": null },
        })
        .then((res) => {
            console.log(res);
            return res;
        });
};
