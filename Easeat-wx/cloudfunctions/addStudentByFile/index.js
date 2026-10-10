const cloud = require("wx-server-sdk");
const xlsx = require("node-xlsx");

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV,
});
const db = cloud.database();
const classCollection = db.collection("class");
const classStudentCollection = db.collection("classStudent");
const classUserCollection = db.collection("classStudent");
const classSeatCollection = db.collection("classSeat");
const classArrangementCollection = db.collection("classArrangement");
const _ = db.command;

exports.main = async (event) => {
    const { OPENID } = cloud.getWXContext();
    let { fileID, classId } = event;

    var doc = (await classStudentCollection.doc(event.classId).get()).data;
    var studentIdTop = doc.studentIdTop;
    var students = doc.students;
    console.log("studentIdTop=", studentIdTop);
    //1,通过fileID下载云存储里的excel文件
    const res = await cloud.downloadFile({
        fileID: fileID,
    });
    const buffer = res.fileContent;

    // const tasks = []; //用来存储所有的添加数据操作

    // const all_excel_data = []; //用来存储所有的excel数据
    //2,解析excel文件里的数据
    var sheets = xlsx.parse(buffer); //获取到所有sheets
    sheets.forEach(function (sheet) {
        console.log(sheet["name"]);
        for (var rowId in sheet["data"]) {
            //console.log(rowId);
            var row = sheet["data"][rowId]; //第几行数据
            if (rowId > 0 && row) {
                //第一行是表格标题，所以我们要从第2行开始读
                //3，把解析到的数据存到excelList数据表里
                students.push({
                    id: studentIdTop++,
                    name: row[0], //姓名
                    height:
                        parseFloat(row[1]) !== NaN
                            ? parseFloat(row[1])
                            : undefined, //身高
                });
                
            }
        }
    });
    console.log(classId);
    console.log(students);
    var studentsStr=JSON.stringify(students);
    var studentsV=JSON.parse(studentsStr);
    // 一起添加所有数据
    var result = await classStudentCollection
        .doc(classId)
        .update({
            data: {
                students: studentsV,
            },
        })
        .then((res) => {
            return res;
        })
        .catch((err) => {
            return err;
        });
    return result;
};
