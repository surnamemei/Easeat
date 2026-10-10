const cloud = require("wx-server-sdk");
cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV,
});
const db = cloud.database();
const classCollection = db.collection("class");
const classArrangementCollection = db.collection("classArrangement");
const _ = db.command;

exports.main = async (event) => {
    const { OPENID } = cloud.getWXContext();
    const column=event.column;
    const row=event.row;
    const afterdata=event.afterdata;
    const arrangement=(await classArrangementCollection.doc(event.classId).get())
        .data.arrangement;
    const newArrangement=arrangement;
    newArrangement[row][column]=afterdata;

    classArrangementCollection
        .doc(event.classId)
        .update({
            data: { arrangement: newArrangement },
        })
        .then((res) => {
            console.log(res);
            return res;
        });
}
