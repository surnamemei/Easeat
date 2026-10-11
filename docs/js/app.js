/**
 * 易位 eaSEAT 网页版（现在唯一继续维护的版本）。js/core/ 由 scripts/sync.js 从仓库的 core/ 复制，
 * 数据保存在浏览器的 localStorage 里，不需要服务器。
 *
 * 页面：#/ 我的班级，#/class/<id> 班级，#/about 关于，#view=<编码> 老师分享的只读座位表。
 */
(function () {
  'use strict';

  const chart = window.EaseatChart;
  const xlsx = window.EaseatXlsx;
  const shareLink = window.EaseatShareLink;
  const demo = window.EaseatDemo;
  const MODES = window.EaseatArrange.MODES;
  const MODE_DESC = {
    height: '矮的同学坐前面；身高相近的同学每次随机交换位置。',
    random: '不考虑身高，所有人随机就座。',
    rotate: '每个大组整体向右移一组（最右边的组移到最左边），前后排和同桌都不变。',
  };
  const USER = 'local';
  const PREFIX = 'easeat:';
  const MAX_ROWS = 20;
  const MAX_COLS = 20;
  const DEFAULT_LAYOUT = Array.from({ length: 6 }, () => [true, true, false, true, true, false, true, true, false, true, true]);
  const inWeChat = /MicroMessenger/i.test(navigator.userAgent);

  // ------------------------------------------------------------ 数据

  const storage = (() => {
    try {
      const k = PREFIX + 'test';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return localStorage;
    } catch (e) {
      return null;
    }
  })();
  const memory = {};
  const db = window.EaseatLocalDB.createLocalDatabase({
    load(name) {
      try {
        const raw = storage ? storage.getItem(PREFIX + name) : memory[name];
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },
    save(name, docs) {
      const raw = JSON.stringify(docs);
      if (storage) storage.setItem(PREFIX + name, raw);
      else memory[name] = raw;
    },
  });
  const service = window.EaseatService.createService({
    db,
    autoOnOpen: true,
    internalError: '保存失败：浏览器的存储空间可能已满，或者禁止了网站保存数据。',
  });

  async function call(action, data) {
    // 每次都重新读取保存的数据：另一个标签页可能刚刚修改过
    db.reset();
    const res = await service.call(action, JSON.parse(JSON.stringify(data || {})), USER);
    if (!res.ok) {
      await ui.alert(res.msg);
      return null;
    }
    return res.data === undefined || res.data === null ? true : res.data;
  }

  function pref(key, fallback) {
    try {
      const v = storage && storage.getItem(PREFIX + 'pref:' + key);
      return v === null || v === undefined ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  }

  function setPref(key, value) {
    try {
      if (storage) storage.setItem(PREFIX + 'pref:' + key, JSON.stringify(value));
    } catch (e) {
      /* 只是界面偏好，保存失败不影响使用 */
    }
  }

  // ------------------------------------------------------------ 小工具

  const app = document.getElementById('app');
  const esc = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const year = d.getFullYear() === new Date().getFullYear() ? '' : d.getFullYear() + '年';
    return `${year}${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAYS[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function dateStamp(ts) {
    const d = new Date(ts || Date.now());
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function download(blob, fileName) {
    if (inWeChat) {
      return ui.alert('微信内置浏览器不能下载文件。请点右上角「···」，选择「在浏览器打开」后再下载。');
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (err) {
        ok = false;
      }
      ta.remove();
      return ok;
    }
  }

  /** 让用户选择一个文件，返回 { name, bytes }；取消时返回 null */
  function pickFile(accept) {
    const input = document.getElementById('file-input');
    input.value = '';
    input.accept = accept;
    return new Promise((resolve) => {
      input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, bytes: new Uint8Array(reader.result) });
        reader.onerror = () => resolve(null);
        reader.readAsArrayBuffer(file);
      };
      input.click();
    });
  }

  // ------------------------------------------------------------ 对话框和提示

  const ui = {
    toast(text) {
      const el = document.getElementById('toast');
      el.textContent = text;
      el.hidden = false;
      clearTimeout(ui.toastTimer);
      ui.toastTimer = setTimeout(() => (el.hidden = true), 2400);
    },

    /** 通用对话框：返回点击的按钮值；输入框的值在 result.value */
    modal({ title, message, input, textarea, image, buttons }) {
      const root = document.getElementById('modal-root');
      const previous = document.activeElement;
      return new Promise((resolve) => {
        root.innerHTML = `
          <div class="modal-backdrop">
            <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
              <h2 id="modal-title">${esc(title)}</h2>
              ${message ? `<p>${esc(message)}</p>` : ''}
              ${input ? `<input type="text" id="modal-input" maxlength="${input.maxlength || 20}" placeholder="${esc(input.placeholder || '')}" value="${esc(input.value || '')}" aria-label="${esc(title)}">` : ''}
              ${textarea ? `<textarea id="modal-input" placeholder="${esc(textarea.placeholder || '')}" ${textarea.readonly ? 'readonly' : ''} aria-label="${esc(title)}">${esc(textarea.value || '')}</textarea>` : ''}
              ${image ? `<img src="${image}" alt="座位表图片">` : ''}
              <div class="btn-row">
                ${buttons.map((b, i) => `<button type="button" class="btn ${b.kind || ''}" data-i="${i}">${esc(b.text)}</button>`).join('')}
              </div>
            </div>
          </div>`;
        const field = root.querySelector('#modal-input');
        const finish = (i) => {
          const value = field ? field.value.trim() : undefined;
          root.innerHTML = '';
          document.removeEventListener('keydown', onKey, true);
          if (previous && previous.focus) previous.focus();
          resolve({ value, choice: i === null ? null : buttons[i].value });
        };
        const onKey = (e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            finish(null);
          } else if (e.key === 'Enter' && field && field.tagName === 'INPUT' && document.activeElement === field) {
            e.preventDefault();
            finish(buttons.length - 1);
          }
        };
        document.addEventListener('keydown', onKey, true);
        root.querySelectorAll('button[data-i]').forEach((btn) => btn.addEventListener('click', () => finish(Number(btn.dataset.i))));
        root.querySelector('.modal-backdrop').addEventListener('click', (e) => e.target === e.currentTarget && finish(null));
        if (field && textarea && textarea.readonly) field.select();
        (field || root.querySelector('.btn-row .btn:last-child')).focus();
      });
    },

    async alert(message, title) {
      await ui.modal({ title: title || '提示', message, buttons: [{ text: '知道了', kind: 'primary', value: true }] });
    },

    async confirm(message, title, okText, danger) {
      const r = await ui.modal({
        title,
        message,
        buttons: [
          { text: '取消', value: false },
          { text: okText || '确定', kind: danger ? 'danger' : 'primary', value: true },
        ],
      });
      return r.choice === true;
    },

    async prompt(title, options) {
      const r = await ui.modal({
        title,
        message: options.message,
        input: options,
        buttons: [
          { text: '取消', value: false },
          { text: options.okText || '确定', kind: 'primary', value: true },
        ],
      });
      return r.choice === true ? r.value : null;
    },
  };

  // ------------------------------------------------------------ 座位表

  function columnCount(seats) {
    return seats.reduce((n, row) => Math.max(n, row.length), 0);
  }

  function isAisle(seats, c) {
    return !seats.some((row) => row[c]);
  }

  /** 座位表的 HTML。editable 时课桌是可以点击的按钮 */
  function chartHtml(seats, arrangement, opts) {
    const cols = columnCount(seats);
    const match = chart.matchesLayout(arrangement, seats);
    const order = (list) => (opts.flip ? list.slice().reverse() : list);
    const colIdx = order(Array.from({ length: cols }, (_, c) => c));
    const template = colIdx.map((c) => (isAisle(seats, c) ? 'var(--aisle, 12px)' : 'minmax(var(--desk-min), 1fr)')).join(' ');
    const sel = opts.selected;
    const cells = [];
    order(Array.from({ length: seats.length }, (_, r) => r)).forEach((r) => {
      colIdx.forEach((c) => {
        if (isAisle(seats, c)) return cells.push('<span class="seat aisle"></span>');
        if (!seats[r][c]) return cells.push('<span class="seat none"></span>');
        const name = match && typeof arrangement[r][c] === 'string' ? arrangement[r][c] : '';
        const cls = `seat ${name ? 'desk' : 'empty'}${sel && sel.r === r && sel.c === c ? ' selected' : ''}`;
        if (!opts.editable) return cells.push(`<span class="${cls}">${esc(name)}</span>`);
        const label = name ? `${name}，第 ${r + 1} 排` : `空座位，第 ${r + 1} 排`;
        cells.push(`<button type="button" class="${cls}" data-action="seat" data-r="${r}" data-c="${c}" aria-label="${esc(label)}">${esc(name)}</button>`);
      });
    });
    const podium = `<div class="podium${opts.flip ? ' bottom' : ''}">讲台</div>`;
    return `<div class="chart-scroll"><div class="chart">
      ${opts.flip ? '' : podium}
      <div class="seat-grid" style="grid-template-columns:${template}">${cells.join('')}</div>
      ${opts.flip ? podium : ''}
    </div></div>`;
  }

  /** 根据课桌宽度调整姓名字号：三个字的姓名放得下、又尽量大 */
  function fitSeatFonts() {
    document.querySelectorAll('.seat-grid').forEach((grid) => {
      const desk = grid.querySelector('.seat.desk, .seat.empty');
      if (!desk) return;
      const width = desk.getBoundingClientRect().width;
      grid.style.setProperty('--seat-font', `${Math.max(10, Math.min(16, Math.floor((width - 6) / 3)))}px`);
    });
  }
  window.addEventListener('resize', fitSeatFonts);

  function chartImage(data) {
    const size = chart.measure(data.seats);
    const ratio = Math.min(2, 4000 / size.width, 4000 / size.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(size.width * ratio);
    canvas.height = Math.round(size.height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    chart.draw(ctx, data);
    return canvas;
  }

  async function exportImage(data, fileName) {
    const canvas = chartImage(data);
    if (inWeChat) {
      // 微信内置浏览器不能下载：显示图片，长按保存
      await ui.modal({ title: '长按图片保存', image: canvas.toDataURL('image/png'), buttons: [{ text: '关闭', value: true }] });
      return;
    }
    canvas.toBlob((blob) => download(blob, fileName), 'image/png');
  }

  function exportExcel(sheets, fileName) {
    const bytes = xlsx.write(sheets);
    download(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
  }

  function siteUrl() {
    return /^https?:$/.test(location.protocol) ? location.origin + location.pathname : shareLink.SITE_URL;
  }

  // ------------------------------------------------------------ 页面状态

  const state = {
    route: '',
    flip: pref('flip', false),
    tab: pref('tab', 'roster'),
    cls: null,
    selected: null,
    draft: null,
    showPaste: false,
    unresolved: 0,
    view: null,
  };

  function setNav(name) {
    document.querySelectorAll('[data-nav]').forEach((a) => {
      if (a.dataset.nav === name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  async function route() {
    const hash = location.hash || '#/';
    state.selected = null;
    if (hash.startsWith('#view=')) return showView(hash.slice(6));
    const m = /^#\/class\/([0-9a-z]+)/.exec(hash);
    if (m) return showClass(m[1], true);
    if (hash.startsWith('#/about')) return showAbout();
    return showHome();
  }

  // ------------------------------------------------------------ 首页

  async function showHome() {
    setNav('home');
    document.title = '我的班级 · 易位 eaSEAT';
    const data = await call('exportData');
    if (!data) return;
    const list = data.classes.slice().reverse();
    const cards = list
      .map((c) => {
        const seated = chart.matchesLayout(c.arrangement, c.seats) ? [].concat(...c.arrangement).filter(Boolean).length : 0;
        const meta = [`${c.students.length} 名学生`, c.arrangedAt ? `上次排座 ${formatTime(c.arrangedAt)}` : seated ? '' : '还没有排座'].filter(Boolean).join(' · ');
        return `<a class="class-card" href="#/class/${esc(c.id)}"><h3>${esc(c.name)}</h3><div class="meta">${esc(meta)}</div></a>`;
      })
      .join('');

    app.innerHTML = `
      <section class="intro">
        <div>
          <h1>帮老师自动排座位</h1>
          <p>录入学生名单、画好教室布局，一键按身高、随机或大组轮换排好座位；可以指定不坐在一起的同学，导出 Excel 和图片。不需要安装，打开网页就能用，数据只保存在你的浏览器里。</p>
        </div>
      </section>
      ${storage ? '' : '<p class="notice" style="margin-bottom:16px">这个浏览器不允许网站保存数据（可能是无痕模式），关闭页面后数据会丢失。请记得导出备份。</p>'}
      <div class="home-actions">
        <button class="btn primary" data-action="create-class">新建班级</button>
        <button class="btn soft" data-action="create-demo">打开示例班级</button>
        <button class="btn" data-action="import-backup">导入备份文件</button>
        <button class="btn" data-action="paste-backup">粘贴备份内容</button>
        <button class="btn" data-action="export-backup" ${list.length ? '' : 'disabled'}>导出备份</button>
      </div>
      ${
        list.length
          ? `<div class="class-grid">${cards}</div>`
          : `<div class="empty-state"><img src="assets/empty.png" alt=""><p>还没有班级。点「新建班级」开始，或者先打开示例班级看看。</p></div>`
      }
      <p class="storage-note">班级数据只保存在这个浏览器里，不会上传。换电脑或清理浏览器数据前，请先导出备份。</p>`;
  }

  // ------------------------------------------------------------ 班级页

  async function showClass(id, first) {
    setNav('home');
    // open：只有打开班级时才检查本周的自动重排，操作后的刷新不检查
    const cls = await call('getClass', { classId: id, open: first });
    if (!cls) {
      location.hash = '#/';
      return;
    }
    if (cls.autoArranged) ui.toast('本周已自动重排');
    if (first) {
      state.draft = null;
      state.showPaste = false;
      state.unresolved = 0;
    }
    state.cls = cls;
    document.title = `${cls.name} · 易位 eaSEAT`;
    renderClass();
  }

  async function reload() {
    await showClass(state.cls.id, false);
  }

  function renderClass() {
    const cls = state.cls;
    const hasLayout = cls.seats.length > 0;
    const match = chart.matchesLayout(cls.arrangement, cls.seats);
    const seatedNames = match ? [].concat(...cls.arrangement).filter(Boolean) : [];
    const unseated = match ? chart.unseatedNames(cls.students, cls.arrangement, cls.seats) : [];
    const desks = cls.seats.reduce((n, row) => n + row.filter(Boolean).length, 0);
    const mode = cls.settings.mode;
    const sel = state.selected;

    let hint;
    if (!hasLayout) hint = '<p class="chart-hint notice">还没有设置教室布局，请在右边的「教室布局」里设置课桌。</p>';
    else if (!match && cls.arrangement.length) hint = '<p class="chart-hint notice">教室布局修改过，原来的座位表对不上了，请重新排座。</p>';
    else if (!seatedNames.length) hint = '<p class="chart-hint">还没有排座位。添加学生后点「重新排座」，也可以点座位手动填写姓名。</p>';
    else if (unseated.length) hint = `<p class="chart-hint notice">${unseated.length} 名学生还没有座位：${esc(unseated.slice(0, 8).join('、'))}${unseated.length > 8 ? ' 等' : ''}。点「重新排座」安排，或选中空座位填写姓名。</p>`;
    else if (!sel) hint = '<p class="chart-hint">点一个座位选中，再点另一个座位即可交换</p>';
    else hint = '';
    if (state.unresolved) hint += `<p class="chart-hint notice">座位比较紧张，有 ${state.unresolved} 组“不相邻”的同学仍然挨着坐，可以手动交换座位或增加课桌。</p>`;

    const selName = sel && match ? cls.arrangement[sel.r][sel.c] : '';
    app.innerHTML = `
      <a class="crumb" href="#/">‹ 我的班级</a>
      <div class="class-head">
        <div>
          <h1>${esc(cls.name)}</h1>
          <div class="meta">${cls.students.length} 名学生 · ${desks} 张课桌${cls.arrangedAt ? ` · ${formatTime(cls.arrangedAt)} ${cls.arrangedBy === 'auto' ? '自动重排' : '排座'}` : ''}</div>
        </div>
        <div class="btn-row">
          <button class="btn small" data-action="rename">改名</button>
          <button class="btn small danger" data-action="delete-class">删除班级</button>
        </div>
      </div>
      <div class="workspace">
        <section class="card" aria-labelledby="chart-title">
          <div class="card-head">
            <h2 id="chart-title">座位表</h2>
            ${hasLayout ? `<button class="btn small soft" data-action="flip" aria-pressed="${state.flip}">${state.flip ? '切换为学生视角' : '切换为讲台视角'}</button>` : ''}
          </div>
          ${hasLayout ? chartHtml(cls.seats, cls.arrangement, { flip: state.flip, editable: true, selected: sel }) : ''}
          ${
            sel
              ? `<div class="select-bar"><span>已选中「${esc(selName || '空座位')}」，点另一个座位和它交换</span>
                 <button class="btn small soft" data-action="edit-seat">改姓名</button>
                 <button class="btn small" data-action="clear-selection">取消</button></div>`
              : ''
          }
          ${hint}
          <div class="segmented" role="group" aria-label="排座方式">
            ${Object.keys(MODES)
              .map((k) => `<button type="button" data-action="mode" data-mode="${k}" aria-pressed="${mode === k}">${MODES[k]}</button>`)
              .join('')}
          </div>
          <p class="mode-desc">${MODE_DESC[mode]}</p>
          <button class="btn primary block" data-action="arrange">重新排座</button>
          <div class="export-row">
            <button class="btn small soft" data-action="export-image" ${seatedNames.length ? '' : 'disabled'}>下载图片</button>
            <button class="btn small soft" data-action="export-excel" ${seatedNames.length ? '' : 'disabled'}>下载 Excel</button>
            <button class="btn small soft" data-action="copy-table" ${seatedNames.length ? '' : 'disabled'}>复制表格</button>
            <button class="btn small soft" data-action="copy-link" ${seatedNames.length ? '' : 'disabled'}>复制查看链接</button>
          </div>
        </section>
        <section class="card">
          <div class="tabs" role="tablist">
            ${[
              ['roster', `学生名单（${cls.students.length}）`],
              ['rules', '排座规则'],
              ['layout', '教室布局'],
            ]
              .map(([k, label]) => `<button role="tab" data-action="tab" data-tab="${k}" aria-selected="${state.tab === k}">${label}</button>`)
              .join('')}
          </div>
          ${state.tab === 'roster' ? rosterHtml(cls) : state.tab === 'rules' ? rulesHtml(cls) : layoutHtml(cls)}
        </section>
      </div>`;
    fitSeatFonts();
  }

  function rosterHtml(cls) {
    return `
      <form class="add-row" data-form="add-student">
        <input type="text" name="name" maxlength="20" placeholder="姓名" aria-label="姓名" required>
        <input type="number" name="height" min="50" max="250" step="0.1" placeholder="身高(选填)" aria-label="身高（厘米，选填）">
        <button class="btn primary">添加</button>
      </form>
      <div class="roster-actions">
        <button class="btn small soft" data-action="toggle-paste">${state.showPaste ? '收起' : '粘贴名单'}</button>
        <button class="btn small soft" data-action="import-roster">导入 Excel / CSV</button>
      </div>
      ${
        state.showPaste
          ? `<form data-form="paste-roster">
              <label class="field" for="paste-text">每行一个学生：姓名 身高（身高可不填）。可以直接从 Excel 复制“姓名、身高”两列。</label>
              <textarea id="paste-text" name="text" placeholder="张三 165&#10;李四 158"></textarea>
              <button class="btn primary block" style="margin-top:8px">添加这些学生</button>
            </form>`
          : ''
      }
      <p class="muted small">导入 Excel 时第一列写姓名、第二列写身高（厘米），有没有标题和表头都可以。旧版 .xls 请先另存为 .xlsx。</p>
      ${
        cls.students.length
          ? `<ol class="student-list">${cls.students
              .map(
                (s, i) =>
                  `<li><span class="no">${i + 1}</span><span>${esc(s.name)}</span><span class="h">${s.height ? s.height + ' cm' : '—'}</span><button class="link-btn" data-action="delete-student" data-id="${s.id}" aria-label="删除 ${esc(s.name)}">删除</button></li>`
              )
              .join('')}</ol>`
          : '<p class="muted" style="margin-top:12px">名单还是空的。</p>'
      }`;
  }

  function rulesHtml(cls) {
    const nameOf = new Map(cls.students.map((s) => [s.id, s.name]));
    const options = cls.students.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    return `
      <div class="switch-row">
        <div>
          <h3 style="font-size:16px">每周自动重排</h3>
          <p class="muted small">每周一 6:00 以后第一次打开这个班级时，按「${MODES[cls.settings.mode]}」自动重新排座。</p>
        </div>
        <label class="switch"><input type="checkbox" data-action="auto-weekly" ${cls.settings.autoWeekly ? 'checked' : ''} aria-label="每周自动重排"><span></span></label>
      </div>
      <div class="section-gap">
        <h3 style="font-size:16px">不相邻的同学</h3>
        <p class="muted small">排座时让这些同学既不做同桌，也不坐前后桌。</p>
        <ul class="pair-list">${cls.settings.separate
          .map(([a, b]) => `<li><span>${esc(nameOf.get(a))} ↔ ${esc(nameOf.get(b))}</span><button class="link-btn" data-action="remove-pair" data-pair="${a}-${b}">移除</button></li>`)
          .join('')}</ul>
        ${
          cls.students.length >= 2
            ? `<form class="pair-add" data-form="add-pair">
                <select name="a" aria-label="第一位同学"><option value="">选择同学</option>${options}</select>
                <span class="arrow muted">↔</span>
                <select name="b" aria-label="第二位同学"><option value="">选择同学</option>${options}</select>
                <button class="btn primary">添加</button>
              </form>`
            : '<p class="muted small">先在「学生名单」里添加学生。</p>'
        }
      </div>`;
  }

  function layoutHtml(cls) {
    if (!state.draft) state.draft = (cls.seats.length ? cls.seats : DEFAULT_LAYOUT).map((row) => row.slice());
    const draft = state.draft;
    const cols = draft[0].length;
    const desks = draft.reduce((n, row) => n + row.filter(Boolean).length, 0);
    const changed = JSON.stringify(draft) !== JSON.stringify(cls.seats);
    // 格子大小按可用宽度计算，手机上也不会撑出屏幕
    const room = Math.min(app.clientWidth - 80, 440);
    const size = Math.max(12, Math.min(34, Math.floor((room - (cols - 1) * 5) / cols)));
    return `
      <p class="muted small">点格子切换：蓝色是课桌，灰色是空地。整列空着的地方是过道，用来划分大组。</p>
      <div class="steppers">
        <div class="stepper"><span>排数</span>
          <button class="btn small" data-action="rows" data-delta="-1" aria-label="减少一排">−</button>
          <output>${draft.length}</output>
          <button class="btn small" data-action="rows" data-delta="1" aria-label="增加一排">＋</button></div>
        <div class="stepper"><span>列数</span>
          <button class="btn small" data-action="cols" data-delta="-1" aria-label="减少一列">−</button>
          <output>${cols}</output>
          <button class="btn small" data-action="cols" data-delta="1" aria-label="增加一列">＋</button></div>
      </div>
      <div class="podium" style="width:140px">讲台</div>
      <div class="layout-scroll"><div class="layout-grid" style="grid-template-columns:repeat(${cols}, ${size}px)">
        ${draft
          .map((row, r) =>
            row.map((on, c) => `<button type="button" class="cell-toggle" data-action="toggle-desk" data-r="${r}" data-c="${c}" aria-pressed="${on}" aria-label="第 ${r + 1} 排第 ${c + 1} 列${on ? '：课桌' : '：空地'}"></button>`).join('')
          )
          .join('')}
      </div></div>
      <p class="layout-count">共 ${desks} 张课桌 · ${cls.students.length} 名学生</p>
      <div class="btn-row" style="justify-content:flex-end">
        <button class="btn" data-action="reset-layout" ${changed ? '' : 'disabled'}>还原</button>
        <button class="btn primary" data-action="save-layout" ${changed ? '' : 'disabled'}>保存布局</button>
      </div>`;
  }

  // ------------------------------------------------------------ 只读查看页

  function showView(code) {
    setNav('');
    let data;
    try {
      data = shareLink.decode(code);
    } catch (e) {
      app.innerHTML = `<div class="empty-state"><p>${esc(e.message)}</p><p style="margin-top:12px"><a href="#/">打开易位</a></p></div>`;
      return;
    }
    state.view = data;
    document.title = `${data.name} 座位表 · 易位 eaSEAT`;
    renderView();
  }

  function renderView() {
    const data = state.view;
    app.innerHTML = `
      <div class="view-head">
        <h1>${esc(data.name)} 座位表</h1>
        <p class="muted">${data.arrangedAt ? `排座时间：${formatTime(data.arrangedAt)} · ` : ''}这是老师分享的座位表快照，不会自动更新。</p>
      </div>
      <section class="card">
        <div class="card-head">
          <h2>座位表</h2>
          <button class="btn small soft" data-action="view-flip" aria-pressed="${state.flip}">${state.flip ? '切换为学生视角' : '切换为讲台视角'}</button>
        </div>
        ${chartHtml(data.seats, data.arrangement, { flip: state.flip, editable: false })}
        <div class="export-row" style="margin-top:16px">
          <button class="btn small soft" data-action="view-image">下载图片</button>
          <button class="btn small soft" data-action="view-excel">下载 Excel</button>
          <button class="btn small soft" data-action="view-table">复制表格</button>
          <a class="btn small" href="#/">用易位排座位</a>
        </div>
      </section>`;
    fitSeatFonts();
  }

  // ------------------------------------------------------------ 关于

  function showAbout() {
    setNav('about');
    document.title = '关于 · 易位 eaSEAT';
    app.innerHTML = `
      <div class="about">
        <section>
          <h2>易位 eaSEAT</h2>
          <p class="sub">帮老师自动排座位的网页。录入名单、画好教室布局，一键排好座位，导出 Excel 或图片发给学生和家长。</p>
          <div class="feature-grid">
            ${[
              ['按身高排座', '矮的同学坐前面；身高相近的同学每次随机交换位置，没填身高的同学随机安排。'],
              ['大组轮换', '每个大组整体向右移一组，最右边的组移到最左边，同桌和前后排都不变。'],
              ['不相邻名单', '指定两位同学，排座时他们既不做同桌，也不坐前后桌。'],
              ['每周自动重排', '每周一以后第一次打开班级时自动换座位。'],
              ['点选交换', '点一个座位、再点另一个，两人就换了位置；也可以直接修改座位上的姓名。'],
              ['导出与分享', '下载可以直接打印的 Excel、座位表图片，或复制只读链接发给学生和家长。'],
            ]
              .map(([t, d]) => `<div class="feature"><h3>${t}</h3><p>${d}</p></div>`)
              .join('')}
          </div>
        </section>
        <section>
          <h2>小程序版（已存档）</h2>
          <p class="sub">易位最早是微信和 QQ 小程序。2.0 版的小程序在微信和 QQ 开发者工具中测试完成后存档，没有公开发布；以后只更新网页版。小程序的代码保存在 <a href="https://github.com/surnamemei/Easeat/releases/tag/v2.0">2.0 存档</a> 中，它导出的备份文件可以导入网页版。</p>
          <div class="shots">
            <figure class="shot"><div class="frame"><img src="assets/screens/home.png" alt="小程序首页" loading="lazy" width="750" height="1100"></div><figcaption>首页</figcaption></figure>
            <figure class="shot"><div class="frame"><img src="assets/screens/class.png" alt="小程序座位表" loading="lazy"></div><figcaption>座位表</figcaption></figure>
            <figure class="shot"><div class="frame"><img src="assets/screens/export.png" alt="小程序导出" loading="lazy"></div><figcaption>导出</figcaption></figure>
          </div>
        </section>
        <section>
          <h2>排座是怎么算的</h2>
          <p class="sub">算法在 <a href="https://github.com/surnamemei/Easeat/blob/master/core/arrange.js"><code>core/arrange.js</code></a>，网页版和存档的小程序用的是同一套算法，并有自动化测试。</p>
          <div class="feature-grid">
            <div class="feature"><h3>按身高</h3><p>给每位同学的身高加上 ±3 厘米的随机扰动后从矮到高排序，从第一排开始依次坐满；同一排内左右位置随机。</p></div>
            <div class="feature"><h3>大组轮换</h3><p>整列没有课桌的地方是过道，把教室分成几个大组。每一排里，每个大组的同学整体搬到右边一组；课桌数不同时，多出来的同学坐到同一排最近的空位。</p></div>
            <div class="feature"><h3>不相邻名单</h3><p>排好后检查“不相邻”的同学是否同桌或前后桌；如果是，就和别人交换，优先在同一排里换，尽量不打乱身高顺序。</p></div>
          </div>
        </section>
        <section>
          <h2>作者</h2>
          <p class="sub">易位最初是武汉英中高级中学学生的作品。</p>
          <div class="credits">
            <div class="credit"><b>Wenbo Zhang</b><span class="muted">开发了 QQ 小程序原版（<a href="https://github.com/surnamemei/Easeat/releases/tag/v1.0">1.0 原版存档</a>）</span></div>
            <div class="credit"><b>surnamemei</b><span class="muted">移植到微信，并负责后续维护</span></div>
          </div>
        </section>
        <section>
          <h2>隐私</h2>
          <p class="sub">网页版的所有数据只保存在你的浏览器里，不会上传到任何服务器。导入的 Excel 在浏览器里读取。复制的查看链接里包含座位表上的姓名，请只发给需要的人。</p>
          <p><a href="https://github.com/surnamemei/Easeat">在 GitHub 上查看源代码</a></p>
        </section>
      </div>`;
  }

  // ------------------------------------------------------------ 操作

  const actions = {
    async 'create-class'() {
      const name = await ui.prompt('新建班级', { placeholder: '班级名称，如：高一（3）班', maxlength: 20, okText: '创建' });
      if (!name) return;
      const res = await call('createClass', { name });
      if (res) location.hash = `#/class/${res.id}`;
    },

    async 'create-demo'() {
      const list = (await call('listClasses')) || [];
      const existing = list.find((c) => c.name === demo.NAME);
      if (existing) {
        location.hash = `#/class/${existing.id}`;
        return;
      }
      const res = await call('createClass', { name: demo.NAME });
      if (!res) return;
      await call('addStudents', { classId: res.id, text: demo.ROSTER });
      await call('arrange', { classId: res.id, mode: 'height' });
      location.hash = `#/class/${res.id}`;
    },

    async 'export-backup'() {
      const data = await call('exportData');
      if (!data) return;
      if (!inWeChat) return download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `易位备份-${dateStamp()}.json`);
      // 微信内置浏览器不能下载：显示备份内容，复制后保存
      const code = shareLink.packBackup(data);
      const copied = await copyText(code);
      await ui.modal({
        title: '备份内容',
        message: copied ? '已经复制到剪贴板，请粘贴到「文件传输助手」或备忘录里保存。' : '请复制下面的内容，粘贴到「文件传输助手」或备忘录里保存。',
        textarea: { value: code, readonly: true },
        buttons: [{ text: '关闭', value: true }],
      });
    },

    async 'import-backup'() {
      const file = await pickFile('.json,application/json,text/plain');
      if (!file) return;
      importBackupText(xlsx.decodeUtf8(file.bytes));
    },

    async 'paste-backup'() {
      const r = await ui.modal({
        title: '粘贴备份内容',
        message: '粘贴在小程序或网页版里复制的备份内容。',
        textarea: { placeholder: 'EASEAT1:...' },
        buttons: [
          { text: '取消', value: false },
          { text: '导入', kind: 'primary', value: true },
        ],
      });
      if (r.choice === true && r.value) importBackupText(r.value);
    },

    async rename() {
      const name = await ui.prompt('修改班级名称', { value: state.cls.name, maxlength: 20 });
      if (!name) return;
      if (await call('updateClass', { classId: state.cls.id, name })) reload();
    },

    async 'delete-class'() {
      if (!(await ui.confirm(`确定删除「${state.cls.name}」吗？学生名单和座位表都会被删除，无法恢复。`, '删除班级', '删除', true))) return;
      if (await call('deleteClass', { classId: state.cls.id })) {
        ui.toast('已删除');
        location.hash = '#/';
      }
    },

    flip() {
      state.flip = !state.flip;
      setPref('flip', state.flip);
      renderClass();
    },

    async seat(el) {
      const r = Number(el.dataset.r);
      const c = Number(el.dataset.c);
      const cls = state.cls;
      const sel = state.selected;
      if (!cls.arrangement.length) {
        state.selected = { r, c };
        return actions['edit-seat']();
      }
      if (!chart.matchesLayout(cls.arrangement, cls.seats)) return ui.toast('教室布局修改过，请先重新排座');
      if (sel && sel.r === r && sel.c === c) {
        state.selected = null;
        return renderClass();
      }
      if (!sel) {
        state.selected = { r, c };
        return renderClass();
      }
      state.selected = null;
      if (await call('swapSeats', { classId: cls.id, a: [sel.r, sel.c], b: [r, c] })) reload();
    },

    'clear-selection'() {
      state.selected = null;
      renderClass();
    },

    async 'edit-seat'() {
      const sel = state.selected;
      const current = state.cls.arrangement.length ? state.cls.arrangement[sel.r][sel.c] : '';
      const name = await ui.prompt('填写座位上的姓名', { value: current || '', placeholder: '留空表示这个座位空着', maxlength: 20 });
      state.selected = null;
      if (name === null) return renderClass();
      if (await call('setSeatName', { classId: state.cls.id, row: sel.r, col: sel.c, name })) reload();
    },

    async mode(el) {
      const mode = el.dataset.mode;
      if (await call('updateClass', { classId: state.cls.id, settings: { mode } })) reload();
    },

    async arrange() {
      const cls = state.cls;
      const seated = chart.matchesLayout(cls.arrangement, cls.seats) && [].concat(...cls.arrangement).some(Boolean);
      if (seated && !(await ui.confirm(`将按「${MODES[cls.settings.mode]}」重新排座，当前座位表会被替换。`, '重新排座', '排座'))) return;
      const res = await call('arrange', { classId: cls.id, mode: cls.settings.mode });
      if (!res) return;
      state.unresolved = res.unresolved;
      state.selected = null;
      ui.toast('排好了');
      reload();
    },

    'export-image'() {
      const cls = state.cls;
      exportImage(
        { title: `${cls.name} 座位表`, subtitle: cls.arrangedAt ? `排座时间：${formatTime(cls.arrangedAt)}` : '', seats: cls.seats, arrangement: cls.arrangement, flip: state.flip },
        `${cls.name}座位表-${dateStamp(cls.arrangedAt)}.png`
      );
    },

    'export-excel'() {
      const cls = state.cls;
      const sheets = [
        chart.chartSheet({ title: `${cls.name} 座位表`, subtitle: cls.arrangedAt ? `排座时间：${formatTime(cls.arrangedAt)}` : '', seats: cls.seats, arrangement: cls.arrangement, flip: state.flip }),
      ];
      if (cls.students.length) sheets.push(chart.rosterSheet(cls.students, cls.seats, cls.arrangement));
      exportExcel(sheets, `${cls.name}座位表-${dateStamp(cls.arrangedAt)}.xlsx`);
    },

    async 'copy-table'() {
      const cls = state.cls;
      if (await copyText(chart.toTSV(`${cls.name} 座位表`, cls.arrangement, state.flip))) ui.toast('已复制，粘贴到 Excel / WPS 即可');
      else ui.alert('浏览器不允许复制，请换一个浏览器试试。');
    },

    async 'copy-link'() {
      const cls = state.cls;
      const url = shareLink.viewUrl({ name: cls.name, seats: cls.seats, arrangement: cls.arrangement, arrangedAt: cls.arrangedAt }, siteUrl());
      if (await copyText(url)) ui.alert('发给学生和家长，在浏览器里打开就能看到座位表。这是当前座位表的快照，重新排座后请再复制一次。', '链接已复制');
      else ui.prompt('复制下面的链接', { value: url, maxlength: 4000 });
    },

    tab(el) {
      state.tab = el.dataset.tab;
      setPref('tab', state.tab);
      renderClass();
    },

    'toggle-paste'() {
      state.showPaste = !state.showPaste;
      renderClass();
      const ta = document.getElementById('paste-text');
      if (ta) ta.focus();
    },

    async 'import-roster'() {
      const file = await pickFile('.xlsx,.csv,.txt,text/csv,text/plain');
      if (!file) return;
      let rows;
      try {
        rows = xlsx.readTable(file.bytes);
      } catch (e) {
        return ui.alert(e.message);
      }
      const res = await call('addStudents', { classId: state.cls.id, rows });
      if (!res) return;
      ui.toast(`已添加 ${res.added} 名学生`);
      reload();
    },

    async 'delete-student'(el) {
      const s = state.cls.students.find((x) => x.id === Number(el.dataset.id));
      if (!s || !(await ui.confirm(`确定把「${s.name}」从名单中删除吗？座位表里的名字也会一起清掉。`, '删除学生', '删除', true))) return;
      if (await call('deleteStudent', { classId: state.cls.id, studentId: s.id })) reload();
    },

    async 'auto-weekly'(el) {
      const res = await call('updateClass', { classId: state.cls.id, settings: { autoWeekly: el.checked } });
      if (res && el.checked) ui.toast('每周第一次打开时自动重排');
      reload();
    },

    async 'remove-pair'(el) {
      const key = el.dataset.pair;
      const separate = state.cls.settings.separate.filter(([a, b]) => `${a}-${b}` !== key);
      if (await call('updateClass', { classId: state.cls.id, settings: { separate } })) reload();
    },

    rows(el) {
      const d = Number(el.dataset.delta);
      const draft = state.draft;
      if (d > 0 && draft.length >= MAX_ROWS) return ui.toast(`最多 ${MAX_ROWS} 排`);
      if (d > 0) draft.push(draft[draft.length - 1].slice());
      else if (draft.length > 1) draft.pop();
      renderClass();
    },

    cols(el) {
      const d = Number(el.dataset.delta);
      const cols = state.draft[0].length;
      if (d > 0 && cols >= MAX_COLS) return ui.toast(`最多 ${MAX_COLS} 列`);
      if (d < 0 && cols <= 1) return;
      state.draft = state.draft.map((row) => (d > 0 ? row.concat(true) : row.slice(0, -1)));
      renderClass();
    },

    'toggle-desk'(el) {
      const r = Number(el.dataset.r);
      const c = Number(el.dataset.c);
      state.draft[r][c] = !state.draft[r][c];
      renderClass();
      const again = app.querySelector(`[data-action="toggle-desk"][data-r="${r}"][data-c="${c}"]`);
      if (again) again.focus();
    },

    'reset-layout'() {
      state.draft = null;
      renderClass();
    },

    async 'save-layout'() {
      const res = await call('saveLayout', { classId: state.cls.id, seats: state.draft });
      if (!res) return;
      state.draft = null;
      if (res.fits) ui.toast('布局已保存');
      else ui.alert('新布局放不下原来的座位表，请点「重新排座」。原来的座位表暂时保留，改回原来的布局就能恢复。', '布局已保存');
      reload();
    },

    'view-flip'() {
      state.flip = !state.flip;
      setPref('flip', state.flip);
      renderView();
    },

    'view-image'() {
      const v = state.view;
      exportImage({ title: `${v.name} 座位表`, subtitle: v.arrangedAt ? `排座时间：${formatTime(v.arrangedAt)}` : '', seats: v.seats, arrangement: v.arrangement, flip: state.flip }, `${v.name}座位表.png`);
    },

    'view-excel'() {
      const v = state.view;
      exportExcel(
        [chart.chartSheet({ title: `${v.name} 座位表`, subtitle: v.arrangedAt ? `排座时间：${formatTime(v.arrangedAt)}` : '', seats: v.seats, arrangement: v.arrangement, flip: state.flip })],
        `${v.name}座位表.xlsx`
      );
    },

    async 'view-table'() {
      const v = state.view;
      if (await copyText(chart.toTSV(`${v.name} 座位表`, v.arrangement, state.flip))) ui.toast('已复制，粘贴到 Excel / WPS 即可');
    },
  };

  async function importBackupText(text) {
    let backup = null;
    try {
      backup = shareLink.unpackBackup(text);
    } catch (e) {
      backup = null;
    }
    if (!backup || backup.app !== 'easeat' || !Array.isArray(backup.classes)) return ui.alert('这不是易位的备份，或者内容不完整');
    if (!(await ui.confirm(`备份里有 ${backup.classes.length} 个班级，将作为新班级添加，不会覆盖现有的班级。`, '导入备份', '导入'))) return;
    const res = await call('importData', { backup });
    if (!res) return;
    ui.toast(`已导入 ${res.imported.length} 个班级`);
    showHome();
  }

  const forms = {
    async 'add-student'(form) {
      const name = form.name.value.trim();
      if (!name) return form.name.focus();
      const res = await call('addStudents', { classId: state.cls.id, students: [{ name, height: form.height.value }] });
      if (!res) return;
      ui.toast(`已添加 ${name}`);
      await reload();
      const input = app.querySelector('[data-form="add-student"] input[name="name"]');
      if (input) input.focus();
    },

    async 'paste-roster'(form) {
      if (!form.text.value.trim()) return form.text.focus();
      const res = await call('addStudents', { classId: state.cls.id, text: form.text.value });
      if (!res) return;
      state.showPaste = false;
      ui.toast(`已添加 ${res.added} 名学生`);
      reload();
    },

    async 'add-pair'(form) {
      const a = Number(form.a.value);
      const b = Number(form.b.value);
      if (!a || !b) return ui.toast('请选择两位同学');
      if (a === b) return ui.toast('请选择两位不同的同学');
      const separate = state.cls.settings.separate.concat([[a, b]]);
      const res = await call('updateClass', { classId: state.cls.id, settings: { separate } });
      if (res && res.settings.separate.length === state.cls.settings.separate.length) ui.toast('已经添加过了');
      else if (res) ui.toast('下次排座时生效');
      reload();
    },
  };

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || !app.contains(el) || el.type === 'checkbox') return;
    const fn = actions[el.dataset.action];
    if (fn) {
      e.preventDefault();
      fn(el);
    }
  });

  app.addEventListener('change', (e) => {
    const el = e.target;
    if (el.type === 'checkbox' && el.dataset.action && actions[el.dataset.action]) actions[el.dataset.action](el);
  });

  app.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    forms[form.dataset.form](form);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.selected && !document.querySelector('.modal')) actions['clear-selection']();
  });

  // 另一个标签页修改了数据时，刷新当前页面
  window.addEventListener('storage', (e) => {
    if (!e.key || !e.key.startsWith(PREFIX) || e.key.startsWith(PREFIX + 'pref:')) return;
    if (document.querySelector('.modal')) return;
    const hash = location.hash || '#/';
    if (/^#\/class\//.test(hash) && state.cls) showClass(state.cls.id, false);
    else if (hash === '#/' || hash === '#') showHome();
  });

  window.addEventListener('hashchange', route);
  route();
})();
