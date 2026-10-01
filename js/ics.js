/* 生成手机系统日历能导入的 .ics 文件。
   纯函数，不碰 DOM；浏览器页面与 `node --test` 共用同一份代码。 */
var CWics = (function () {
  'use strict';

  var CWweeks = (typeof module !== 'undefined' && module.exports)
    ? require('./weeks.js')
    : (typeof window !== 'undefined' ? window.CWweeks : null);

  var BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
  var TZID = 'Asia/Shanghai';

  // Asia/Shanghai 是固定 +0800、无夏令时，所以 VTIMEZONE 只有一条 STANDARD
  var VTIMEZONE = [
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Shanghai',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0800',
    'TZOFFSETTO:+0800',
    'TZNAME:CST',
    'END:STANDARD',
    'END:VTIMEZONE'
  ];

  var _enc = new TextEncoder();

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /* RFC 5545 TEXT 转义。顺序不能变：反斜杠必须最先转义，
     否则后面插入的 \ 会被二次转义。 */
  function escapeText(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n|\r|\n/g, '\\n');
  }

  /* RFC 5545 折行：每行最多 75 字节（按 UTF-8 算），续行以一个空格开头。
     用 for..of 按码点迭代，不会把中文（3 字节）或 emoji（4 字节）切成两半。 */
  function foldLine(line) {
    if (_enc.encode(line).length <= 75) return [line];
    var out = [];
    var cur = '';
    var curBytes = 0;
    for (var ch of line) {
      var b = _enc.encode(ch).length;
      if (curBytes + b > 75) {
        out.push(cur);
        cur = ' ' + ch;
        curBytes = 1 + b; // 续行开头的那个空格也占 1 字节
      } else {
        cur += ch;
        curBytes += b;
      }
    }
    out.push(cur);
    return out;
  }

  /* 20261005 + '08:00' → '20261005T080000'（本地时间，不带 Z） */
  function formatLocalDT(date, hhmm) {
    var p = String(hhmm).split(':');
    return String(date.getFullYear()) + pad2(date.getMonth() + 1) + pad2(date.getDate()) +
      'T' + pad2(Number(p[0])) + pad2(Number(p[1])) + '00';
  }

  /* DTSTAMP 用 UTC */
  function formatUTC(date) {
    return String(date.getUTCFullYear()) + pad2(date.getUTCMonth() + 1) + pad2(date.getUTCDate()) +
      'T' + pad2(date.getUTCHours()) + pad2(date.getUTCMinutes()) + pad2(date.getUTCSeconds()) + 'Z';
  }

  function buildICS(courses, settings) {
    var periods = (settings && settings.periods) || [];
    var termStartRaw = settings && settings.termStartMonday;
    var termStart = termStartRaw ? CWweeks.parseLocalDate(termStartRaw) : null;
    var dtstamp = formatUTC(new Date());

    var out = [];
    out.push('BEGIN:VCALENDAR');
    out.push('VERSION:2.0');
    out.push('PRODID:-//claude word//Course Schedule//CN');
    out.push('CALSCALE:GREGORIAN');
    out.push('METHOD:PUBLISH');
    out.push('X-WR-CALNAME:' + escapeText((settings && settings.termName) || '课程表'));
    for (var i = 0; i < VTIMEZONE.length; i++) out.push(VTIMEZONE[i]);

    var list = courses || [];
    for (var n = 0; n < list.length; n++) {
      var course = list[n];

      // 没有学期基准日期就没法算具体日期，整份日历只留框架
      if (!termStart) continue;

      var firstWeek = CWweeks.firstMatchingWeek(course);
      if (firstWeek === null) continue; // 按当前设置一节课都不上

      var startP = periods[course.startPeriod - 1];
      var endP = periods[course.endPeriod - 1];
      if (!startP || !endP) continue; // 节次表被改短了，引用不到 → 跳过而不是崩

      var dayOffset = (firstWeek - 1) * 7 + (Number(course.dayOfWeek) - 1);
      var date = new Date(termStart.getFullYear(), termStart.getMonth(), termStart.getDate() + dayOffset);

      var isEveryWeek = course.weekParity === 'all';
      var interval = isEveryWeek ? 1 : 2;
      var count = isEveryWeek
        ? course.weekEnd - course.weekStart + 1
        : Math.floor((course.weekEnd - firstWeek) / 2) + 1;

      out.push('BEGIN:VEVENT');
      out.push('UID:' + course.id + '-' + firstWeek + '@claudeword');
      out.push('DTSTAMP:' + dtstamp);
      out.push('DTSTART;TZID=' + TZID + ':' + formatLocalDT(date, startP.start));
      out.push('DTEND;TZID=' + TZID + ':' + formatLocalDT(date, endP.end));
      out.push('RRULE:FREQ=WEEKLY;INTERVAL=' + interval + ';COUNT=' + count +
        ';BYDAY=' + BYDAY[Number(course.dayOfWeek) - 1]);
      out.push('SUMMARY:' + escapeText(course.name));
      if (course.location) out.push('LOCATION:' + escapeText(course.location));

      var desc = [];
      if (course.teacher) desc.push('教师：' + course.teacher);
      if (course.note) desc.push(course.note);
      if (desc.length) out.push('DESCRIPTION:' + escapeText(desc.join('\n')));

      var minutes = Number(settings && settings.reminderMinutes);
      if (minutes > 0) {
        out.push('BEGIN:VALARM');
        out.push('TRIGGER:-PT' + minutes + 'M');
        out.push('ACTION:DISPLAY');
        out.push('DESCRIPTION:' + escapeText(course.name) + ' ' + minutes + ' 分钟后开始');
        out.push('END:VALARM');
      }
      out.push('END:VEVENT');
    }

    out.push('END:VCALENDAR');

    var folded = [];
    for (var k = 0; k < out.length; k++) {
      var parts = foldLine(out[k]);
      for (var m = 0; m < parts.length; m++) folded.push(parts[m]);
    }
    return folded.join('\r\n') + '\r\n';
  }

  function buildICSFileName(settings) {
    var name = String((settings && settings.termName) || '').trim() || '课程表';
    return name + '.ics';
  }

  /* 导出前的守门人：把「不该产出文件」的情况挡在这里，返回可读的中文原因。 */
  function buildICSResult(courses, settings) {
    if (!settings || !settings.termStartMonday) {
      return { ok: false, error: '还没设置学期开始日期，请先到「设置」里填写第 1 周的周一' };
    }
    if (!courses || !courses.length) {
      return { ok: false, error: '还没有任何课程，先添加课程再导出' };
    }
    var text = buildICS(courses, settings);
    if (text.indexOf('BEGIN:VEVENT') === -1) {
      return { ok: false, error: '按当前的周次和节次设置，没有任何课程能生成日历事件' };
    }
    return { ok: true, text: text, fileName: buildICSFileName(settings) };
  }

  return {
    escapeText: escapeText,
    foldLine: foldLine,
    formatLocalDT: formatLocalDT,
    formatUTC: formatUTC,
    buildICS: buildICS,
    buildICSFileName: buildICSFileName,
    buildICSResult: buildICSResult
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CWics;
