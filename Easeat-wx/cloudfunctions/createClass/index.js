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
const metaCollection = db.collection("meta");
const _ = db.command;

exports.main = async (event) => {
    const { OPENID } = cloud.getWXContext();
    const t = parseInt(Math.random() * 256) % 256;
    const idTops = (await metaCollection.doc("0").get()).data.idTops;
    const k = "idTops." + t;
    metaCollection.doc("0").update({
        data: {
            [k]: _.inc(1),
        },
    });
    const id = idTops[t].toString(16) + t.toString(16).padStart(2, "0");

    classCollection.add({
        data: {
            _id: id,
            owner: OPENID,
            name: event.name,
        },
    });

    classStudentCollection.add({
        data: {
            _id: id,
            studentIdTop: 1,
            students: [],
        },
    });
    classUserCollection.add({
        data: {
            _id: id,
            members: [],
        },
    });
    classSeatCollection.add({
        data: {
            _id: id,
            seats: [
                [true, true, false, true, true, true, false, true, true],
                [true, true, false, true, true, true, false, true, true],
                [true, true, false, true, true, true, false, true, true],
                [true, true, false, true, true, true, false, true, true],
            ],
        },
    });
    classArrangementCollection.add({
        data: {
            _id: id,
            arrangement: [],
        },
    });

    return {
        id: id,
    };
};
