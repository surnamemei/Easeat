/**
 * 只读的座位表链接：把座位表压缩后放进网址（#view=...），不需要服务器。
 * 老师在小程序或网页里复制链接发给家长，家长在浏览器里打开网页版即可查看。
 *
 * 同样的压缩方式也用于“复制备份内容”（packBackup / unpackBackup），复制的文字比原始 JSON 短得多。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./fflate'));
  else root.EaseatShareLink = factory(root.fflate);
})(this, function (fflate) {
  const SITE_URL = 'https://surnamemei.github.io/Easeat/';
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const MAX_NAME = 20;
  const MAX_CODE = 20000;
  const MAX_VIEW_BYTES = 200 * 1024;
  const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
  const BACKUP_PREFIX = 'EASEAT1:';

  /** 解压，超过 limit 字节时报错（防止特意构造的链接让页面卡死） */
  function inflateLimited(bytes, limit) {
    const out = fflate.inflateSync(bytes, { out: new Uint8Array(limit + 1) });
    if (out.length > limit) throw new Error('too large');
    return out;
  }

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
      if (String(code).length > MAX_CODE) throw new Error('too long');
      payload = JSON.parse(fflate.strFromU8(inflateLimited(fromBase64Url(code), MAX_VIEW_BYTES)));
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

  /** 备份 → 一段可以复制粘贴的文字 */
  function packBackup(backup) {
    return BACKUP_PREFIX + toBase64Url(fflate.deflateSync(fflate.strToU8(JSON.stringify(backup)), { level: 9 }));
  }

  /** 粘贴的备份文字（压缩过的，或者原始 JSON）→ 备份对象；格式不对时抛出错误 */
  function unpackBackup(text) {
    const t = String(text || '').trim();
    if (!t.startsWith(BACKUP_PREFIX)) return JSON.parse(t);
    const code = t.slice(BACKUP_PREFIX.length).replace(/\s+/g, '');
    return JSON.parse(fflate.strFromU8(inflateLimited(fromBase64Url(code), MAX_BACKUP_BYTES)));
  }

  return { SITE_URL, encode, decode, viewUrl, packBackup, unpackBackup, toBase64Url, fromBase64Url };
});
