const test = require('node:test');
const assert = require('node:assert');
const { nextClass } = require('../js/nextclass.js');

const settings = {
  termStartMonday: '2026-09-07', totalWeeks: 20,
  periods: [
    { index: 1, start: '08:00', end: '08:55' },
    { index: 2, start: '08:55', end: '09:50' },
    { index: 3, start: '10:05', end: '11:00' },
  ],
};
// 2026-09-07 周一
const course = (over = {}) => Object.assign({
  id: 'c1', name: '高等数学', location: 'A-301', dayOfWeek: 1,
  startPeriod: 1, endPeriod: 2, weekStart: 1, weekEnd: 16, weekParity: 'all',
}, over);

test('返回今天还没开始的最近一节课', () => {
  const r = nextClass([course()], settings, new Date(2026, 8, 7, 7, 30));
  assert.equal(r.course.name, '高等数学');
  assert.equal(r.minutesLeft, 30);
});

test('课程已开始但未结束时仍返回该课，分钟数为 0', () => {
  const r = nextClass([course()], settings, new Date(2026, 8, 7, 8, 10));
  assert.equal(r.course.name, '高等数学');
  assert.equal(r.minutesLeft, 0);
});

test('全部结束后返回 null', () => {
  assert.equal(nextClass([course()], settings, new Date(2026, 8, 7, 12, 0)), null);
});

test('今天没有课时返回 null', () => {
  assert.equal(nextClass([course()], settings, new Date(2026, 8, 8, 7, 30)), null, '9/8 是周二');
});

test('跳过该周不上课的日子', () => {
  // 2026-09-14 是第 2 周周一，课程只在单周上 → 当天无课
  assert.equal(nextClass([course({ weekParity: 'odd' })], settings, new Date(2026, 8, 14, 7, 30)), null);
});

test('未设置学期开始日期时返回 null', () => {
  assert.equal(nextClass([course()], Object.assign({}, settings, { termStartMonday: '' }), new Date(2026, 8, 7, 7, 30)), null);
});

test('多门课时返回时间最早的那节', () => {
  const list = [course({ id: 'b', name: '英语', startPeriod: 3, endPeriod: 3 }), course({ id: 'a', name: '数学' })];
  assert.equal(nextClass(list, settings, new Date(2026, 8, 7, 7, 30)).course.name, '数学');
});

test('节次越界的课程被忽略且不抛异常', () => {
  const bad = [course({ startPeriod: 9, endPeriod: 9 })];
  assert.equal(nextClass(bad, settings, new Date(2026, 8, 7, 7, 30)), null);
});

// 计划的散文只说「跳过已开始的」，但上面第 3 条要求已结束的课不返回 ——
// 没有结束时刻就分不清「正在进行」和「早就上完了」，所以补这两条。
test('已结束的课不再返回，返回其后还没开始的那节', () => {
  const list = [course({ id: 'a', name: '数学' }), course({ id: 'b', name: '英语', startPeriod: 3, endPeriod: 3 })];
  const r = nextClass(list, settings, new Date(2026, 8, 7, 10, 0));
  assert.equal(r.course.name, '英语', '数学 09:50 已结束，应轮到 10:05 的英语');
  assert.equal(r.minutesLeft, 5);
});

test('正在上的那节优先于之后才开始的课', () => {
  const list = [course({ id: 'a', name: '数学' }), course({ id: 'b', name: '英语', startPeriod: 3, endPeriod: 3 })];
  const r = nextClass(list, settings, new Date(2026, 8, 7, 8, 30));
  assert.equal(r.course.name, '数学', '08:00-09:50 正在进行');
  assert.equal(r.minutesLeft, 0);
});
