// 云函数入口文件
const cloud = require("wx-server-sdk");
cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const classCollection = db.collection("class");
const classUserCollection = db.collection("classUser");
const _ = db.command;

// 云函数入口函数
exports.main = async () => {
    const { OPENID } = cloud.getWXContext();

    var classList = [];
    console.log("Start1");

    console.log("Start2");
    promise1 = new Promise((resolve) => {
        classCollection
            .where({
                owner: OPENID,
            })
            .get()
            .then((res) => {
                console.log("创建的班级:", res.data);
                for (i in res.data) {
                    classList.push({
                        name: res.data[i].name,
                        id: res.data[i]._id,
                        owned: true,
                    });
                }
                // console.log(":", classList);
                resolve();
            });
    });

    promise2 = new Promise((resolve) => {
        classUserCollection
            .where({
                members: OPENID,
            })
            .get()
            .then(async (res) => {
                console.log("加入的班级:", res.data);
                promises = [];
                for (i in res.data) {
                    console.log("end4");
                    promises.push(
                        new Promise((resolve) => {
                            classCollection
                                .doc(res.data[i]._id)
                                .get()
                                .then((res1) => {
                                    console.log("res1=", res1);
                                    classList.push({
                                        name: res1.data.name,
                                        id: res1.data._id,
                                        owned: false,
                                    });
                                    resolve();
                                });
                        })
                    );
                }
                await Promise.allSettled(promises);
                resolve();
            });
    });
    console.log("end2");
    await Promise.allSettled([promise1, promise2]);
    console.log("end3");
    console.log("最终班级表:", classList);
    return classList;
};
