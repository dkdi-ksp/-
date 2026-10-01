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
  assert.ok(PALETTE.indexOf(a.color) >= 0, '颜色应来自色板');
  assert.ok(PALETTE.indexOf(b.color) >= 0, '颜色应来自色板');
  assert.equal(st.getCourses().length, 2);
});

test('课程颜色由 id 稳定决定，与录入顺序无关', () => {
  const st = createStore(memStorage());
  const a = st.addCourse(course({ name: '语文' }));
  const b = st.addCourse(course({ name: '数学' }));

  // 换一台设备、换一个导入顺序，同一门课（同 id）必须还是同一个颜色。
  // 这正是「按录入顺序取色」做不到的：先录哪门课，颜色就跟着变。
  const other = createStore(memStorage());
  const b2 = other.addCourse(course({ name: '数学', id: b.id }));
  const a2 = other.addCourse(course({ name: '语文', id: a.id }));
  assert.equal(b2.color, b.color, '同 id 在别的库里也应是同色');
  assert.equal(a2.color, a.color, '同 id 在别的库里也应是同色');

  // 删掉一门课，不该把剩下的课挤到别的颜色上
  st.deleteCourse(a.id);
  assert.equal(st.getCourses()[0].color, b.color, '删课不影响已有课的颜色');

  // 显式 id，避免随机 id 让「颜色够分散」这件事变成碰运气
  const many = createStore(memStorage());
  const colors = new Set();
  for (let i = 0; i < 10; i++) colors.add(many.addCourse(course({ id: 'id-' + i })).color);
  assert.ok(colors.size >= 2, '十门课不该挤在同一个颜色里');
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

// 上面那条只挡了「结构不对」。但用户选错文件时，结构往往是对的 ——
// 比如别的 App 导出的 JSON、或者手改过的备份。里面的课程字段照样能离谱，
// 而 importJSON 原本会把它们原样落盘，覆盖掉用户真正的课表。

test('importJSON 拒绝单条课程字段非法的文件，且不破坏现有数据', () => {
  const st = createStore(memStorage());
  st.addCourse(course({ name: '我真正的课' }));

  const bad = over => JSON.stringify({
    schemaVersion: 1, settings: defaultSettings(),
    courses: [course(over)],
  });

  // weekParity 非法最阴险：matchesParity 会当成「每周」照常显示，
  // 而 buildICS 的 interval 只判 'all'，会被当成隔周 → 页面每周有课，日历里少一半
  assert.equal(st.importJSON(bad({ weekParity: 'x' })).ok, false, '非法的单双周取值');
  assert.equal(st.importJSON(bad({ dayOfWeek: 99 })).ok, false, '星期超范围');
  assert.equal(st.importJSON(bad({ weekStart: 5, weekEnd: 2 })).ok, false, '结束周早于起始周');
  assert.equal(st.importJSON(bad({ name: '   ' })).ok, false, '课程名全是空格');
  assert.equal(st.importJSON(bad({ startPeriod: 9, endPeriod: 3 })).ok, false, '节次范围倒挂');

  assert.equal(st.getCourses().length, 1);
  assert.equal(st.getCourses()[0].name, '我真正的课', '失败的导入不应留下任何痕迹');
});

test('importJSON 拒绝节次表或总周数非法的设置', () => {
  const st = createStore(memStorage());
  st.addCourse(course({ name: '我真正的课' }));

  const withSettings = s => JSON.stringify({
    schemaVersion: 1, courses: [course()], settings: Object.assign(defaultSettings(), s),
  });

  assert.equal(st.importJSON(withSettings({ totalWeeks: 0 })).ok, false, '总周数为 0');
  assert.equal(st.importJSON(withSettings({ periods: [] })).ok, false, '节次表为空');
  assert.equal(st.importJSON(withSettings({
    periods: [{ index: 1, start: '99:99', end: '08:00' }],
  })).ok, false, '时间格式非法');

  assert.equal(st.getCourses().length, 1);
  assert.equal(st.getCourses()[0].name, '我真正的课', '失败的导入不应改动课程');
  assert.equal(st.getSettings().totalWeeks, 20, '失败的导入不应改动设置');
});

test('importJSON 仍然接受正常的备份文件', () => {
  const src = createStore(memStorage());
  src.addCourse(course({ name: '线性代数', weekParity: 'even' }));
  src.saveSettings({ termStartMonday: '2026-09-07', totalWeeks: 16 });

  const dst = createStore(memStorage());
  dst.addCourse(course({ name: '会被覆盖的课' }));
  const r = dst.importJSON(src.exportJSON());
  assert.equal(r.ok, true);
  assert.equal(dst.getCourses().length, 1);
  assert.equal(dst.getCourses()[0].name, '线性代数');
  assert.equal(dst.getSettings().totalWeeks, 16);
});
