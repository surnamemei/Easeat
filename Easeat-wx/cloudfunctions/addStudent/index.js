const cloud = require("wx-server-sdk");
cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV,
});
const db = cloud.database();
const classCollection = db.collection("class");
const classStudentCollection = db.collection("classStudent");
const _ = db.command;

exports.main = async (event) => {
    const { OPENID } = cloud.getWXContext();
    const owner = (await classCollection.doc(event.classId).get()).data.owner;
    
    var studentIdTop = (await classStudentCollection.doc(event.classId).get())
        .data.studentIdTop;
    console.log("studentIdTop=", studentIdTop);
    console.log("Start1");
    await classStudentCollection.doc(event.classId).update({
        data: {
            students: _.unshift({
                id: studentIdTop,
                name: event.name,
                height:
                    parseFloat(event.height) !== NaN
                        ? parseFloat(event.height)
                        : undefined,
            }),
            studentIdTop: _.inc(1),
        },
    });
    console.log("end");
    return studentIdTop;
};
