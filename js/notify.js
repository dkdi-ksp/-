/* App 内提醒。
   诚实的前提：网页只在打开时才能提醒。手机锁屏、浏览器被切走之后，
   这个定时器就可能被系统冻结 —— 所以真正可靠的提醒走系统日历（.ics）。
   这里做的是「打开着的时候，提前几分钟弹一下」。 */
var CWnotify = (function () {
  'use strict';

  var CWweeks = (typeof module !== 'undefined' && module.exports)
    ? require('./weeks.js') : (typeof window !== 'undefined' ? window.CWweeks : null);

  var CHECK_INTERVAL_MS = 60000;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function yyyymmdd(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /* 同一天同一门课只提醒一次；换一天自然就是新 key */
  function reminderKey(course, now) {
    return course.id + '|' + yyyymmdd(now);
  }

  /* 纯函数：此刻应该弹哪几条提醒。返回 [{key, course, startAt}]。
     触发窗口是 [上课时刻 - 提前量, 上课时刻)：到点了才提醒，
     已经开课的就别再补一刀了（用户已经在路上了）。 */
  function dueReminders(courses, settings, now, firedKeys) {
    var out = [];
    if (!settings || !settings.termStartMonday) return out;
    if (!CWweeks) return out;

    var minutes = Number(settings.reminderMinutes);
    if (!(minutes > 0)) return out;

    var when = now || new Date();
    var fired = firedKeys || new Set();

    var week = CWweeks.currentWeek(when, settings.termStartMonday);
    if (week < 1) return out;
    var total = Number(settings.totalWeeks);
    if (isFinite(total) && total >= 1 && week > total) return out;

    var dow = CWweeks.isoDayOfWeek(when);
    var periods = settings.periods || [];
    var list = courses || [];

    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (Number(c.dayOfWeek) !== dow) continue;
      if (!CWweeks.isActive(c, week)) continue;

      var startAt = CWweeks.courseStartAt(c, when, periods);
      if (!startAt) continue; // 节次表里没有这一节，跳过而不是抛异常

      var triggerAt = new Date(startAt.getTime() - minutes * 60000);
      if (!(triggerAt <= when && when < startAt)) continue;

      var key = reminderKey(c, when);
      if (fired.has(key)) continue;

      out.push({ key: key, course: c, startAt: startAt });
    }
    return out;
  }

  /* ---------------------------------------------------------------- 通知器 */

  function createNotifier(deps) {
    deps = deps || {};
    var getState = deps.getState || function () { return { courses: [], settings: {} }; };
    var saveSettings = deps.saveSettings || function () {};
    var onError = deps.onError || function () {};
    var onRemind = deps.onRemind || function () {};

    var timer = null;
    var firedKeys = new Set();
    var lastDay = null;
    var audioCtx = null;

    function hasPermission() {
      return typeof Notification !== 'undefined' && Notification.permission === 'granted';
    }

    function beep() {
      try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!audioCtx) audioCtx = new Ctx(); // 懒加载：移动端要求首次用户交互后才建得出来
        if (audioCtx.state === 'suspended') audioCtx.resume();
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.value = 880;
        gain.gain.value = 0.08;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
      } catch (e) {
        // 音频出不来不影响提醒本身，忽略
      }
    }

    /* 页内横幅。自带元素而不是借用 ui.js 的 toast：
       横幅要能在任何一页出现，且不能被 render() 换掉 #view 的内容冲掉。 */
    function showBanner(title, body) {
      if (typeof document === 'undefined') return;
      var el = document.createElement('div');
      el.className = 'notify-banner';
      el.innerHTML = '<strong></strong><span></span>';
      el.querySelector('strong').textContent = title;
      el.querySelector('span').textContent = body;
      document.body.appendChild(el);
      setTimeout(function () {
        el.classList.add('out');
        setTimeout(function () {
          if (el.parentNode) el.parentNode.removeChild(el);
        }, 400);
      }, 8000);
    }

    /* now 可注入：定时器传 undefined（用真实时间），测试传固定时刻 */
    function tick(now) {
      var state = getState();
      var when = now || new Date();
      var today = yyyymmdd(when);
      if (lastDay !== today) {
        firedKeys.clear(); // 跨日清空，否则第二天的 key 会撞上
        lastDay = today;
      }

      dueReminders(state.courses, state.settings, when, firedKeys).forEach(function (item) {
        firedKeys.add(item.key); // 先记下来，紧接着的几次 tick 就不会再弹

        var minutesLeft = Math.max(0, Math.round((item.startAt - when) / 60000));
        var body = (item.course.location ? '在 ' + item.course.location + ' · ' : '') +
          '还有 ' + minutesLeft + ' 分钟';

        if (hasPermission()) {
          try {
            new Notification(item.course.name, { body: body, tag: item.key });
          } catch (e) {
            // 系统通知弹不出来还有页内横幅，不中断
          }
        }
        showBanner(item.course.name, body);
        beep();
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(200);
        onRemind(item.course, body);
      });
    }

    function start() {
      stop();
      timer = setInterval(tick, CHECK_INTERVAL_MS);
      tick(); // 立刻查一次，不然要等满一个周期
    }

    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }

    /* 返回 Promise<boolean>：true = 已开启，false = 没开成（调用方要把勾选框还原） */
    function setEnabled(on) {
      if (!on) {
        stop();
        try { saveSettings({ notifyEnabled: false }); } catch (e) { /* 存不下也不影响关闭 */ }
        return Promise.resolve(false);
      }
      if (typeof Notification === 'undefined') {
        onError('这个浏览器不支持通知，请用「导出到手机日历」来提醒');
        return Promise.resolve(false);
      }
      return Notification.requestPermission().then(function (perm) {
        if (perm !== 'granted') {
          onError('通知权限被拒绝了，可在浏览器设置里重新允许');
          try { saveSettings({ notifyEnabled: false }); } catch (e) { /* 同上 */ }
          return false;
        }
        saveSettings({ notifyEnabled: true });
        start();
        return true;
      });
    }

    /* 重新打开页面时，先前开过且权限还在的话自动接着跑 */
    function autoStart() {
      var settings = getState().settings || {};
      if (settings.notifyEnabled && hasPermission()) start();
    }

    return {
      start: start,
      stop: stop,
      setEnabled: setEnabled,
      autoStart: autoStart,
      tick: tick,
      isRunning: function () { return timer !== null; }
    };
  }

  return {
    dueReminders: dueReminders,
    createNotifier: createNotifier,
    reminderKey: reminderKey
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CWnotify;
