/* 界面层：渲染与事件绑定。
   这里只做「把已经算好的数据贴成 HTML」，所有算术都在 weeks.js / ics.js /
   conflicts.js / nextclass.js / notify.js 里，那些模块都有自动化测试。 */
var CWui = (function () {
  'use strict';

  var CWweeks = (typeof module !== 'undefined' && module.exports)
    ? require('./weeks.js') : window.CWweeks;
  var CWstore = (typeof module !== 'undefined' && module.exports)
    ? require('./store.js') : window.CWstore;
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

  // ---------------------------------------------------------------- 课程表单

  function closeCourseForm() {
    var sheet = $('sheet');
    if (!sheet) return;
    sheet.className = 'hidden';
    sheet.innerHTML = '';
    document.body.classList.remove('no-scroll');
  }

  /* 节次下拉的选项文案：第 3 节（10:05） */
  function periodLabel(settings, n) {
    var per = settings.periods[n - 1];
    return '第 ' + n + ' 节' + (per && per.start ? '（' + per.start + '）' : '');
  }

  /* 课程引用的节次可能已被用户从节次表里删掉。下拉框只能显示真实存在的节，
     否则会算出「第 0 节」这种非法选项，或者变成一个空的、选不了的下拉框。 */
  function clampPeriod(n, periodCount) {
    n = Number(n);
    if (!isFinite(n) || n < 1) return 1;
    if (n > periodCount) return periodCount;
    return Math.floor(n);
  }

  function optionsFrom(settings, from, to, selected) {
    var out = '';
    for (var n = Math.max(1, from); n <= to; n++) {
      out += '<option value="' + n + '"' + (n === Number(selected) ? ' selected' : '') + '>' +
        periodLabel(settings, n) + '</option>';
    }
    return out;
  }

  function openCourseForm(course) {
    var store = getStore();
    var settings = store.getSettings();
    var courses = store.getCourses();
    var isEdit = !!course;

    if (!settings.periods.length) {
      toast('节次表是空的，先去「设置」里加一节', 'error');
      return;
    }

    var base = course || {
      name: '', teacher: '', location: '',
      dayOfWeek: 1,
      startPeriod: 1,
      endPeriod: 1,
      weekStart: 1,
      weekEnd: settings.totalWeeks,
      weekParity: 'all',
      note: ''
    };

    var periodCount = settings.periods.length;
    // 节次表可能被删短过，把课程里的节次钳到仍然存在的范围内，表单才用得起来
    var startP = clampPeriod(base.startPeriod, periodCount);
    var endP = Math.max(startP, clampPeriod(base.endPeriod, periodCount));

    var dayOpts = '';
    for (var d = 1; d <= 7; d++) {
      dayOpts += '<option value="' + d + '"' + (d === Number(base.dayOfWeek) ? ' selected' : '') + '>' +
        '星期' + DAY_LABELS[d - 1] + '</option>';
    }

    var parityOpts = '';
    [['all', '每周'], ['odd', '单周'], ['even', '双周']].forEach(function (p) {
      parityOpts += '<option value="' + p[0] + '"' + (p[0] === base.weekParity ? ' selected' : '') + '>' + p[1] + '</option>';
    });

    var html =
      '<form id="course-form" class="sheet-panel">' +
        '<h2>' + (isEdit ? '编辑课程' : '新增课程') + '</h2>' +
        '<label class="field"><span>课程名</span><input name="name" required maxlength="30" value="' + esc(base.name) + '"></label>' +
        '<label class="field"><span>教师</span><input name="teacher" maxlength="20" value="' + esc(base.teacher) + '"></label>' +
        '<label class="field"><span>教室</span><input name="location" maxlength="20" value="' + esc(base.location) + '"></label>' +
        '<label class="field"><span>星期</span><select name="dayOfWeek">' + dayOpts + '</select></label>' +
        '<label class="field"><span>起始节</span><select name="startPeriod">' +
          optionsFrom(settings, 1, periodCount, startP) + '</select></label>' +
        '<label class="field"><span>结束节</span><select name="endPeriod">' +
          optionsFrom(settings, startP, periodCount, endP) + '</select></label>' +
        '<label class="field"><span>起始周</span><input type="number" name="weekStart" min="1" max="' + settings.totalWeeks + '" value="' + esc(base.weekStart) + '"></label>' +
        '<label class="field"><span>结束周</span><input type="number" name="weekEnd" min="1" max="' + settings.totalWeeks + '" value="' + esc(base.weekEnd) + '"></label>' +
        '<label class="field"><span>单双周</span><select name="weekParity">' + parityOpts + '</select></label>' +
        '<label class="field"><span>备注</span><textarea name="note" rows="2" maxlength="200">' + esc(base.note) + '</textarea></label>' +
        '<div class="row">' +
          (isEdit ? '' : '<button type="button" id="form-copy">复制上一门课</button>') +
          '<button type="button" id="form-cancel">取消</button>' +
          '<button type="submit" class="primary">保存</button>' +
          (isEdit ? '<button type="button" id="form-delete" class="danger">删除</button>' : '') +
        '</div>' +
      '</form>';

    var sheet = $('sheet');
    sheet.innerHTML = html;
    sheet.className = '';
    document.body.classList.add('no-scroll');

    var form = $('course-form');

    /* 起始节变了，结束节的下拉要跟着重算：不能选到比起始节更早的节 */
    form.elements.startPeriod.addEventListener('change', function () {
      var min = Number(form.elements.startPeriod.value);
      var prev = Number(form.elements.endPeriod.value);
      form.elements.endPeriod.innerHTML =
        optionsFrom(settings, min, periodCount, Math.max(prev, min));
    });

    $('form-cancel').addEventListener('click', closeCourseForm);

    var copyBtn = $('form-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        if (!courses.length) { toast('还没有可复制的课程', 'warn'); return; }
        var last = courses[courses.length - 1];
        form.elements.name.value = '';   // 课程名清空，其余照抄
        form.elements.teacher.value = last.teacher || '';
        form.elements.location.value = last.location || '';
        form.elements.dayOfWeek.value = String(last.dayOfWeek);
        form.elements.startPeriod.value = String(last.startPeriod);
        form.elements.startPeriod.dispatchEvent(new Event('change'));
        form.elements.endPeriod.value = String(last.endPeriod);
        form.elements.weekStart.value = String(last.weekStart);
        form.elements.weekEnd.value = String(last.weekEnd);
        form.elements.weekParity.value = last.weekParity;
        form.elements.note.value = last.note || '';
      });
    }

    var deleteBtn = $('form-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function () {
        if (!window.confirm('确定删除「' + course.name + '」？')) return;
        store.deleteCourse(course.id);
        closeCourseForm();
        render();
        toast('已删除', 'ok');
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var data = {
        name: fd.get('name'),
        teacher: fd.get('teacher'),
        location: fd.get('location'),
        note: fd.get('note'),
        dayOfWeek: Number(fd.get('dayOfWeek')),
        startPeriod: Number(fd.get('startPeriod')),
        endPeriod: Number(fd.get('endPeriod')),
        weekStart: Number(fd.get('weekStart')),
        weekEnd: Number(fd.get('weekEnd')),
        weekParity: fd.get('weekParity')
      };

      // 先校验（表单不关，让用户接着改），再问冲突（用户可能有自己的理由），最后才落盘
      try {
        CWstore.validateCourse(data);
      } catch (err) {
        toast(err.message, 'error');
        return;
      }

      var others = store.getCourses();
      var conflicts = CWconflicts.findConflicts(
        isEdit ? Object.assign({}, data, { id: course.id }) : data,
        others
      );
      if (conflicts.length) {
        var names = conflicts.map(function (c) { return c.name; }).join('、');
        if (!window.confirm('与「' + names + '」时间冲突，仍要保存吗？')) return;
      }

      try {
        if (isEdit) store.updateCourse(course.id, data);
        else store.addCourse(data);
      } catch (err) {
        toast(err.message, 'error');
        return;
      }

      closeCourseForm();
      render();
      toast('已保存', 'ok');
    });

    form.elements.name.focus();
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
    // 点遮罩关闭（只在这里绑一次，openCourseForm 每次重写 innerHTML，绑在那里会越积越多）
    $('sheet').addEventListener('click', function (e) {
      if (e.target === $('sheet')) closeCourseForm();
    });
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
    closeCourseForm: closeCourseForm,
    toast: toast,
    esc: esc,
    getState: function () { return state; }
  };

  if (typeof document !== 'undefined') init();
  return api;
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CWui;
