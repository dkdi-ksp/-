/* 界面层：渲染与事件绑定。
   这里只做「把已经算好的数据贴成 HTML」，所有算术都在 weeks.js / ics.js /
   conflicts.js / nextclass.js / notify.js 里，那些模块都有自动化测试。 */
var CWui = (function () {
  'use strict';

  var CWweeks = (typeof module !== 'undefined' && module.exports)
    ? require('./weeks.js') : window.CWweeks;
  var CWconflicts = (typeof module !== 'undefined' && module.exports)
    ? require('./conflicts.js') : window.CWconflicts;
  var CWics = (typeof module !== 'undefined' && module.exports)
    ? require('./ics.js') : window.CWics;
  var CWnextclass = (typeof module !== 'undefined' && module.exports)
    ? require('./nextclass.js') : window.CWnextclass;
  var CWnotify = (typeof module !== 'undefined' && module.exports)
    ? require('./notify.js') : window.CWnotify;

  var DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

  var TAB_TITLES = { timetable: '我的课程表', today: '今天', settings: '设置' };

  var state = { tab: 'timetable', viewWeek: null };
  var toastTimer = null;

  function getStore() { return window.app && window.app.store; }
  function $(id) { return document.getElementById(id); }
  function qsa(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

  /* 所有来自用户的数据插入 innerHTML 前都必须过这里 */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toast(msg, kind) {
    var el = $('toast');
    if (!el) return;
    if (toastTimer) clearTimeout(toastTimer);
    el.className = 'toast ' + (kind || 'info');
    el.textContent = String(msg == null ? '' : msg);
    toastTimer = setTimeout(function () {
      el.className = 'toast hidden';
    }, 2200);
  }

  function todayDow() {
    var d = new Date().getDay();
    return d === 0 ? 7 : d;
  }

  /* state.viewWeek 为 null 表示「跟着当前真实周」 */
  function currentViewWeek(settings) {
    if (state.viewWeek != null) return state.viewWeek;
    var w = CWweeks.currentWeek(new Date(), settings.termStartMonday);
    return w === 0 ? 1 : w;
  }

  function stepWeek(delta) {
    var settings = getStore().getSettings();
    var next = currentViewWeek(settings) + delta;
    next = Math.min(Math.max(next, 1), settings.totalWeeks);
    state.viewWeek = next;
    render();
  }

  // ---------------------------------------------------------------- 课表页

  function renderTimetable() {
    var store = getStore();
    var settings = store.getSettings();
    var courses = store.getCourses();
    var view = $('view');

    if (!settings.termStartMonday) {
      view.innerHTML =
        '<section class="card guide">' +
          '<h2>还没设置学期开始日期</h2>' +
          '<p>课表要知道第 1 周的周一是哪一天，才能算出现在是第几周。</p>' +
          '<button id="goto-settings" class="primary">去设置</button>' +
        '</section>';
      $('goto-settings').addEventListener('click', function () {
        state.tab = 'settings';
        render();
      });
      return;
    }

    var week = currentViewWeek(settings);
    var periods = settings.periods;
    var periodCount = periods.length;
    var grid = CWweeks.buildWeekGrid(courses, week, periodCount);
    var realWeek = CWweeks.currentWeek(new Date(), settings.termStartMonday);
    var highlightDow = (realWeek === week && realWeek >= 1 && realWeek <= settings.totalWeeks) ? todayDow() : 0;

    var html = '';
    html += '<div class="week-nav">' +
      '<button id="week-prev"' + (week <= 1 ? ' disabled' : '') + ' aria-label="上一周">‹</button>' +
      '<span id="week-label">第 ' + week + ' 周</span>' +
      '<button id="week-next"' + (week >= settings.totalWeeks ? ' disabled' : '') + ' aria-label="下一周">›</button>' +
      '</div>';

    if (realWeek === 0) {
      html += '<p class="hint center">学期尚未开始，当前查看第 ' + week + ' 周</p>';
    } else if (realWeek > settings.totalWeeks) {
      html += '<p class="hint center">学期已结束，当前查看第 ' + week + ' 周</p>';
    } else if (realWeek !== week) {
      html += '<p class="hint center">今天是第 ' + realWeek + ' 周</p>';
    }

    html += '<div class="tt-head"><div class="tt-corner"></div>';
    for (var d = 1; d <= 7; d++) {
      html += '<div class="tt-day' + (d === highlightDow ? ' today' : '') + '">' + DAY_LABELS[d - 1] + '</div>';
    }
    html += '</div>';

    html += '<div class="tt-body" style="grid-template-rows:repeat(' + periodCount + ', var(--row-h))">';
    for (var p = 1; p <= periodCount; p++) {
      var per = periods[p - 1] || {};
      html += '<div class="tt-period" style="grid-row:' + p + ';grid-column:1">' +
        '<span class="p-idx">' + p + '</span>' +
        '<span class="p-time">' + esc(per.start || '') + '</span>' +
        '</div>';
    }
    // 先铺满空格子，课程格子叠在它们上面
    for (var r = 1; r <= periodCount; r++) {
      for (var c = 2; c <= 8; c++) {
        html += '<div class="tt-cell" style="grid-row:' + r + ';grid-column:' + c + '"></div>';
      }
    }
    for (var i = 0; i < grid.cells.length; i++) {
      var cell = grid.cells[i];
      html += '<div class="course' + (cell.active ? '' : ' inactive') + '"' +
        ' style="grid-row:' + cell.row + ' / span ' + cell.rowSpan +
        ';grid-column:' + cell.col +
        ';background:' + esc(cell.color || '#7C9EF3') + '"' +
        ' data-id="' + esc(cell.id) + '">' +
        '<span class="c-name">' + esc(cell.name) + '</span>' +
        (cell.location ? '<span class="c-room">' + esc(cell.location) + '</span>' : '') +
        (cell.active ? '' : '<span class="c-note">本周不上</span>') +
        '</div>';
    }
    html += '</div>';

    if (periodCount === 0) {
      html += '<p class="hint center">节次表是空的，去「设置」里加一节。</p>';
    }

    view.innerHTML = html;

    $('week-prev').addEventListener('click', function () { stepWeek(-1); });
    $('week-next').addEventListener('click', function () { stepWeek(1); });

    qsa(view, '.course').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-id');
        var list = getStore().getCourses();
        var found = null;
        for (var k = 0; k < list.length; k++) if (list[k].id === id) { found = list[k]; break; }
        openCourseForm(found);
      });
    });
  }

  // ---------------------------------------------------------------- 其余页面

  function renderToday() {
    // Task 7 实现
    $('view').innerHTML = '<section class="card"><p class="hint">今日页尚未实现。</p></section>';
  }

  function renderSettings() {
    // Task 6 实现
    $('view').innerHTML = '<section class="card"><p class="hint">设置页尚未实现。</p></section>';
  }

  function openCourseForm(course) {
    // Task 5 实现
    toast(course ? '编辑功能尚未实现' : '添加功能尚未实现', 'warn');
  }

  // ---------------------------------------------------------------- 调度

  function syncTabbar() {
    qsa(document, '#tabbar button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === state.tab);
    });
  }

  function render() {
    if (state.tab === 'today') renderToday();
    else if (state.tab === 'settings') renderSettings();
    else renderTimetable();
    var header = $('app-header');
    if (header) header.textContent = TAB_TITLES[state.tab] || '';
    syncTabbar();
  }

  function loadDemoData() {
    var store = getStore();
    store.clearAll();
    store.saveSettings({ termStartMonday: '2026-09-07' });
    store.addCourse({ name: '高等数学', teacher: '张老师', location: 'A-301', dayOfWeek: 1, startPeriod: 1, endPeriod: 2, weekStart: 1, weekEnd: 16, weekParity: 'all', note: '' });
    store.addCourse({ name: '大学英语', teacher: '王老师', location: 'B-102', dayOfWeek: 3, startPeriod: 5, endPeriod: 6, weekStart: 3, weekEnd: 12, weekParity: 'odd', note: '' });
  }

  function init() {
    if (typeof location !== 'undefined' && location.search.indexOf('demo') !== -1) {
      loadDemoData(); // Task 8 完成后删除
    }
    $('tabbar').addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-tab]') : null;
      if (!btn) return;
      state.tab = btn.getAttribute('data-tab');
      render();
    });
    $('fab').addEventListener('click', function () { openCourseForm(null); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) render();
    });
    render();
  }

  var api = {
    init: init,
    render: render,
    renderTimetable: renderTimetable,
    renderToday: renderToday,
    renderSettings: renderSettings,
    openCourseForm: openCourseForm,
    toast: toast,
    esc: esc,
    getState: function () { return state; }
  };

  if (typeof document !== 'undefined') init();
  return api;
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CWui;
