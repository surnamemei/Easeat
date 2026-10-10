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
    const { classId } = event;
    classUserCollection
        .where({
            _id: classId,
            members: OPENID,
        })
        .update({
            data: {
                members: [],
                // "members.$": null,
                // members: [],
                // a: 1,
            },
        })
        .then((res) => {
            console.log(res);
            return res;
        });
};
