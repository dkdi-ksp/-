/* 数据层：课程与设置的读写、校验、导入导出。
   不依赖 DOM，浏览器与 Node 中同样可用。 */
var CWstore = (function () {
  'use strict';

  var KEYS = {
    courses: 'claudeword.courses.v1',
    settings: 'claudeword.settings.v1'
  };

  var PALETTE = [
    '#7C9EF3', '#F3A17C', '#7CC7A5', '#C79EF3', '#F3D07C',
    '#7CC0F3', '#F38EA6', '#9EF37C', '#A8B4C0', '#E0A0C8'
  ];

  var PARITIES = ['all', 'odd', 'even'];
  var TIME_RE = /^\d{2}:\d{2}$/;

  function defaultPeriods() {
    return [
      { index: 1, start: '08:00', end: '08:55' },
      { index: 2, start: '08:55', end: '09:50' },
      { index: 3, start: '10:05', end: '11:00' },
      { index: 4, start: '11:00', end: '11:55' },
      { index: 5, start: '14:00', end: '14:55' },
      { index: 6, start: '14:55', end: '15:50' },
      { index: 7, start: '16:05', end: '17:00' },
      { index: 8, start: '17:00', end: '17:55' }
    ];
  }

  function defaultSettings() {
    return {
      schemaVersion: 1,
      termName: '我的课程表',
      termStartMonday: '',
      totalWeeks: 20,
      periods: defaultPeriods(),
      reminderMinutes: 15,
      notifyEnabled: false
    };
  }

  function validateCourse(c) {
    if (!c || !String(c.name == null ? '' : c.name).trim()) throw new Error('课程名不能为空');
    var d = Number(c.dayOfWeek);
    if (!(d >= 1 && d <= 7)) throw new Error('星期必须在 1-7 之间');
    var sp = Number(c.startPeriod);
    var ep = Number(c.endPeriod);
    if (!(sp >= 1) || !(ep >= sp)) throw new Error('节次范围不合法');
    var ws = Number(c.weekStart);
    var we = Number(c.weekEnd);
    if (!(ws >= 1) || !(we >= ws)) throw new Error('周次范围不合法');
    if (PARITIES.indexOf(c.weekParity) === -1) throw new Error('单双周取值不合法');
  }

  function validatePeriods(periods) {
    if (!Array.isArray(periods) || periods.length === 0) throw new Error('至少要保留一节');
    for (var i = 0; i < periods.length; i++) {
      var p = periods[i] || {};
      if (!TIME_RE.test(String(p.start)) || !TIME_RE.test(String(p.end))) {
        throw new Error('时间格式必须为 HH:MM');
      }
      if (p.start >= p.end) throw new Error('每节的开始时间不能晚于或等于结束时间');
    }
  }

  var _seq = 0;
  function newId() {
    _seq += 1;
    return 'c' + Date.now().toString(36) + _seq.toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function cloneShallow(o) {
    var out = {};
    for (var k in o) {
      if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k];
    }
    return out;
  }

  function createStore(storage) {
    function readJSON(key, fallback) {
      var raw = storage.getItem(key);
      if (raw == null || raw === '') return fallback;
      try {
        return JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    }

    function writeJSON(key, value) {
      storage.setItem(key, JSON.stringify(value));
    }

    function getCourses() {
      var list = readJSON(KEYS.courses, []);
      return Array.isArray(list) ? list : [];
    }

    function saveCourses(list) {
      writeJSON(KEYS.courses, list);
    }

    function getSettings() {
      var saved = readJSON(KEYS.settings, null);
      var defaults = defaultSettings();
      if (!saved || typeof saved !== 'object') return defaults;
      var out = {};
      for (var k in defaults) {
        if (Object.prototype.hasOwnProperty.call(defaults, k)) {
          out[k] = saved[k] === undefined ? defaults[k] : saved[k];
        }
      }
      return out;
    }

    function saveSettings(patch) {
      var next = getSettings();
      if (patch) {
        for (var k in patch) {
          if (Object.prototype.hasOwnProperty.call(patch, k)) next[k] = patch[k];
        }
      }
      if (patch && Object.prototype.hasOwnProperty.call(patch, 'periods')) {
        validatePeriods(next.periods);
      }
      if (!(Number(next.totalWeeks) >= 1)) throw new Error('总周数必须至少为 1');
      writeJSON(KEYS.settings, next);
      return next;
    }

    function addCourse(course) {
      validateCourse(course);
      var list = getCourses();
      var c = cloneShallow(course);
      c.name = String(c.name).trim();
      c.dayOfWeek = Number(c.dayOfWeek);
      c.startPeriod = Number(c.startPeriod);
      c.endPeriod = Number(c.endPeriod);
      c.weekStart = Number(c.weekStart);
      c.weekEnd = Number(c.weekEnd);
      c.teacher = c.teacher == null ? '' : String(c.teacher);
      c.location = c.location == null ? '' : String(c.location);
      c.note = c.note == null ? '' : String(c.note);
      c.id = c.id || newId();
      c.color = c.color || PALETTE[list.length % PALETTE.length];
      list.push(c);
      saveCourses(list);
      return c;
    }

    function updateCourse(id, patch) {
      var list = getCourses();
      for (var i = 0; i < list.length; i++) {
        if (list[i].id !== id) continue;
        var next = cloneShallow(list[i]);
        for (var key in patch) {
          if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = patch[key];
        }
        next.dayOfWeek = Number(next.dayOfWeek);
        next.startPeriod = Number(next.startPeriod);
        next.endPeriod = Number(next.endPeriod);
        next.weekStart = Number(next.weekStart);
        next.weekEnd = Number(next.weekEnd);
        validateCourse(next);
        list[i] = next;
        saveCourses(list);
        return next;
      }
      return null;
    }

    function deleteCourse(id) {
      saveCourses(getCourses().filter(function (c) { return c.id !== id; }));
    }

    function exportJSON() {
      return JSON.stringify({
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        settings: getSettings(),
        courses: getCourses()
      }, null, 2);
    }

    function importJSON(text) {
      var data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        return { ok: false, error: '不是合法的 JSON' };
      }
      if (!data || typeof data !== 'object') {
        return { ok: false, error: '文件格式不正确，缺少 courses 数组' };
      }
      if (!Array.isArray(data.courses)) {
        return { ok: false, error: '文件格式不正确，缺少 courses 数组' };
      }
      if (!data.settings || typeof data.settings !== 'object') {
        return { ok: false, error: '文件格式不正确，缺少 settings 对象' };
      }
      // 全部校验通过后才落盘，避免半个文件破坏现有数据
      writeJSON(KEYS.courses, data.courses);
      writeJSON(KEYS.settings, data.settings);
      return { ok: true, courseCount: data.courses.length };
    }

    function clearAll() {
      storage.removeItem(KEYS.courses);
      storage.removeItem(KEYS.settings);
    }

    return {
      getCourses: getCourses,
      saveCourses: saveCourses,
      addCourse: addCourse,
      updateCourse: updateCourse,
      deleteCourse: deleteCourse,
      getSettings: getSettings,
      saveSettings: saveSettings,
      exportJSON: exportJSON,
      importJSON: importJSON,
      clearAll: clearAll
    };
  }

  return {
    createStore: createStore,
    defaultSettings: defaultSettings,
    validateCourse: validateCourse,
    validatePeriods: validatePeriods,
    PALETTE: PALETTE,
    KEYS: KEYS
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CWstore;
