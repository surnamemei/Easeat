// 此文件由 scripts/sync.js 从仓库根目录的 core/ 复制而来，请修改 core/ 中的原文件。
/**
 * 只读的座位表链接：把座位表压缩后放进网址（#view=...），不需要服务器。
 * 老师在小程序或网页里复制链接发给家长，家长在浏览器里打开网页版即可查看。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./fflate'));
  else root.EaseatShareLink = factory(root.fflate);
})(this, function (fflate) {
  const SITE_URL = 'https://surnamemei.github.io/Easeat/';
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const MAX_NAME = 20;

  function toBase64Url(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      const chars = [(n >> 18) & 63, (n >> 12) & 63, (n >> 6) & 63, n & 63].map((k) => ALPHABET[k]);
      out += chars.slice(0, i + 2 < bytes.length ? 4 : i + 1 < bytes.length ? 3 : 2).join('');
    }
    return out;
  }

  function fromBase64Url(text) {
    const values = [];
    for (const ch of text) {
      const k = ALPHABET.indexOf(ch);
      if (k < 0) throw new Error('bad character');
      values.push(k);
    }
    const bytes = [];
    for (let i = 0; i < values.length; i += 4) {
      const n = (values[i] << 18) | ((values[i + 1] || 0) << 12) | ((values[i + 2] || 0) << 6) | (values[i + 3] || 0);
      bytes.push((n >> 16) & 255);
      if (i + 2 < values.length) bytes.push((n >> 8) & 255);
      if (i + 3 < values.length) bytes.push(n & 255);
    }
    return new Uint8Array(bytes);
  }

  const cleanName = (v, max) => String(v === null || v === undefined ? '' : v).replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);

  /** data: { name, seats, arrangement, arrangedAt } → 链接里的编码 */
  function encode(data) {
    const payload = {
      v: 1,
      n: cleanName(data.name, 40),
      s: data.seats.map((row) => row.map((d) => (d ? '1' : '0')).join('')),
      a: data.arrangement.map((row) => row.map((x) => (x === null ? 0 : cleanName(x, MAX_NAME)))),
      t: data.arrangedAt || 0,
    };
    return toBase64Url(fflate.deflateSync(fflate.strToU8(JSON.stringify(payload)), { level: 9 }));
  }

  /** 解析链接里的编码；内容不对时抛出错误 */
  function decode(code) {
    let payload;
    try {
      payload = JSON.parse(fflate.strFromU8(fflate.inflateSync(fromBase64Url(code))));
    } catch (e) {
      throw new Error('链接不完整或已损坏，请让老师重新复制链接');
    }
    if (!payload || payload.v !== 1 || !Array.isArray(payload.s) || !Array.isArray(payload.a) || payload.s.length > 20) {
      throw new Error('链接不完整或已损坏，请让老师重新复制链接');
    }
    const seats = payload.s.map((row) => String(row).slice(0, 20).split('').map((c) => c === '1'));
    const arrangement = seats.map((row, r) =>
      row.map((desk, c) => {
        if (!desk) return null;
        const v = payload.a[r] && payload.a[r][c];
        return typeof v === 'string' ? cleanName(v, MAX_NAME) : '';
      })
    );
    return { name: cleanName(payload.n, 40) || '座位表', seats, arrangement, arrangedAt: Number(payload.t) || null };
  }

  function viewUrl(data, site) {
    return `${site || SITE_URL}#view=${encode(data)}`;
  }

  return { SITE_URL, encode, decode, viewUrl, toBase64Url, fromBase64Url };
});
