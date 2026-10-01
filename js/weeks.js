/* 周次与单双周计算。全部是纯函数，不碰 DOM、不读全局状态，
   因此浏览器页面和 `node --test` 都能直接用同一份代码。 */
var CWweeks = (function () {
  'use strict';

  var MS_PER_DAY = 86400000;

  /* 'YYYY-MM-DD' → 本地零点 Date。传 Date 则只取年月日。
     一律按本地时间构造，避免被当成 UTC 解析而偏移一天。 */
  function parseLocalDate(s) {
    if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
    var p = String(s).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  /* b - a 的整数天数 */
  function daysBetween(a, b) {
    var ms = parseLocalDate(b).getTime() - parseLocalDate(a).getTime();
    return Math.round(ms / MS_PER_DAY);
  }

  /* 今天是第几周（1 起）。学期尚未开始或未设置基准日期时返回 0；
     学期结束后可能大于总周数，由调用方判断。 */
  function currentWeek(today, termStartMonday) {
    if (!termStartMonday) return 0;
    var d = daysBetween(termStartMonday, today);
    if (d < 0) return 0;
    return Math.floor(d / 7) + 1;
  }

  /* 「单周」指学期周次的奇偶，不是自然周数的奇偶 */
  function matchesParity(parity, week) {
    if (parity === 'odd') return week % 2 === 1;
    if (parity === 'even') return week % 2 === 0;
    return true;
  }

  function isActive(course, week) {
    return week >= course.weekStart &&
      week <= course.weekEnd &&
      matchesParity(course.weekParity, week);
  }

  /* 区间内第一个真正上课的周。返回 null 表示按当前设置一节课都没有。 */
  function firstMatchingWeek(course) {
    for (var w = course.weekStart; w <= course.weekEnd; w++) {
      if (matchesParity(course.weekParity, w)) return w;
    }
    return null;
  }

  function activeCoursesInWeek(courses, week) {
    return (courses || []).filter(function (c) { return isActive(c, week); });
  }

  /* JS 的 getDay() 里周日是 0，课程表里周日是 7 */
  function isoDayOfWeek(date) {
    var d = date.getDay();
    return d === 0 ? 7 : d;
  }

  /* 某天某节课的开始时刻。节次表里找不到该节时返回 null（不抛异常）。 */
  function courseStartAt(course, date, periods) {
    if (!periods || !periods.length) return null;
    var p = periods[course.startPeriod - 1];
    if (!p || typeof p.start !== 'string') return null;
    var parts = p.start.split(':');
    var hh = Number(parts[0]);
    var mm = Number(parts[1]);
    if (!isFinite(hh) || !isFinite(mm)) return null;
    var d = parseLocalDate(date);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm);
  }

  /* 逐日推进，收集区间内所有真正要上的课。同一天内按 courses 的原始顺序。 */
  function occurrencesInRange(courses, fromDate, toDate, termStartMonday) {
    var out = [];
    if (!termStartMonday) return out;
    var start = parseLocalDate(fromDate);
    var total = daysBetween(start, toDate);
    var list = courses || [];
    for (var i = 0; i <= total; i++) {
      var day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      var week = currentWeek(day, termStartMonday);
      if (week === 0) continue;
      var dow = isoDayOfWeek(day);
      for (var j = 0; j < list.length; j++) {
        var c = list[j];
        if (Number(c.dayOfWeek) !== dow) continue;
        if (!isActive(c, week)) continue;
        out.push({ date: day, course: c });
      }
    }
    return out;
  }

  /* 课表网格布局。把「第几行、第几列、跨几行」的算术从 DOM 代码里抽出来，
     单独可测；ui.js 只负责把结果贴成 HTML。
     列号：第 1 列是节次标签，周一从第 2 列开始，所以 col = dayOfWeek + 1。
     行号：直接用节次序号。 */
  function buildWeekGrid(courses, week, periodCount) {
    var cells = [];
    var list = courses || [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var sp = Number(c.startPeriod);
      var ep = Number(c.endPeriod);
      if (!(sp >= 1) || !(ep >= sp)) continue;
      if (sp > periodCount) continue;            // 节次表里没有这一节
      if (week < c.weekStart || week > c.weekEnd) continue; // 这周压根不在课程的时间范围里
      var lastRow = Math.min(ep, periodCount);   // 结束节超出节次总数时裁掉
      cells.push({
        id: c.id,
        name: c.name,
        location: c.location || '',
        color: c.color,
        dayOfWeek: Number(c.dayOfWeek),
        col: Number(c.dayOfWeek) + 1,
        row: sp,
        rowSpan: lastRow - sp + 1,
        active: matchesParity(c.weekParity, week)
      });
    }
    return { periodCount: periodCount, cells: cells };
  }

  return {
    parseLocalDate: parseLocalDate,
    daysBetween: daysBetween,
    currentWeek: currentWeek,
    matchesParity: matchesParity,
    isActive: isActive,
    firstMatchingWeek: firstMatchingWeek,
    activeCoursesInWeek: activeCoursesInWeek,
    courseStartAt: courseStartAt,
    occurrencesInRange: occurrencesInRange,
    buildWeekGrid: buildWeekGrid
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CWweeks;
