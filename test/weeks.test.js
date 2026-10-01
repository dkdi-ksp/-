const test = require('node:test');
const assert = require('node:assert');
const W = require('../js/weeks.js');

const course = (over = {}) => Object.assign({
  id: 'c1', name: '高等数学', dayOfWeek: 1, startPeriod: 1, endPeriod: 2,
  weekStart: 1, weekEnd: 16, weekParity: 'all',
}, over);

// 2026-09-07 是周一
const TERM = W.parseLocalDate('2026-09-07');

test('parseLocalDate 按本地时区解析，不偏移一天', () => {
  const d = W.parseLocalDate('2026-09-07');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 8);   // 9 月
  assert.equal(d.getDate(), 7);
  assert.equal(d.getHours(), 0);
});

test('daysBetween 计算整数天', () => {
  assert.equal(W.daysBetween(W.parseLocalDate('2026-09-07'), W.parseLocalDate('2026-09-07')), 0);
  assert.equal(W.daysBetween(W.parseLocalDate('2026-09-07'), W.parseLocalDate('2026-09-14')), 7);
  assert.equal(W.daysBetween(W.parseLocalDate('2026-12-28'), W.parseLocalDate('2027-01-04')), 7, '跨年');
});

test('currentWeek 在学期边界上正确', () => {
  assert.equal(W.currentWeek(TERM, TERM), 1, '开始当天是第 1 周');
  assert.equal(W.currentWeek(W.parseLocalDate('2026-09-13'), TERM), 1, '第 7 天仍是第 1 周');
  assert.equal(W.currentWeek(W.parseLocalDate('2026-09-14'), TERM), 2, '第 8 天是第 2 周');
  assert.equal(W.currentWeek(W.parseLocalDate('2026-09-06'), TERM), 0, '开始前一天返回 0');
  assert.equal(W.currentWeek(W.parseLocalDate('2025-01-01'), TERM), 0, '很久以前返回 0');
});

test('currentWeek 在日期远超学期时返回大于总周数的值，由调用方判断', () => {
  assert.equal(W.currentWeek(W.parseLocalDate('2027-06-01'), TERM), 39, '不截断、不返回负数');
});

test('currentWeek 未设置学期开始日期时返回 0', () => {
  assert.equal(W.currentWeek(new Date(), null), 0);
  assert.equal(W.currentWeek(new Date(), ''), 0);
});

test('matchesParity', () => {
  assert.equal(W.matchesParity('all', 3), true);
  assert.equal(W.matchesParity('odd', 3), true);
  assert.equal(W.matchesParity('odd', 4), false);
  assert.equal(W.matchesParity('even', 4), true);
  assert.equal(W.matchesParity('even', 3), false);
});

test('isActive 组合周次范围与奇偶', () => {
  assert.equal(W.isActive(course(), 1), true);
  assert.equal(W.isActive(course(), 16), true);
  assert.equal(W.isActive(course(), 17), false, '超出 weekEnd');
  assert.equal(W.isActive(course(), 0), false, '周次为 0');
  assert.equal(W.isActive(course({ weekParity: 'odd' }), 2), false, '奇偶不符');
  assert.equal(W.isActive(course({ weekStart: 5, weekEnd: 10, weekParity: 'odd' }), 4), false, '范围与奇偶皆不符');
  assert.equal(W.isActive(course({ weekStart: 5, weekEnd: 10, weekParity: 'odd' }), 7), true);
});

test('firstMatchingWeek 对齐到第一个匹配奇偶的周', () => {
  assert.equal(W.firstMatchingWeek(course()), 1);
  assert.equal(W.firstMatchingWeek(course({ weekStart: 4, weekEnd: 10, weekParity: 'odd' })), 5, '起始周为偶数但要求单周，应跳到 5');
  assert.equal(W.firstMatchingWeek(course({ weekStart: 4, weekEnd: 10, weekParity: 'even' })), 4);
  assert.equal(W.firstMatchingWeek(course({ weekStart: 3, weekEnd: 3, weekParity: 'even' })), null, '单周区间内无匹配');
});

test('activeCoursesInWeek 只返回该周要上的课', () => {
  const list = [
    course({ id: 'a', weekParity: 'all' }),
    course({ id: 'b', weekParity: 'odd' }),
    course({ id: 'c', weekParity: 'even' }),
    course({ id: 'd', weekStart: 5, weekEnd: 8 }),
  ];
  assert.deepEqual(W.activeCoursesInWeek(list, 3).map(c => c.id), ['a', 'b']);
  assert.deepEqual(W.activeCoursesInWeek(list, 6).map(c => c.id), ['a', 'c', 'd']);
});

test('courseStartAt 返回当天开始时刻，节次越界返回 null', () => {
  const periods = [
    { index: 1, start: '08:00', end: '08:55' },
    { index: 2, start: '08:55', end: '09:50' },
  ];
  const d = W.courseStartAt(course(), W.parseLocalDate('2026-09-07'), periods);
  assert.equal(d.getHours(), 8);
  assert.equal(d.getMinutes(), 0);
  assert.equal(W.courseStartAt(course({ startPeriod: 6 }), TERM, periods), null, '节次越界');
  assert.equal(W.courseStartAt(course(), TERM, []), null, '节次表为空');
});

test('occurrencesInRange 枚举区间内的上课时刻', () => {
  const courses = [course({ id: 'a', weekParity: 'all' }), course({ id: 'b', weekParity: 'odd' })];
  const out = W.occurrencesInRange(courses, W.parseLocalDate('2026-09-07'), W.parseLocalDate('2026-09-20'), TERM);
  // 9/7 是第 1 周周一（单周），9/14 是第 2 周周一（双周）
  assert.equal(out.length, 3, 'a 出现 2 次，b 只出现第 1 周那次');
  assert.deepEqual(out.map(o => o.course.id), ['a', 'b', 'a']);
  assert.equal(out[0].date.getDate(), 7);
  assert.equal(out[2].date.getDate(), 14);
});

test('occurrencesInRange 在未设置学期时返回空数组', () => {
  assert.deepEqual(W.occurrencesInRange([course()], W.parseLocalDate('2026-09-07'), W.parseLocalDate('2026-09-20'), null), []);
});

// ---- 课表网格布局（供 ui.js 渲染用，把行/列/跨行的算术从 DOM 代码里抽出来单独测）----

test('buildWeekGrid 计算格子坐标与跨行数', () => {
  const g = W.buildWeekGrid([course({ startPeriod: 3, endPeriod: 4, dayOfWeek: 3 })], 5, 8);
  assert.equal(g.periodCount, 8);
  assert.equal(g.cells.length, 1);
  assert.deepEqual(
    { col: g.cells[0].col, row: g.cells[0].row, rowSpan: g.cells[0].rowSpan, active: g.cells[0].active },
    { col: 4, row: 3, rowSpan: 2, active: true },
    '第 3-4 节、周三 → 第 3 行、第 4 列、跨 2 行'
  );
});

test('buildWeekGrid 周日落在第 8 列', () => {
  const g = W.buildWeekGrid([course({ dayOfWeek: 7 })], 1, 8);
  assert.equal(g.cells[0].col, 8);
});

test('buildWeekGrid 标记奇偶不符的课为 inactive 而不是丢掉', () => {
  const g = W.buildWeekGrid([course({ weekParity: 'odd' })], 4, 8);
  assert.equal(g.cells.length, 1, '仍在周次范围内，应保留为灰色占位');
  assert.equal(g.cells[0].active, false);
});

test('buildWeekGrid 丢弃完全不在本周次范围内的课', () => {
  assert.equal(W.buildWeekGrid([course({ weekStart: 5, weekEnd: 8 })], 4, 8).cells.length, 0);
  assert.equal(W.buildWeekGrid([course({ weekStart: 5, weekEnd: 8 })], 9, 8).cells.length, 0);
  assert.equal(W.buildWeekGrid([course({ weekStart: 5, weekEnd: 8 })], 5, 8).cells.length, 1);
});

test('buildWeekGrid 丢弃节次表里不存在的课', () => {
  assert.equal(W.buildWeekGrid([course({ startPeriod: 9, endPeriod: 9 })], 1, 8).cells.length, 0, '起始节超出节次总数');
  assert.equal(W.buildWeekGrid([course({ startPeriod: 1, endPeriod: 1 })], 1, 0).cells.length, 0, '节次表为空');
});

test('buildWeekGrid 把超出节次总数的结束节裁剪掉', () => {
  const g = W.buildWeekGrid([course({ startPeriod: 7, endPeriod: 12 })], 1, 8);
  assert.equal(g.cells[0].row, 7);
  assert.equal(g.cells[0].rowSpan, 2, '第 7 节到第 8 节，跨 2 行而不是 6 行');
});

test('buildWeekGrid 保留渲染需要的展示字段', () => {
  const g = W.buildWeekGrid([course({ name: '大学英语', location: 'B-102', color: '#fff' })], 1, 8);
  assert.equal(g.cells[0].name, '大学英语');
  assert.equal(g.cells[0].location, 'B-102');
  assert.equal(g.cells[0].color, '#fff');
  assert.ok(g.cells[0].id);
});

test('courseEndAt 返回当天结束时刻，节次越界返回 null', () => {
  const periods = [
    { index: 1, start: '08:00', end: '08:55' },
    { index: 2, start: '08:55', end: '09:50' },
  ];
  const d = W.courseEndAt(course(), W.parseLocalDate('2026-09-07'), periods);
  assert.equal(d.getHours(), 9);
  assert.equal(d.getMinutes(), 50);
  assert.equal(W.courseEndAt(course({ endPeriod: 6 }), TERM, periods), null, '节次越界');
  assert.equal(W.courseEndAt(course(), TERM, []), null, '节次表为空');
});

test('isoDayOfWeek 把周日算作 7 而不是 0', () => {
  assert.equal(W.isoDayOfWeek(W.parseLocalDate('2026-09-07')), 1, '周一');
  assert.equal(W.isoDayOfWeek(W.parseLocalDate('2026-09-12')), 6, '周六');
  assert.equal(W.isoDayOfWeek(W.parseLocalDate('2026-09-13')), 7, '周日');
});
