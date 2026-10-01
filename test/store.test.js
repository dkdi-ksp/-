const test = require('node:test');
const assert = require('node:assert');
const { createStore, defaultSettings, PALETTE } = require('../js/store.js');

function memStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    _dump: () => m,
  };
}

const course = (over = {}) => Object.assign({
  name: '高等数学', teacher: '张老师', location: 'A-301',
  dayOfWeek: 1, startPeriod: 1, endPeriod: 2,
  weekStart: 1, weekEnd: 16, weekParity: 'all', note: '',
}, over);

test('defaultSettings 返回规格规定的默认值', () => {
  const s = defaultSettings();
  assert.equal(s.schemaVersion, 1);
  assert.equal(s.termName, '我的课程表');
  assert.equal(s.termStartMonday, '');
  assert.equal(s.totalWeeks, 20);
  assert.equal(s.reminderMinutes, 15);
  assert.equal(s.notifyEnabled, false);
  assert.equal(s.periods.length, 8);
  assert.deepEqual(s.periods[0], { index: 1, start: '08:00', end: '08:55' });
  assert.deepEqual(s.periods[7], { index: 8, start: '17:00', end: '17:55' });
});

test('addCourse 分配 id 与色板颜色并持久化', () => {
  const st = createStore(memStorage());
  const a = st.addCourse(course());
  const b = st.addCourse(course({ name: '线性代数' }));
  assert.ok(a.id, '应分配 id');
  assert.notEqual(a.id, b.id);
  assert.equal(a.color, PALETTE[0]);
  assert.equal(b.color, PALETTE[1]);
  assert.equal(st.getCourses().length, 2);
});

test('addCourse 不接受非法课程', () => {
  const st = createStore(memStorage());
  assert.throws(() => st.addCourse(course({ name: '' })), /课程名/);
  assert.throws(() => st.addCourse(course({ dayOfWeek: 8 })), /星期/);
  assert.throws(() => st.addCourse(course({ startPeriod: 3, endPeriod: 2 })), /节次/);
  assert.throws(() => st.addCourse(course({ weekStart: 10, weekEnd: 3 })), /周次/);
  assert.throws(() => st.addCourse(course({ weekParity: 'x' })), /单双周/);
});

test('updateCourse / deleteCourse 生效', () => {
  const st = createStore(memStorage());
  const a = st.addCourse(course());
  st.updateCourse(a.id, { location: 'B-202' });
  assert.equal(st.getCourses()[0].location, 'B-202');
  assert.equal(st.updateCourse('不存在', { location: 'X' }), null);
  st.deleteCourse(a.id);
  assert.equal(st.getCourses().length, 0);
});

test('saveSettings 浅合并并校验节次时间格式', () => {
  const st = createStore(memStorage());
  st.saveSettings({ totalWeeks: 18 });
  assert.equal(st.getSettings().totalWeeks, 18);
  assert.equal(st.getSettings().termName, '我的课程表', '未指定的字段应保持默认');
  assert.throws(() => st.saveSettings({ periods: [{ index: 1, start: '8:00', end: '09:00' }] }), /HH:MM/);
  assert.throws(() => st.saveSettings({ periods: [{ index: 1, start: '10:00', end: '09:00' }] }), /晚于/);
});

test('exportJSON / importJSON 往返一致', () => {
  const st = createStore(memStorage());
  st.addCourse(course());
  st.saveSettings({ termStartMonday: '2026-09-07' });
  const text = st.exportJSON();

  const st2 = createStore(memStorage());
  const r = st2.importJSON(text);
  assert.equal(r.ok, true);
  assert.equal(r.courseCount, 1);
  assert.equal(st2.getCourses()[0].name, '高等数学');
  assert.equal(st2.getSettings().termStartMonday, '2026-09-07');
});

test('importJSON 拒绝垃圾数据且不破坏现有数据', () => {
  const st = createStore(memStorage());
  st.addCourse(course());
  assert.equal(st.importJSON('不是 JSON').ok, false);
  assert.equal(st.importJSON('{"schemaVersion":1}').ok, false);
  assert.equal(st.importJSON('{"schemaVersion":1,"courses":{},"settings":{}}').ok, false);
  assert.equal(st.getCourses().length, 1, '失败的导入不应改动现有数据');
});

test('clearAll 清空课程但保留设置默认值', () => {
  const st = createStore(memStorage());
  st.addCourse(course());
  st.saveSettings({ totalWeeks: 16 });
  st.clearAll();
  assert.equal(st.getCourses().length, 0);
  assert.equal(st.getSettings().totalWeeks, 20);
});

test('getSettings 在存储为空时返回默认值', () => {
  const st = createStore(memStorage());
  assert.deepEqual(st.getSettings(), defaultSettings());
});
