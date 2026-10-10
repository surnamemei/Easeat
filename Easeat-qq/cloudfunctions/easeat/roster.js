/**
 * 学生名单解析：支持 Excel 表格的行，也支持老师直接粘贴的文字。
 * 每行：姓名[, 身高]。可以带表头，也可以在最前面带序号列。
 * 云函数和 GitHub Pages 上的网页演示共用这个文件。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EaseatRoster = factory();
})(this, function () {
  const MAX_NAME = 20;
  const HEADER = /^(序号|编号|学号|姓名|名字|学生|学生姓名|name|no\.?|id)$/i;

  function charLength(s) {
    return Array.from(s).length;
  }

  /** 解析身高，支持 165、165cm、1.65（米）；无法识别时返回 null */
  function parseHeight(value) {
    if (value === null || value === undefined) return null;
    let n = typeof value === 'number' ? value : parseFloat(String(value).replace(/\s|cm|厘米|公分/gi, ''));
    if (!isFinite(n)) return null;
    if (n > 0.5 && n < 2.5) n *= 100;
    return n >= 50 && n <= 250 ? Math.round(n * 10) / 10 : null;
  }

  function cleanName(value) {
    const name = String(value === null || value === undefined ? '' : value)
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return charLength(name) > MAX_NAME ? Array.from(name).slice(0, MAX_NAME).join('') : name;
  }

  /** rows: [[姓名, 身高], ...] → [{ name, height }] */
  function parseRows(rows) {
    const out = [];
    for (const raw of rows || []) {
      if (!Array.isArray(raw)) continue;
      let cells = raw.map((c) => (c === null || c === undefined ? '' : c));
      // 第一列是序号、第二列是姓名时，跳过序号
      if (/^\d+$/.test(String(cells[0]).trim()) && cells.length > 1 && cleanName(cells[1]) && parseHeight(cells[1]) === null) {
        cells = cells.slice(1);
      }
      const name = cleanName(cells[0]);
      if (!name || HEADER.test(name) || /^\d+(\.\d+)?$/.test(name)) continue;
      out.push({ name, height: parseHeight(cells[1]) });
    }
    return out;
  }

  function splitLine(line) {
    const cells = line.split(/[\t,，;；|]/);
    if (cells.length > 1) return cells;
    // 只用空格分隔时，把最后一个数字当作身高（姓名里可以有空格，如英文名）
    const m = line.match(/^(.*\S)\s+(\d+(\.\d+)?\s*(cm|厘米|公分)?)$/i);
    return m ? [m[1], m[2]] : [line];
  }

  /** 粘贴的文字：每行一个学生 */
  function parseText(text) {
    return parseRows(
      String(text || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map(splitLine)
    );
  }

  /** 小程序直接传来的 [{ name, height }] */
  function normalize(students) {
    return parseRows((students || []).map((s) => [s && s.name, s && s.height]));
  }

  return { parseHeight, parseRows, parseText, normalize, cleanName, MAX_NAME };
});
