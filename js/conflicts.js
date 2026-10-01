/* 时间冲突检测。纯函数，不碰 DOM —— 表单是 DOM 代码，不便单测，
   所以把判断逻辑单独放在这里。 */
var CWconflicts = (function () {
  'use strict';

  /* 两门课是否真的会撞上：同一天 + 节次重叠 + 周次有交集 + 单双周相容 */
  function isConflicting(a, b) {
    if (a.id && b.id && a.id === b.id) return false; // 编辑时不要和自己比

    if (Number(a.dayOfWeek) !== Number(b.dayOfWeek)) return false;

    var aStart = Number(a.startPeriod), aEnd = Number(a.endPeriod);
    var bStart = Number(b.startPeriod), bEnd = Number(b.endPeriod);
    if (!(aStart <= bEnd && bStart <= aEnd)) return false;

    var aWs = Number(a.weekStart), aWe = Number(a.weekEnd);
    var bWs = Number(b.weekStart), bWe = Number(b.weekEnd);
    if (!(aWs <= bWe && bWs <= aWe)) return false;

    // 只要有一方是「每周」，就一定会碰上；单周与双周永远错开
    if (a.weekParity === 'all' || b.weekParity === 'all') return true;
    return a.weekParity === b.weekParity;
  }

  /* 返回与 course 冲突的已有课程列表（有可能不止一门）。
     仅提示，不阻止保存 —— 用户可能有自己的理由。 */
  function findConflicts(course, courses) {
    if (!course) return [];
    return (courses || []).filter(function (other) {
      return isConflicting(course, other);
    });
  }

  return { findConflicts: findConflicts, isConflicting: isConflicting };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CWconflicts;
