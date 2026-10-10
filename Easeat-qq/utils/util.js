const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

const pad = (n) => (n < 10 ? '0' + n : String(n));

/** 时间戳 → “10月12日 周一 06:00”，不是今年时带上年份 */
function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const year = d.getFullYear() === new Date().getFullYear() ? '' : d.getFullYear() + '年';
  return `${year}${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAYS[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function readStorage(key, fallback) {
  try {
    const v = qq.getStorageSync(key);
    return v === '' || v === undefined ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    qq.setStorageSync(key, value);
  } catch (e) {
    console.warn('setStorage', e);
  }
}

module.exports = { formatTime, readStorage, writeStorage };
