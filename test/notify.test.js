const test = require('node:test');
const assert = require('node:assert');
const { dueReminders, createNotifier } = require('../js/notify.js');

const settings = {
  termStartMonday: '2026-09-07', totalWeeks: 20, reminderMinutes: 15,
  periods: [
    { index: 1, start: '08:00', end: '08:55' },
    { index: 2, start: '08:55', end: '09:50' },
  ],
};
const course = (over = {}) => Object.assign({
  id: 'c1', name: '高等数学', location: 'A-301', dayOfWeek: 1,
  startPeriod: 1, endPeriod: 1, weekStart: 1, weekEnd: 16, weekParity: 'all',
}, over);

// 2026-09-07 周一，第 1 节 08:00，提前 15 分钟 → 07:45 触发
test('到达提醒时刻时产生一条提醒', () => {
  const r = dueReminders([course()], settings, new Date(2026, 8, 7, 7, 45), new Set());
  assert.equal(r.length, 1);
  assert.equal(r[0].key, 'c1|2026-09-07');
});

test('提醒时刻之前不触发', () => {
  assert.deepEqual(dueReminders([course()], settings, new Date(2026, 8, 7, 7, 44), new Set()), []);
});

test('已经触发过的 key 不重复触发', () => {
  const fired = new Set(['c1|2026-09-07']);
  assert.deepEqual(dueReminders([course()], settings, new Date(2026, 8, 7, 7, 50), fired), []);
});

test('课程开始后不再补发提醒', () => {
  assert.deepEqual(dueReminders([course()], settings, new Date(2026, 8, 7, 8, 5), new Set()), []);
});

test('reminderMinutes 为 0 时不产生提醒', () => {
  const s = Object.assign({}, settings, { reminderMinutes: 0 });
  assert.deepEqual(dueReminders([course()], s, new Date(2026, 8, 7, 7, 59), new Set()), []);
});

test('不是今天上的课不提醒', () => {
  assert.deepEqual(dueReminders([course()], settings, new Date(2026, 8, 8, 7, 45), new Set()), []);
});

test('该周不上课的日子不提醒', () => {
  // 9/14 是第 2 周，课程只在单周 → 不提醒
  assert.deepEqual(dueReminders([course({ weekParity: 'odd' })], settings, new Date(2026, 8, 14, 7, 45), new Set()), []);
});

test('未设置学期开始日期时不提醒', () => {
  const s = Object.assign({}, settings, { termStartMonday: '' });
  assert.deepEqual(dueReminders([course()], s, new Date(2026, 8, 7, 7, 45), new Set()), []);
});

test('节次越界的课程被忽略且不抛异常', () => {
  assert.deepEqual(dueReminders([course({ startPeriod: 9, endPeriod: 9 })], settings, new Date(2026, 8, 7, 7, 45), new Set()), []);
});

test('同一天多门课各自独立提醒', () => {
  const list = [course({ id: 'a' }), course({ id: 'b', startPeriod: 2, endPeriod: 2 })];
  const r = dueReminders(list, settings, new Date(2026, 8, 7, 7, 45), new Set());
  assert.deepEqual(r.map(x => x.key), ['a|2026-09-07']);
  const r2 = dueReminders(list, settings, new Date(2026, 8, 7, 8, 40), new Set(['a|2026-09-07']));
  assert.deepEqual(r2.map(x => x.key), ['b|2026-09-07']);
});

// dueReminders 是纯函数、好测；createNotifier 的「弹过就不再弹」只能靠 tick 反复跑来验证。
// tick 原本写死 new Date() 且没有任何观察点，下面两条测试要求它能注入时刻、能汇报触发了什么。

test('tick 对同一条提醒只触发一次，不会每分钟重复弹', () => {
  const seen = [];
  const notifier = createNotifier({
    getState: () => ({ courses: [course()], settings }),
    onRemind: (c, body) => seen.push(c.name + '|' + body),
  });
  notifier.tick(new Date(2026, 8, 7, 7, 45));
  notifier.tick(new Date(2026, 8, 7, 7, 46));
  notifier.tick(new Date(2026, 8, 7, 7, 47));
  assert.deepEqual(seen, ['高等数学|在 A-301 · 还有 15 分钟']);
});

test('tick 在课程开始后不再补发', () => {
  const seen = [];
  const notifier = createNotifier({
    getState: () => ({ courses: [course()], settings }),
    onRemind: (c) => seen.push(c.name),
  });
  notifier.tick(new Date(2026, 8, 7, 8, 5));
  assert.deepEqual(seen, []);
});

test('tick 换一天后仍然会提醒（firedKeys 不是把所有提醒都锁死）', () => {
  const seen = [];
  const s = Object.assign({}, settings, { termStartMonday: '2026-09-07' });
  const notifier = createNotifier({
    // 9/14 是第 2 周周一，每周都上的课那天也该提醒
    getState: () => ({ courses: [course()], settings: s }),
    onRemind: (c) => seen.push(c.name),
  });
  notifier.tick(new Date(2026, 8, 7, 7, 45));
  notifier.tick(new Date(2026, 8, 14, 7, 45));
  assert.equal(seen.length, 2);
});
