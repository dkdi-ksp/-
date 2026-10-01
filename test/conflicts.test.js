const test = require('node:test');
const assert = require('node:assert');

// ui.js 依赖 DOM，无法在 Node 中 require；把纯逻辑抽到 js/conflicts.js
const { findConflicts } = require('../js/conflicts.js');

// 每次调用都给一个新 id：若默认 id 相同，会被「编辑时排除自己」的规则挡掉，
// 导致「期望不冲突」的断言因为 id 相同而假绿。
let seq = 0;
const c = (over = {}) => Object.assign({
  id: 'c' + (++seq), name: 'A', dayOfWeek: 1, startPeriod: 1, endPeriod: 2,
  weekStart: 1, weekEnd: 16, weekParity: 'all',
}, over);

test('同一天、节次重叠、周次有交集时判定冲突', () => {
  const target = c({ id: 'new' });
  assert.equal(findConflicts(target, [c({ id: 'old' })]).length, 1);
});

test('不同天不冲突', () => {
  assert.deepEqual(findConflicts(c({ dayOfWeek: 2 }), [c({ dayOfWeek: 1 })]), []);
});

test('节次不重叠不冲突', () => {
  assert.deepEqual(findConflicts(c({ startPeriod: 3, endPeriod: 4 }), [c({ startPeriod: 1, endPeriod: 2 })]), []);
  assert.equal(findConflicts(c({ startPeriod: 2, endPeriod: 3 }), [c({ startPeriod: 1, endPeriod: 2 })]).length, 1, '共享第 2 节即冲突');
});

test('周次范围无交集不冲突', () => {
  assert.deepEqual(findConflicts(c({ weekStart: 1, weekEnd: 4 }), [c({ weekStart: 5, weekEnd: 8 })]), []);
});

test('单周与双周不冲突', () => {
  assert.deepEqual(findConflicts(c({ weekParity: 'odd' }), [c({ weekParity: 'even' })]), []);
  assert.equal(findConflicts(c({ weekParity: 'odd' }), [c({ weekParity: 'odd' })]).length, 1);
  assert.equal(findConflicts(c({ weekParity: 'all' }), [c({ weekParity: 'even' })]).length, 1);
});

test('编辑时不把自己算作冲突', () => {
  const self = c({ id: 'me' });
  assert.deepEqual(findConflicts(self, [self]), []);
});
