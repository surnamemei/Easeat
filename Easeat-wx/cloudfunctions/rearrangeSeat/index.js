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

    const students = (await classStudentCollection.doc(event.classId).get())
        .data.students;
    const height = (await classStudentCollection.doc(event.classId).get())
        .data.height;
    const seats = (await classSeatCollection.doc(event.classId).get()).data
        .seats;
    var seatCount = 0;
    
    for (row of seats) {
        for (col of row) {
            if (col) seatCount++;
        }
    }

    var students2 = [];


    for (student of students) {
        if (student != null){
            if(student.height != null){
                //输入身高* 随机数（1-5）
                var newheight = Math.floor((Math.random()*5)+1) * student.height;
;
                

                students2.push([newheight,student.name]);
            }
            else{
            //没输入身高随机 *170（平均身高）   
            var randomheight = Math.floor((Math.random()*10)+1) *170;
;
            students2.push([randomheight, student.name]);
            }
        }
    } 



    if (seatCount < students2.length) throw "座位数量不足";

    students2.sort((a, b) => {
        return a[0] -b[0];
}

    );
    console.log("student2:", students2);
    var studentTop = 0;
    var arrangement = [];
    
    for (i in seats) {
        
        arrangement.push([]);
        for (j in seats[i]) {
            if (!seats[i][j]) arrangement[i].push(null);
            else {
                if (studentTop < students2.length)
                    arrangement[i].push(students2[studentTop++][1]);
                else arrangement[i].push("");
            }
        }
    } 
    console.log("arrangement:", arrangement);
    classArrangementCollection
        .doc(event.classId)
        .update({
            data: { arrangement: arrangement },
        })
        .then((res) => {
            console.log(res);
            return res;
        });
};
