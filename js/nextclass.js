/* 「下一节课是哪节、还有几分钟」。纯函数，不碰 DOM ——
   倒计时是这一页最容易算错的部分，抽出来单独测。 */
var CWnextclass = (function () {
  'use strict';

  var CWweeks = (typeof module !== 'undefined' && module.exports)
    ? require('./weeks.js') : (typeof window !== 'undefined' ? window.CWweeks : null);

  /* 返回 {course, startAt, minutesLeft}；今天没有还没上完的课则返回 null。
     startAt 是结束时刻之前的最近一节 —— 正在上的那节也算（此时 minutesLeft 为 0）。 */
  function nextClass(courses, settings, now) {
    if (!settings || !settings.termStartMonday) return null;
    if (!CWweeks) return null;

    var when = now || new Date();
    var periods = settings.periods || [];

    var week = CWweeks.currentWeek(when, settings.termStartMonday);
    if (week < 1) return null;
    var total = Number(settings.totalWeeks);
    if (isFinite(total) && total >= 1 && week > total) return null;

    var dow = CWweeks.isoDayOfWeek(when);
    var list = courses || [];
    var best = null;

    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (Number(c.dayOfWeek) !== dow) continue;
      if (!CWweeks.isActive(c, week)) continue;

      var startAt = CWweeks.courseStartAt(c, when, periods);
      var endAt = CWweeks.courseEndAt(c, when, periods);
      if (!startAt || !endAt) continue;   // 节次表里找不到这一节，跳过而不是抛异常
      if (endAt <= when) continue;        // 已经上完了，不算「下一节」

      if (!best || startAt < best.startAt) {
        best = { course: c, startAt: startAt };
      }
    }

    if (!best) return null;
    return {
      course: best.course,
      startAt: best.startAt,
      minutesLeft: Math.max(0, Math.round((best.startAt - when) / 60000))
    };
  }

  return { nextClass: nextClass };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CWnextclass;
