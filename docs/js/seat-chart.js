/**
 * 座位表的显示、导出和绘图。小程序和 GitHub Pages 上的网页演示共用这个文件。
 *
 * seats：教室布局（二维布尔数组），arrangement：座位表（与布局同形状的姓名数组，可以为空数组）。
 * flip 为 true 时以讲台视角显示：讲台在下方，左右也随之对调。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EaseatChart = factory();
})(this, function () {
  const GAP = 6; // 课桌之间的间距（rpx）
  const AISLE = 16; // 过道宽度（rpx）
  const MIN_FONT = 20;
  const MAX_FONT = 28;

  function columnCount(seats) {
    return seats.reduce((n, row) => Math.max(n, row.length), 0);
  }

  function isAisle(seats, c) {
    return !seats.some((row) => row[c]);
  }

  function matchesLayout(arrangement, seats) {
    if (!Array.isArray(arrangement) || arrangement.length !== seats.length) return false;
    return seats.every(
      (row, r) =>
        Array.isArray(arrangement[r]) &&
        arrangement[r].length === row.length &&
        row.every((desk, c) => (arrangement[r][c] === null) === !desk)
    );
  }

  /** 姓名的显示宽度：汉字算 1，字母数字算 0.58 */
  function textUnits(name) {
    let units = 0;
    for (const ch of String(name)) units += /[\u0000-ÿ]/.test(ch) ? 0.58 : 1;
    return units;
  }

  function fontSize(name, width, max, min) {
    if (!name) return 0;
    return Math.max(min, Math.min(max, Math.floor((width - 12) / textUnits(name))));
  }

  /**
   * 网格里姓名的字号：三个字以内的姓名统一字号、单行显示；更长的姓名分两行显示。
   * 返回 (name) => { size, wrap }
   */
  function nameStyler(names, deskWidth) {
    const fit = (units) => Math.floor((deskWidth - 10) / units);
    const short = names.map(textUnits).filter((u) => u <= 3);
    const base = Math.max(MIN_FONT, Math.min(MAX_FONT, short.length ? fit(Math.max(...short)) : MAX_FONT));
    return (name) => {
      const units = textUnits(name);
      if (fit(units) >= base) return { size: base, wrap: false };
      return { size: Math.max(16, Math.min(base, fit(Math.ceil(units / 2)))), wrap: true };
    };
  }

  function order(list, flip) {
    return flip ? list.slice().reverse() : list;
  }

  /**
   * 生成小程序页面用的网格数据，所有尺寸单位为 rpx。
   * 返回 { match, rows, deskWidth, totalWidth, scroll, desks, seated }
   */
  function buildGrid(seats, arrangement, options) {
    options = options || {};
    const width = options.width || 678;
    const cols = columnCount(seats);
    const aisles = [];
    for (let c = 0; c < cols; c++) aisles.push(isAisle(seats, c));
    const aisleCount = aisles.filter(Boolean).length;
    const deskCols = Math.max(cols - aisleCount, 1);
    const deskWidth = Math.max(64, Math.min(132, Math.floor((width - aisleCount * AISLE - cols * GAP) / deskCols)));
    const totalWidth = deskWidth * (cols - aisleCount) + aisleCount * AISLE + cols * GAP;
    const match = matchesLayout(arrangement, seats);
    const names = match ? [].concat(...arrangement).filter((v) => typeof v === 'string' && v) : [];
    const style = nameStyler(names, deskWidth);
    let desks = 0;
    let seated = 0;

    const rows = seats.map((row, r) => {
      const cells = [];
      for (let c = 0; c < cols; c++) {
        if (aisles[c]) cells.push({ key: c, type: 'aisle' });
        else if (!row[c]) cells.push({ key: c, type: 'none' });
        else {
          const value = match ? arrangement[r][c] : '';
          const name = typeof value === 'string' ? value : '';
          desks++;
          if (name) seated++;
          const { size, wrap } = name ? style(name) : { size: 0, wrap: false };
          cells.push({ key: c, r, c, type: name ? 'desk' : 'empty', name, size, wrap });
        }
      }
      return { key: r, cells: order(cells, options.flip) };
    });

    return { match, rows: order(rows, options.flip), deskWidth, aisleWidth: AISLE, totalWidth, scroll: totalWidth > width, desks, seated };
  }

  /** 名单中还没有座位的学生（同名的按人数计算） */
  function unseatedNames(students, arrangement, seats) {
    const count = new Map();
    if (matchesLayout(arrangement, seats)) {
      arrangement.forEach((row) =>
        row.forEach((name) => {
          if (typeof name === 'string' && name) count.set(name, (count.get(name) || 0) + 1);
        })
      );
    }
    const out = [];
    for (const s of students) {
      const n = count.get(s.name) || 0;
      if (n > 0) count.set(s.name, n - 1);
      else out.push(s.name);
    }
    return out;
  }

  /** 复制到 Excel / WPS：用制表符分隔，粘贴后每个名字自动占一个单元格 */
  function toTSV(title, arrangement, flip) {
    const rows = order(arrangement, flip).map((row) => order(row, flip).map((v) => (typeof v === 'string' ? v : '')).join('\t'));
    const podium = '（讲台）';
    return [title].concat(flip ? rows.concat(podium) : [podium].concat(rows)).join('\n');
  }

  // ------------------------------------------------------------ 生成图片（Canvas 2D）

  const IMG = { pad: 32, desk: 96, deskH: 52, gap: 10, aisle: 28, podiumH: 40, title: 30, sub: 16 };

  /** 图片尺寸（逻辑像素） */
  function measure(seats) {
    const cols = columnCount(seats);
    let width = 0;
    for (let c = 0; c < cols; c++) width += (isAisle(seats, c) ? IMG.aisle : IMG.desk) + (c ? IMG.gap : 0);
    width = Math.max(width, 360) + IMG.pad * 2;
    const grid = seats.length * IMG.deskH + Math.max(seats.length - 1, 0) * IMG.gap;
    const height = IMG.pad + IMG.title + 12 + IMG.sub + 28 + IMG.podiumH + 20 + grid + 40 + IMG.pad;
    return { width, height };
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';

  /**
   * 在 Canvas 2D 上画出座位表。调用前请按 measure() 的结果设置画布大小。
   * data: { title, subtitle, footer, seats, arrangement, flip }
   */
  function draw(ctx, data) {
    const { seats, flip } = data;
    const arrangement = matchesLayout(data.arrangement, seats) ? data.arrangement : [];
    const { width, height } = measure(seats);
    const cols = columnCount(seats);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let y = IMG.pad;
    ctx.fillStyle = '#1f2933';
    ctx.font = `600 ${IMG.title}px ${FONT}`;
    ctx.fillText(data.title || '座位表', width / 2, y + IMG.title / 2);
    y += IMG.title + 12;
    ctx.fillStyle = '#6b7785';
    ctx.font = `${IMG.sub}px ${FONT}`;
    ctx.fillText(data.subtitle || '', width / 2, y + IMG.sub / 2);
    y += IMG.sub + 28;

    const drawPodium = (top) => {
      ctx.fillStyle = '#e8f5f8';
      roundRect(ctx, width / 2 - 90, top, 180, IMG.podiumH, 10);
      ctx.fill();
      ctx.fillStyle = '#1683c0';
      ctx.font = `600 18px ${FONT}`;
      ctx.fillText('讲 台', width / 2, top + IMG.podiumH / 2);
    };

    if (!flip) {
      drawPodium(y);
      y += IMG.podiumH + 20;
    }

    // 每列的横坐标
    const xs = [];
    let gridWidth = 0;
    for (let c = 0; c < cols; c++) gridWidth += (isAisle(seats, c) ? IMG.aisle : IMG.desk) + (c ? IMG.gap : 0);
    let x = (width - gridWidth) / 2;
    const colOrder = order(Array.from({ length: cols }, (_, c) => c), flip);
    for (const c of colOrder) {
      xs[c] = x;
      x += (isAisle(seats, c) ? IMG.aisle : IMG.desk) + IMG.gap;
    }

    order(Array.from({ length: seats.length }, (_, r) => r), flip).forEach((r) => {
      for (let c = 0; c < cols; c++) {
        if (!seats[r][c]) continue;
        const name = (arrangement[r] && typeof arrangement[r][c] === 'string' && arrangement[r][c]) || '';
        roundRect(ctx, xs[c], y, IMG.desk, IMG.deskH, 8);
        ctx.fillStyle = name ? '#eef7fc' : '#ffffff';
        ctx.fill();
        ctx.strokeStyle = name ? '#a9d6ee' : '#d5dde5';
        ctx.lineWidth = 1;
        ctx.stroke();
        if (name) {
          ctx.fillStyle = '#1f2933';
          ctx.font = `${fontSize(name, IMG.desk, 20, 11)}px ${FONT}`;
          ctx.fillText(name, xs[c] + IMG.desk / 2, y + IMG.deskH / 2, IMG.desk - 8);
        }
      }
      y += IMG.deskH + IMG.gap;
    });

    if (flip) {
      y += 10;
      drawPodium(y);
      y += IMG.podiumH;
    }

    ctx.fillStyle = '#9aa5b1';
    ctx.font = `13px ${FONT}`;
    ctx.fillText(data.footer || '易位 eaSEAT · 一键排座位', width / 2, height - IMG.pad / 2 - 6);
    return { width, height };
  }

  return { buildGrid, unseatedNames, matchesLayout, toTSV, measure, draw };
});
