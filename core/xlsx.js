/**
 * 读写 Excel（.xlsx）文件，不需要服务器。小程序、网页版和测试共用。
 *
 * write(sheets) → Uint8Array：生成 .xlsx 文件
 *   sheets: [{ name, rows: [{ height, cells: [{ v, s } | null] }], cols: [列宽], merges: ['A1:C1'], landscape, fitToPage }]
 *   s 为样式名：title / subtitle / podium / desk / empty / header / cell / center
 * readTable(bytes) → 表格的行（二维数组）：支持 .xlsx、.csv 和纯文本，自动识别
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./fflate'));
  else root.EaseatXlsx = factory(root.fflate);
})(this, function (fflate) {
  const { zipSync, unzipSync, strToU8, strFromU8 } = fflate;

  class XlsxError extends Error {
    constructor(message) {
      super(message);
      this.name = 'XlsxError';
      this.expose = true;
    }
  }

  // ------------------------------------------------------------ 写入

  const STYLE_INDEX = { normal: 0, title: 1, subtitle: 2, podium: 3, desk: 4, empty: 5, header: 6, cell: 7, center: 8 };

  const STYLES_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="5">' +
    '<font><sz val="11"/><name val="等线"/><family val="2"/><charset val="134"/></font>' +
    '<font><b/><sz val="16"/><name val="等线"/><family val="2"/><charset val="134"/></font>' +
    '<font><sz val="10"/><color rgb="FF6B7785"/><name val="等线"/><family val="2"/><charset val="134"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FF1683C0"/><name val="等线"/><family val="2"/><charset val="134"/></font>' +
    '<font><b/><sz val="11"/><name val="等线"/><family val="2"/><charset val="134"/></font>' +
    '</fonts>' +
    '<fills count="4">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE8F5F8"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF7FC"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="4">' +
    '<border><left/><right/><top/><bottom/><diagonal/></border>' +
    border('FFA9D6EE') +
    border('FFD5DDE5') +
    border('FFB8C1CB') +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="9">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    xf(1, 0, 0, 'center') +
    xf(2, 0, 0, 'center') +
    xf(3, 2, 1, 'center') +
    xf(0, 3, 1, 'center', true) +
    xf(0, 0, 2, 'center') +
    xf(4, 2, 3, 'center') +
    xf(0, 0, 3, 'left') +
    xf(0, 0, 3, 'center') +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="常规" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  function border(color) {
    const side = (name) => `<${name} style="thin"><color rgb="${color}"/></${name}>`;
    return `<border>${side('left')}${side('right')}${side('top')}${side('bottom')}<diagonal/></border>`;
  }

  function xf(font, fill, borderId, horizontal, wrap) {
    return (
      `<xf numFmtId="0" fontId="${font}" fillId="${fill}" borderId="${borderId}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">` +
      `<alignment horizontal="${horizontal}" vertical="center"${wrap ? ' wrapText="1"' : ''}/></xf>`
    );
  }

  function escapeXml(value) {
    return String(value)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** 第 i 列（从 0 开始）的列名：0 → A，26 → AA */
  function columnName(i) {
    let name = '';
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
    return name;
  }

  function cellXml(cell, ref) {
    if (cell === null || cell === undefined) return '';
    const style = STYLE_INDEX[cell.s] || 0;
    const s = style ? ` s="${style}"` : '';
    const v = cell.v;
    if (v === null || v === undefined || v === '') return s ? `<c r="${ref}"${s}/>` : '';
    if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(v)}</t></is></c>`;
  }

  function sheetXml(sheet) {
    const rows = sheet.rows || [];
    const parts = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'];
    parts.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">');
    if (sheet.fitToPage) parts.push('<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
    parts.push('<sheetFormatPr defaultRowHeight="15"/>');
    if (sheet.cols && sheet.cols.length) {
      parts.push('<cols>');
      sheet.cols.forEach((w, i) => parts.push(`<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`));
      parts.push('</cols>');
    }
    parts.push('<sheetData>');
    rows.forEach((row, r) => {
      const cells = (row.cells || []).map((cell, c) => cellXml(cell, columnName(c) + (r + 1))).join('');
      const height = row.height ? ` ht="${row.height}" customHeight="1"` : '';
      parts.push(`<row r="${r + 1}"${height}>${cells}</row>`);
    });
    parts.push('</sheetData>');
    if (sheet.merges && sheet.merges.length) {
      parts.push(`<mergeCells count="${sheet.merges.length}">`);
      sheet.merges.forEach((ref) => parts.push(`<mergeCell ref="${ref}"/>`));
      parts.push('</mergeCells>');
    }
    if (sheet.fitToPage) parts.push('<printOptions horizontalCentered="1"/>');
    parts.push('<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>');
    if (sheet.landscape || sheet.fitToPage) {
      parts.push(`<pageSetup paperSize="9" orientation="${sheet.landscape ? 'landscape' : 'portrait'}"${sheet.fitToPage ? ' fitToWidth="1" fitToHeight="1"' : ''}/>`);
    }
    parts.push('</worksheet>');
    return parts.join('');
  }

  function sheetName(name, index, used) {
    let n = String(name || `Sheet${index + 1}`).replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31) || `Sheet${index + 1}`;
    while (used.has(n)) n = `${n.slice(0, 28)}(${index + 1})`;
    used.add(n);
    return n;
  }

  /** 生成 .xlsx 文件内容 */
  function write(sheets) {
    const used = new Set();
    const names = sheets.map((s, i) => sheetName(s.name, i, used));
    const files = {};
    files['[Content_Types].xml'] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>'
    );
    files['_rels/.rels'] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>'
    );
    files['xl/workbook.xml'] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        names.map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets></workbook>'
    );
    files['xl/_rels/workbook.xml.rels'] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>'
    );
    files['xl/styles.xml'] = strToU8(STYLES_XML);
    sheets.forEach((s, i) => {
      files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s));
    });
    return zipSync(files, { level: 6 });
  }

  // ------------------------------------------------------------ 读取

  function decodeXml(text) {
    return text.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e) => {
      const k = e.toLowerCase();
      if (k === 'lt') return '<';
      if (k === 'gt') return '>';
      if (k === 'amp') return '&';
      if (k === 'quot') return '"';
      if (k === 'apos') return "'";
      const code = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      return isFinite(code) && code >= 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : '';
    });
  }

  /** 一段富文本里所有 <t> 的文字（忽略日文注音 <rPh>） */
  function richText(xml) {
    const plain = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
    let out = '';
    const re = /<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g;
    let m;
    while ((m = re.exec(plain))) out += decodeXml(m[1] || '');
    return out;
  }

  function columnIndex(ref) {
    const letters = /^[A-Z]+/i.exec(ref || '');
    if (!letters) return -1;
    let n = 0;
    for (const ch of letters[0].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  function attr(attrs, name) {
    const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
    return m ? m[1] : null;
  }

  function parseSheet(xml, shared) {
    const rows = [];
    const rowRe = /<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g;
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let rm;
    while ((rm = rowRe.exec(xml))) {
      const row = [];
      const body = rm[1] || '';
      let cm;
      cellRe.lastIndex = 0;
      while ((cm = cellRe.exec(body))) {
        const attrs = cm[1];
        const inner = cm[2] || '';
        let col = columnIndex(attr(attrs, 'r'));
        if (col < 0) col = row.length;
        const type = attr(attrs, 't');
        const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
        const v = vm ? decodeXml(vm[1]) : '';
        let value;
        if (type === 's') value = shared[Number(v)] !== undefined ? shared[Number(v)] : '';
        else if (type === 'inlineStr') value = richText(inner);
        else if (type === 'str') value = v;
        else if (type === 'b') value = v === '1';
        else if (type === 'e') value = '';
        else value = v !== '' && isFinite(Number(v)) ? Number(v) : v;
        while (row.length < col) row.push('');
        row[col] = value;
      }
      rows.push(row);
    }
    return rows;
  }

  /** 读取 .xlsx 中的所有工作表：[{ name, rows }] */
  function readWorkbook(bytes) {
    let files;
    try {
      files = unzipSync(bytes, {
        filter: (f) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(f.name),
      });
    } catch (e) {
      throw new XlsxError('无法读取这个文件，请确认是 Excel 表格（.xlsx）');
    }
    const text = (name) => (files[name] ? strFromU8(files[name]) : '');
    const workbook = text('xl/workbook.xml');
    if (!workbook) throw new XlsxError('无法读取这个文件，请确认是 Excel 表格（.xlsx）');

    const shared = [];
    const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\s*\/>/g;
    let m;
    const sharedXml = text('xl/sharedStrings.xml');
    while ((m = siRe.exec(sharedXml))) shared.push(richText(m[1] || ''));

    const targets = {};
    const relRe = /<Relationship\b([^>]*?)\/?>/g;
    const rels = text('xl/_rels/workbook.xml.rels');
    while ((m = relRe.exec(rels))) {
      const id = attr(m[1], 'Id');
      const target = attr(m[1], 'Target');
      if (id && target) targets[id] = target.replace(/^\/?xl\//, '').replace(/^\//, '');
    }

    const sheets = [];
    const sheetRe = /<sheet\b([^>]*?)\/?>/g;
    while ((m = sheetRe.exec(workbook))) {
      const rid = attr(m[1], 'r:id');
      const path = rid && targets[rid] ? `xl/${targets[rid]}` : null;
      if (path && files[path]) sheets.push({ name: decodeXml(attr(m[1], 'name') || ''), rows: parseSheet(text(path), shared) });
    }
    // 关系文件缺失时，按文件名顺序读取所有工作表
    if (!sheets.length) {
      Object.keys(files)
        .filter((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n))
        .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
        .forEach((n) => sheets.push({ name: n, rows: parseSheet(text(n), shared) }));
    }
    return sheets;
  }

  /** 严格的 UTF-8 解码；遇到不合法的字节返回 null */
  function decodeUtf8(bytes) {
    let out = '';
    let i = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
    const cont = (k) => i + k < bytes.length && (bytes[i + k] & 0xc0) === 0x80;
    while (i < bytes.length) {
      const b = bytes[i];
      let cp;
      if (b < 0x80) {
        cp = b;
        i += 1;
      } else if (b >= 0xc2 && b < 0xe0 && cont(1)) {
        cp = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
        i += 2;
      } else if (b >= 0xe0 && b < 0xf0 && cont(1) && cont(2)) {
        cp = ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
        if (cp < 0x800 || (cp >= 0xd800 && cp < 0xe000)) return null;
        i += 3;
      } else if (b >= 0xf0 && b < 0xf5 && cont(1) && cont(2) && cont(3)) {
        cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
        if (cp < 0x10000 || cp > 0x10ffff) return null;
        i += 4;
      } else return null;
      out += String.fromCodePoint(cp);
    }
    return out;
  }

  const DELIMITERS = ['\t', ',', '，', ';', '；'];

  /** 没有分隔符的文字（例如“张三 165”）：把最后一个数字当作身高，姓名里可以有空格 */
  function splitBySpace(text) {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const m = line.match(/^(.*\S)\s+(\d+(\.\d+)?\s*(cm|厘米|公分)?)$/i);
        return m ? [m[1], m[2]] : [line];
      });
  }

  /** 解析 CSV / TSV 文字（支持引号、引号里的逗号和换行）。分隔符按出现在最多行里的那个来定 */
  function parseDelimited(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    let delimiter = null;
    let best = 0;
    DELIMITERS.forEach((d) => {
      const n = lines.filter((l) => l.includes(d)).length;
      if (n > best) {
        best = n;
        delimiter = d;
      }
    });
    if (!delimiter) return splitBySpace(text);
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') {
          field += '"';
          i++;
        } else if (ch === '"') quoted = false;
        else field += ch;
      } else if (ch === '"' && field === '') quoted = true;
      else if (ch === delimiter) {
        row.push(field);
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else field += ch;
    }
    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  /** 带 BOM 的 UTF-16 文字（Excel 的“Unicode 文本”）；没有 BOM 时返回 null */
  function decodeUtf16(bytes) {
    const le = bytes[0] === 0xff && bytes[1] === 0xfe;
    const be = bytes[0] === 0xfe && bytes[1] === 0xff;
    if (!le && !be) return null;
    let out = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) out += String.fromCharCode(le ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1]);
    return out;
  }

  /** 选择要导入的工作表：易位导出的文件只读“学生名单”，其余文件读取所有工作表（跳过“座位表”） */
  function rosterRows(sheets) {
    const roster = sheets.filter((s) => s.name === '学生名单');
    const chosen = roster.length ? roster : sheets.filter((s) => s.name !== '座位表');
    const rows = [];
    (chosen.length ? chosen : sheets).forEach((sheet) => rows.push(...sheet.rows));
    return rows;
  }

  /**
   * 读取老师选择的名单文件，返回所有行。
   * 根据文件内容判断格式：.xlsx（zip）、旧版 .xls（不支持，提示另存）、CSV / 纯文本。
   */
  function readTable(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.length > 5 * 1024 * 1024) throw new XlsxError('文件太大了，请只保留姓名和身高两列');
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
      throw new XlsxError('暂不支持旧版 .xls 文件。请在 Excel 或 WPS 中“另存为” .xlsx，或复制名单后使用“粘贴名单”。');
    }
    try {
      if (bytes[0] === 0x50 && bytes[1] === 0x4b) return rosterRows(readWorkbook(bytes));
      let text = decodeUtf16(bytes);
      if (text === null) text = decodeUtf8(bytes);
      if (text === null && typeof TextDecoder !== 'undefined') {
        // Excel 在中文 Windows 上保存的 CSV 通常是 GBK 编码
        try {
          text = new TextDecoder('gbk').decode(bytes);
          if (/[\ufffd\u0000]/.test(text)) text = null;
        } catch (e) {
          text = null;
        }
      }
      if (text === null) throw new XlsxError('无法识别这个文件的编码。请另存为 .xlsx，或复制名单后使用“粘贴名单”。');
      return parseDelimited(text);
    } catch (e) {
      if (e instanceof XlsxError || e.expose) throw e;
      throw new XlsxError('无法读取这个文件，请确认是 Excel 表格（.xlsx）或 CSV 文件');
    }
  }

  return { write, readWorkbook, readTable, parseDelimited, decodeUtf8, columnName, XlsxError };
});
