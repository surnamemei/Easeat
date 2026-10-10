/**
 * 读取老师上传的 Excel 名单，返回表格的前几列。
 * 单独放在一个云函数里：表格解析库比较大，而且只在导入名单时才用到。
 * 返回 { ok: true, data: { rows } } 或 { ok: false, msg }；rows 交给 easeat 云函数的 addStudents 处理。
 */
const cloud = require('wx-server-sdk');
const xlsx = require('node-xlsx');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const MAX_ROWS = 300;
const MAX_FILE_SIZE = 2 * 1024 * 1024;

function cell(value) {
  if (typeof value === 'number') return value;
  return value === null || value === undefined ? '' : String(value).slice(0, 40);
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const fileID = String(event.fileID || '');
  if (!OPENID || !/\/NameLists\/[0-9a-z]+-\d+\.(xlsx|xls|csv)$/i.test(fileID)) {
    return { ok: false, msg: '文件上传失败，请重试' };
  }
  try {
    const file = await cloud.downloadFile({ fileID });
    if (file.fileContent.length > MAX_FILE_SIZE) return { ok: false, msg: '文件太大了，请只保留姓名和身高两列' };
    const rows = [];
    for (const sheet of xlsx.parse(file.fileContent)) {
      for (const row of sheet.data || []) {
        if (rows.length >= MAX_ROWS) break;
        if (Array.isArray(row)) rows.push(row.slice(0, 3).map(cell));
      }
    }
    return { ok: true, data: { rows } };
  } catch (e) {
    console.warn(e);
    return { ok: false, msg: '无法读取这个文件，请确认是 Excel 表格（.xlsx 或 .xls）' };
  } finally {
    // 读完立即删除上传的文件，不在云端保留学生信息
    await cloud.deleteFile({ fileIDList: [fileID] }).catch((e) => console.warn('deleteFile', e));
  }
};
