# 课程表 PWA 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做一个纯离线、可装到手机主屏幕的课程表应用，支持手动录入带单双周/起止周的课程，并能把课表导出成手机系统日历（`.ics`）实现可靠的上课前提醒。

**Architecture:** 无框架、无构建步骤的静态站点。核心逻辑（周次计算、`.ics` 生成、提醒判定）写成不依赖 DOM 的纯函数，用 `node --test` 做 TDD；界面层（`ui.js`）只负责渲染和事件绑定。数据存 localStorage，通过 storage 适配器注入以便单测。浏览器端用 `启动.bat` 起一个零依赖的本地静态服务器（Service Worker 需要 localhost 这个安全上下文）。

**Tech Stack:** 原生 HTML / CSS / JavaScript（普通 `<script>`，非 ES Module）、localStorage、Node 内置 `node --test` + `node:assert` + `node:zlib`、Service Worker、Web Notifications API。

**Spec:** `docs/superpowers/specs/2026-10-02-course-schedule-app-design.md`

## Global Constraints

- **无依赖**：不引入任何 npm 包。只能用 Node 内置模块（`node:test`、`node:assert`、`node:zlib`、`node:http`、`node:fs`、`node:path`）。
- **无构建步骤**：源码即产物。所有浏览器脚本用普通 `<script src>` 加载，不用 `import`/`export`。
- **模块双用**：`js/weeks.js`、`js/ics.js`、`js/store.js`、`js/notify.js` 必须是「浏览器全局 + Node 可 require」双用。文件顶部用 `var` 或 `function` 声明（在浏览器里自动成为 `window` 属性），文件末尾加：
  ```js
  if (typeof module !== 'undefined' && module.exports) module.exports = <该文件导出的对象>;
  ```
  在 Node 中 require 依赖时用：
  ```js
  var CWweeks = (typeof module !== 'undefined' && module.exports) ? require('./weeks.js') : window.CWweeks;
  ```
- **时区**：一律 `Asia/Shanghai`，固定 `+0800`，无夏令时。
- **`.ics` 行结束符**：必须是 CRLF（`\r\n`），不是 `\n`。
- **节次索引**：`periods` 数组从 1 开始连续编号，`periods[i-1]` 对应第 `i` 节。
- **星期编号**：`dayOfWeek` 1=周一 … 7=周日。BYDAY 映射表 `['MO','TU','WE','TH','FR','SA','SU']`。
- **颜色色板**（10 色，`store.js` 中的 `PALETTE`，按顺序取用）：
  `['#7C9EF3','#F3A17C','#7CC7A5','#C79EF3','#F3D07C','#7CC0F3','#F38EA6','#9EF37C','#A8B4C0','#E0A0C8']`
- **存储键**：`claudeword.courses.v1`、`claudeword.settings.v1`
- **默认值**：`totalWeeks = 20`、`reminderMinutes = 15`、`termName = '我的课程表'`、`termStartMonday = ''`
- **默认节次**：08:00-08:55 / 08:55-09:50 / 10:05-11:00 / 11:00-11:55 / 14:00-14:55 / 14:55-15:50 / 16:05-17:00 / 17:00-17:55
- **平台**：Windows，工作目录 `D:\claude word`，Node v24。

## Review Focus

以下五类输入 spec 隐含要求但没有任何任务的测试覆盖，最容易在真实使用中出问题。每一项都在下方指定任务的测试中固定下来：

1. **学期开始日期被填成未来或很早以前**（如填成 2025 年而非 2026 年）—— 应正常显示「学期尚未开始 / 已结束」，而不是返回负数或大于总周数的周次后崩溃。→ Task 2
2. **节次表被删到只剩 2 节，但已有课程仍引用第 6 节** —— 导出时应跳过这类课程，而不是因 `periods[5]` 为 `undefined` 抛异常。→ Task 3
3. **课程名含 emoji 或生僻字（4 字节 UTF-8）** —— 折叠时按码点迭代，不能把字符切成两半。→ Task 3
4. **未设置学期开始日期就点导出** —— 应阻止导出并提示去设置，而不是生成一堆 1970 年的事件。→ Task 3
5. **课程没有教室 / 没有教师和备注** —— `.ics` 中应省略 `LOCATION` / `DESCRIPTION` 行，而不是输出 `LOCATION:` 这样的空值。→ Task 3

---

## Task 1: 仓库骨架与数据层

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `server.js`
- Create: `启动.bat`
- Create: `测试.bat`
- Create: `index.html`
- Create: `css/style.css`
- Create: `js/store.js`
- Test: `test/store.test.js`

**Interfaces:**
- Consumes: 无（第一个任务）
- Produces:
  - `store.js` 导出 `{ createStore, defaultSettings, PALETTE, KEYS }`
  - `defaultSettings() → Settings`
  - `createStore(storage) → Store`，其中 `storage` 满足 `{getItem(k), setItem(k,v), removeItem(k)}`
  - `Store` 的方法：`getCourses() → Course[]`、`addCourse(course) → Course`、`updateCourse(id, patch) → Course|null`、`deleteCourse(id) → void`、`getSettings() → Settings`、`saveSettings(patch) → Settings`、`exportJSON() → string`、`importJSON(text) → {ok, error?, courseCount?}`、`clearAll() → void`
  - `index.html` 中：`window.app = { store }`（`store` 由 `createStore(window.localStorage)` 创建）
  - `启动.bat` 起本地服务器于 `http://localhost:8080`

- [ ] **Step 1: 初始化仓库**

```bash
cd "D:/claude word"
git init
```

`.gitignore` 内容：

```
node_modules/
.claude/
*.tmp
~$*
```

`package.json` 内容：

```json
{
  "name": "claude-word-timetable",
  "private": true,
  "version": "1.0.0",
  "type": "commonjs",
  "scripts": { "test": "node --test" }
}
```

- [ ] **Step 2: 写失败的测试**

`test/store.test.js`：

```js
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
```

- [ ] **Step 3: 运行测试确认全部失败**

Run: `node --test`
Expected: FAIL —— `Cannot find module '../js/store.js'`

- [ ] **Step 4: 实现 `js/store.js`**

实现要点（签名与行为由上面的测试固定，正文由实现者写）：

- `KEYS = { courses: 'claudeword.courses.v1', settings: 'claudeword.settings.v1' }`
- `PALETTE` 用 Global Constraints 里的 10 个色值。
- `defaultSettings()` 返回 Global Constraints 里的默认值，`periods` 用默认节次表。
- `validateCourse(c)` 在以下情况抛出带对应关键词的错误：课程名为空 → `'课程名不能为空'`；`dayOfWeek` 不在 1–7 → `'星期必须在 1-7 之间'`；`startPeriod > endPeriod` 或 `startPeriod < 1` → `'节次范围不合法'`；`weekStart > weekEnd` 或 `weekStart < 1` → `'周次范围不合法'`；`weekParity` 不在 `['all','odd','even']` → `'单双周取值不合法'`。
- `validatePeriods(periods)`：`start`/`end` 必须匹配 `/^\d{2}:\d{2}$/` 否则抛 `'时间格式必须为 HH:MM'`；`start >= end` 抛 `'每节的开始时间不能晚于或等于结束时间'`。
- `addCourse(course)`：校验 → 补 `id`（`'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)`）→ 补 `color`（`PALETTE[现有课程数 % PALETTE.length]`）→ 补 `note: ''` → 存 → 返回新对象。
- `saveSettings(patch)`：校验 `periods`（如果 patch 里有）→ 与现有设置浅合并 → 校验合并后的 `totalWeeks >= 1` → 存 → 返回。
- `importJSON(text)`：`JSON.parse` 失败 → `{ok:false, error:'不是合法的 JSON'}`；缺 `courses` 且 `courses` 不是数组 → `{ok:false, error:'文件格式不正确，缺少 courses 数组'}`；缺 `settings` → 同上。全部通过才写入，任一步失败都不得改动已有数据。
- `exportJSON()`：`JSON.stringify({schemaVersion: 1, exportedAt: new Date().toISOString(), settings, courses}, null, 2)`。
- `clearAll()`：删两个键。

- [ ] **Step 5: 运行测试确认全部通过**

Run: `node --test`
Expected: PASS，9 个测试全绿

- [ ] **Step 6: 写最小可运行的 `index.html`、`css/style.css`、`server.js`、`启动.bat`、`测试.bat`**

`index.html` 骨架（DOM 契约，后续所有任务依赖它，不要改动 id）：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>我的课程表</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header id="app-header"></header>
  <main id="view"></main>
  <nav id="tabbar">
    <button data-tab="timetable" class="active">课表</button>
    <button data-tab="today">今日</button>
    <button data-tab="settings">设置</button>
  </nav>
  <button id="fab" aria-label="添加课程">+</button>
  <div id="sheet" class="hidden"></div>
  <div id="toast" class="hidden"></div>

  <script src="js/weeks.js"></script>
  <script src="js/ics.js"></script>
  <script src="js/store.js"></script>
  <script src="js/conflicts.js"></script>
  <script src="js/nextclass.js"></script>
  <script>
    // 必须早于 ui.js：ui.js 在加载时就会读 window.app.store
    window.app = { store: CWstore.createStore(window.localStorage) };
  </script>
  <script src="js/notify.js"></script>
  <script src="js/ui.js"></script>
</body>
</html>
```

> 注意：`js/weeks.js`、`js/ics.js`、`js/conflicts.js`、`js/nextclass.js`、`js/notify.js`、`js/ui.js` 分别在 Task 2–8 中创建。本任务只创建 `js/store.js`；为避免 404，先创建这 6 个文件并各留一行 `// TODO`，后续任务填充。**脚本顺序不能改**：`weeks.js` 必须早于 `ics.js` / `nextclass.js`（后者在浏览器里读 `window.CWweeks`），store.js 必须早于那段内联脚本。

`css/style.css` 此时只需：

```css
.hidden { display: none !important; }
```

`server.js`（零依赖静态服务器，仅用 Node 内置模块）：

- `node:http` + `node:fs` + `node:path`
- 监听 `8080`，静态根目录为 `__dirname`
- `/` 映射到 `index.html`
- 按扩展名设置 `Content-Type`：`.html`→`text/html; charset=utf-8`，`.css`→`text/css; charset=utf-8`，`.js`→`text/javascript; charset=utf-8`，`.json`→`application/json; charset=utf-8`，`.webmanifest`→`application/manifest+json; charset=utf-8`，`.png`→`image/png`，`.svg`→`image/svg+xml`，`.ics`→`text/calendar; charset=utf-8`
- **路径穿越防护**：解析出绝对路径后，必须校验它以根目录开头，否则返回 403
- `sw.js` 必须响应头 `Service-Worker-Allowed: /`，且**不得被缓存**（`Cache-Control: no-cache`）
- 文件不存在返回 404，控制台打印 `服务已启动：http://localhost:8080`

`启动.bat`：

```bat
@echo off
cd /d "%~dp0"
start "" http://localhost:8080
node server.js
pause
```

`测试.bat`：

```bat
@echo off
cd /d "%~dp0"
node --test
pause
```

- [ ] **Step 7: 验证服务器能起**

Run: `node server.js`（后台运行），然后 `curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/`
Expected: `200`

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "feat: 项目骨架与数据层 store.js"
```

---

## Task 2: 周次与奇偶计算

**Files:**
- Create: `js/weeks.js`
- Test: `test/weeks.test.js`

**Interfaces:**
- Consumes: 无
- Produces（`weeks.js` 导出 `window.CWweeks`）：
  - `parseLocalDate(s) → Date` —— `'YYYY-MM-DD'` → 本地零点 `Date`
  - `daysBetween(a, b) → number` —— 整数天，`b - a`
  - `currentWeek(today, termStartMonday) → number` —— 学期未开始或未设置返回 `0`
  - `matchesParity(parity, week) → boolean`
  - `isActive(course, week) → boolean`
  - `firstMatchingWeek(course) → number | null`
  - `activeCoursesInWeek(courses, week) → Course[]`
  - `courseStartAt(course, date, periods) → Date | null` —— `date` 当天该课开始时刻；节次越界返回 `null`
  - `occurrencesInRange(courses, fromDate, toDate, termStartMonday) → {date: Date, course: Course}[]`

- [ ] **Step 1: 写失败的测试**

`test/weeks.test.js`：

```js
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --testweeks.test.js`
Expected: FAIL —— `Cannot find module '../js/weeks.js'`

- [ ] **Step 3: 实现 `js/weeks.js`**

`parseLocalDate` / `daysBetween` / `currentWeek` 的算法：

```js
function parseLocalDate(s) {
  if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
  var p = String(s).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function daysBetween(a, b) {
  var ms = parseLocalDate(b).getTime() - parseLocalDate(a).getTime();
  return Math.round(ms / 86400000);
}

function currentWeek(today, termStartMonday) {
  if (!termStartMonday) return 0;
  var d = daysBetween(termStartMonday, today);
  if (d < 0) return 0;
  return Math.floor(d / 7) + 1;
}
```

`courseStartAt(course, date, periods)`：取 `periods[course.startPeriod - 1]`，若不存在返回 `null`；把 `start` 拆成 `HH:MM`，返回 `new Date(date.getFullYear(), date.getMonth(), date.getDate(), HH, MM)`。

`occurrencesInRange(courses, fromDate, toDate, termStartMonday)`：先算 `(toDate - fromDate)` 的天数逐日推进；对每一天用 `currentWeek(day, termStartMonday)` 取周次，`week === 0` 直接跳过该日；对该日匹配 `course.dayOfWeek === day.getDay() || (day.getDay() === 0 ? 7 : day.getDay())`（**注意 JS 的 `getDay()` 周日是 0，要映射成 7**）且 `isActive` 的课推入结果。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --testweeks.test.js`
Expected: PASS，12 个测试全绿

- [ ] **Step 5: 提交**

```bash
git add js/weeks.js test/weeks.test.js
git commit -m "feat: 周次与单双周计算"
```

---

## Task 3: `.ics` 日历生成

**Files:**
- Create: `js/ics.js`
- Test: `test/ics.test.js`

**Interfaces:**
- Consumes: `js/weeks.js` 的 `parseLocalDate`、`currentWeek`、`isActive`、`firstMatchingWeek`、`courseStartAt`
- Produces（`ics.js` 导出 `window.CWics`）：
  - `escapeText(s) → string`
  - `foldLine(line) → string[]`
  - `formatLocalDT(date, hhmm) → string` —— `'YYYYMMDDTHHMMSS'`
  - `formatUTC(date) → string` —— `'YYYYMMDDTHHMMSSZ'`
  - `buildICS(courses, settings) → string` —— 完整日历文本，CRLF 分行
  - `buildICSFileName(settings) → string` —— 形如 `我的课程表.ics`；`termName` 为空时用 `课程表`
  - `buildICSResult(courses, settings) → {ok: true, text, fileName} | {ok: false, error}`

- [ ] **Step 1: 写失败的测试**

`test/ics.test.js`：

```js
const test = require('node:test');
const assert = require('node:assert');
const ICS = require('../js/ics.js');

const settings = (over = {}) => Object.assign({
  schemaVersion: 1, termName: '我的课程表', termStartMonday: '2026-09-07',
  totalWeeks: 20, reminderMinutes: 15, notifyEnabled: false,
  periods: [
    { index: 1, start: '08:00', end: '08:55' },
    { index: 2, start: '08:55', end: '09:50' },
    { index: 3, start: '10:05', end: '11:00' },
    { index: 4, start: '11:00', end: '11:55' },
    { index: 5, start: '14:00', end: '14:55' },
    { index: 6, start: '14:55', end: '15:50' },
  ],
}, over);

const course = (over = {}) => Object.assign({
  id: 'c1', name: '高等数学', teacher: '张老师', location: 'A-301',
  dayOfWeek: 1, startPeriod: 1, endPeriod: 2,
  weekStart: 1, weekEnd: 16, weekParity: 'all', note: '',
}, over);

const lines = text => text.split('\r\n');

test('escapeText 按 RFC 5545 顺序转义', () => {
  assert.equal(ICS.escapeText('a,b'), 'a\\,b');
  assert.equal(ICS.escapeText('a;b'), 'a\\;b');
  assert.equal(ICS.escapeText('a\\b'), 'a\\\\b');
  assert.equal(ICS.escapeText('第一行\n第二行'), '第一行\\n第二行');
  assert.equal(ICS.escapeText('a\\,b'), 'a\\\\\\,b', '反斜杠先转义，不会二次转义逗号');
});

test('buildICS 用 CRLF 分行且以 CRLF 结尾', () => {
  const t = ICS.buildICS([course()], settings());
  assert.ok(!/[^\r]\n/.test(t), '不应出现裸 \\n');
  assert.ok(t.endsWith('END:VCALENDAR\r\n'));
  assert.ok(t.startsWith('BEGIN:VCALENDAR\r\n'));
});

test('buildICS 结构完整', () => {
  const t = ICS.buildICS([course()], settings());
  assert.ok(t.includes('VERSION:2.0'));
  assert.ok(t.includes('X-WR-CALNAME:我的课程表'));
  assert.ok(t.includes('TZID:Asia/Shanghai'));
  assert.ok(t.includes('TZOFFSETTO:+0800'));
  assert.equal(lines(t).filter(l => l === 'BEGIN:VEVENT').length, 1);
});

test('buildICS 起始时间取自节次表，结束时间取结束节', () => {
  const t = ICS.buildICS([course({ startPeriod: 3, endPeriod: 4 })], settings());
  assert.ok(t.includes('DTSTART;TZID=Asia/Shanghai:20260907T100500'), '第 3 节 10:05');
  assert.ok(t.includes('DTEND;TZID=Asia/Shanghai:20260907T115500'), '第 4 节结束 11:55');
});

test('buildICS 每周课用 INTERVAL=1 且 COUNT 等于周数', () => {
  const t = ICS.buildICS([course({ weekStart: 1, weekEnd: 16, weekParity: 'all' })], settings());
  assert.ok(t.includes('RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=16;BYDAY=MO'));
});

test('buildICS 单双周用 INTERVAL=2 且起始周对齐', () => {
  const odd = ICS.buildICS([course({ weekStart: 1, weekEnd: 16, weekParity: 'odd' })], settings());
  assert.ok(odd.includes('INTERVAL=2;COUNT=8;BYDAY=MO'), '第 1-16 周共 8 个单周');

  // 第 4 周起、要求单周 → 首个匹配周是第 5 周（2026-10-05），共 4 次（5,7,9,11）
  const late = ICS.buildICS([course({ weekStart: 4, weekEnd: 11, weekParity: 'odd' })], settings());
  assert.ok(late.includes('DTSTART;TZID=Asia/Shanghai:20261005T080000'), '跳过第 4 周，从第 5 周开始');
  assert.ok(late.includes('INTERVAL=2;COUNT=4'));
});

test('buildICS 正确映射 BYDAY', () => {
  for (let d = 1; d <= 7; d++) {
    const day = ['MO','TU','WE','TH','FR','SA','SU'][d - 1];
    const t = ICS.buildICS([course({ dayOfWeek: d })], settings());
    assert.ok(t.includes(';BYDAY=' + day), `星期 ${d} 应为 ${day}`);
  }
});

test('buildICS 的 UID 稳定可复现', () => {
  const a = ICS.buildICS([course()], settings());
  const b = ICS.buildICS([course()], settings());
  const uid = t => t.match(/UID:([^\r\n]+)/)[1];
  assert.equal(uid(a), uid(b), '重复导出 UID 必须一致，否则日历会重复添加');
  assert.ok(uid(a).includes('c1'));
});

test('reminderMinutes 为 0 时不生成 VALARM', () => {
  assert.ok(ICS.buildICS([course()], settings()).includes('BEGIN:VALARM'));
  assert.ok(!ICS.buildICS([course()], settings({ reminderMinutes: 0 })).includes('BEGIN:VALARM'));
});

test('buildICS 省略空的 LOCATION / DESCRIPTION', () => {
  const t = ICS.buildICS([course({ location: '', teacher: '', note: '' })], settings());
  assert.ok(!t.includes('LOCATION:'), '无教室时不输出 LOCATION 行');
  assert.ok(!t.includes('DESCRIPTION:'), '无教师无备注时不输出 DESCRIPTION 行');
});

test('buildICS 保留有值的 LOCATION 与 DESCRIPTION', () => {
  const t = ICS.buildICS([course({ location: 'B-202', teacher: '李老师', note: '带教材' })], settings());
  assert.ok(t.includes('LOCATION:B-202'));
  assert.ok(t.includes('DESCRIPTION:教师：李老师\\n带教材'));
});

test('buildICS 对课程名做转义', () => {
  const t = ICS.buildICS([course({ name: '数学,分析;导论' })], settings());
  assert.ok(t.includes('SUMMARY:数学\\,分析\\;导论'));
});

test('foldLine 每行不超过 75 字节且不切断字符', () => {
  const long = 'SUMMARY:' + '高等数学分析导论与习题讲解'.repeat(6);
  const out = ICS.foldLine(long);
  assert.ok(out.length > 1, '长行应被折叠');
  for (const l of out) {
    assert.ok(Buffer.byteLength(l, 'utf8') <= 75, `行超长: ${Buffer.byteLength(l, 'utf8')}`);
    assert.ok(!l.includes('\uFFFD'), '不应有被截断的字符');
  }
  assert.equal(ICS.foldLine('SUMMARY:短'), ['SUMMARY:短']);
  assert.equal(ICS.foldLine(long).join(''), long, '折叠是无损的');
});

test('foldLine 处理 4 字节字符（emoji）不切断', () => {
  const s = 'SUMMARY:' + '🎓'.repeat(30);
  const out = ICS.foldLine(s);
  for (const l of out) assert.ok(Buffer.byteLength(l, 'utf8') <= 75);
  assert.equal(out.join(''), s);
  assert.ok(!out.join('').includes('\uFFFD'), 'emoji 不应被截断成乱码');
});

test('buildICS 跳过没有匹配周次的课程', () => {
  const t = ICS.buildICS([course({ weekStart: 3, weekEnd: 3, weekParity: 'even' })], settings());
  assert.equal(lines(t).filter(l => l === 'BEGIN:VEVENT').length, 0);
});

test('buildICS 跳过引用不存在的节次的课程，不抛异常', () => {
  const courses = [course({ id: 'ok' }), course({ id: 'bad', startPeriod: 6, endPeriod: 6 })];
  const t = ICS.buildICS(courses, settings({ periods: [{ index: 1, start: '08:00', end: '08:55' }] }));
  assert.equal(lines(t).filter(l => l === 'BEGIN:VEVENT').length, 0, '两门课都引用不到有效节次');
  assert.ok(t.includes('END:VCALENDAR'), '仍然产出合法日历');
});

test('buildICS 在节次表被删短后只保留仍有效的课程', () => {
  const courses = [course({ id: 'ok', startPeriod: 1, endPeriod: 2 }), course({ id: 'bad', startPeriod: 6, endPeriod: 6 })];
  const short = settings({ periods: [
    { index: 1, start: '08:00', end: '08:55' },
    { index: 2, start: '08:55', end: '09:50' },
  ]});
  const t = ICS.buildICS(courses, short);
  assert.equal(lines(t).filter(l => l === 'BEGIN:VEVENT').length, 1);
  assert.ok(t.includes('UID:ok-1@claudeword'));
});

test('buildICSResult 在未设置学期开始日期时拒绝导出', () => {
  const r = ICS.buildICSResult([course()], settings({ termStartMonday: '' }));
  assert.equal(r.ok, false);
  assert.match(r.error, /学期/);
});

test('buildICSResult 在没有任何课程时拒绝导出', () => {
  const r = ICS.buildICSResult([], settings());
  assert.equal(r.ok, false);
  assert.match(r.error, /课程/);
});

test('buildICSResult 成功时给出文件名', () => {
  const r = ICS.buildICSResult([course()], settings());
  assert.equal(r.ok, true);
  assert.equal(r.fileName, '我的课程表.ics');
  assert.ok(r.text.includes('BEGIN:VCALENDAR'));
  assert.equal(ICS.buildICSFileName(settings({ termName: '' })), '课程表.ics');
  assert.equal(ICS.buildICSFileName(settings({ termName: '2026 秋' })), '2026 秋.ics');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --testics.test.js`
Expected: FAIL —— `Cannot find module '../js/ics.js'`

- [ ] **Step 3: 实现 `js/ics.js`**

`foldLine` 的算法（按码点迭代，字节数用 `TextEncoder`，浏览器和 Node 18+ 均内置）：

```js
var _enc = new TextEncoder();

function foldLine(line) {
  if (_enc.encode(line).length <= 75) return [line];
  var out = [], cur = '', curBytes = 0;
  // 用 for..of 按码点迭代，不会切开代理对（emoji）或任何多字节字符
  for (var ch of line) {
    var b = _enc.encode(ch).length;
    if (curBytes + b > 75) {
      out.push(cur);
      cur = ' ' + ch;
      curBytes = 1 + b;   // 续行开头的空格也占 1 字节
    } else {
      cur += ch;
      curBytes += b;
    }
  }
  out.push(cur);
  return out;
}
```

`escapeText`（顺序不能变，反斜杠必须最先）：

```js
function escapeText(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}
```

`buildICS` 的其余要点：

- `VTIMEZONE` 块固定为 spec 7.2 的内容。
- 每门课：`firstMatchingWeek(course)` 为 `null` → 跳过；`courseStartAt` 返回 `null`（节次越界）→ **跳过，不抛异常**。
- 计算 `date` = `termStartMonday + (firstWeek - 1) * 7 + (dayOfWeek - 1)` 天。
- `count`：`all` 时 `weekEnd - weekStart + 1`；否则 `Math.floor((weekEnd - firstWeek) / 2) + 1`。
- `DTEND` 的时间用 `periods[course.endPeriod - 1].end`（`DTEND` 的日期与 `DTSTART` 同一天）。
- `DESCRIPTION`：`parts = []`，有教师则 push `'教师：' + teacher`，有备注则 push `note`；`parts.length` 为 0 时整行不输出，否则 `'DESCRIPTION:' + escapeText(parts.join('\n'))`。
- `LOCATION` 为空字符串时不输出该行。
- `UID` = `course.id + '-' + firstWeek + '@claudeword'`。
- 最后：`lines.flatMap(foldLine).join('\r\n') + '\r\n'`。**折叠要在拼接前对每一行做，且折叠后的续行已经带前导空格，直接 join 即可。**

- [ ] **Step 4: 运行测试确认通过**

Run: `node --testics.test.js`
Expected: PASS，20 个测试全绿

- [ ] **Step 5: 用真实文件做一次人工核对**

把这份 `.ics` 写到临时文件并肉眼检查结构（测试断言覆盖不了的排版问题）：

```bash
node -e "const I=require('./js/ics.js');const s=require('./js/store.js');process.stdout.write(I.buildICS([{id:'c1',name:'高等数学',teacher:'张老师',location:'A-301',dayOfWeek:1,startPeriod:1,endPeriod:2,weekStart:1,weekEnd:16,weekParity:'odd',note:''}], s.defaultSettings()))" > /tmp/sample.ics
node -e "process.stdout.write(require('fs').readFileSync('/tmp/sample.ics','utf8').split('\r\n').slice(0,30).join('\n'))"
```

Expected: 能看到 `BEGIN:VCALENDAR` → `VTIMEZONE` → `VEVENT`（含 `RRULE:...INTERVAL=2;COUNT=8...` 与 `VALARM`）→ `END:VCALENDAR`，无空行、无裸 `\n`。

- [ ] **Step 6: 提交**

```bash
git add js/ics.js test/ics.test.js
git commit -m "feat: 生成手机日历 .ics 文件"
```

---

## Task 4: 课表页

**Files:**
- Modify: `js/ui.js`（首次创建实质内容）
- Modify: `css/style.css`
- Modify: `index.html`（若有需要）

**Interfaces:**
- Consumes: `window.CWweeks`、`window.app.store`
- Produces:
  - `ui.js` 末尾暴露 `window.CWui = { init, render, renderTimetable, renderToday, renderSettings, toast, esc }`，并在文件末尾自调用 `init()`（脚本位于 `</body>` 前，DOM 已就绪）
  - `ui.js` 中的模块级单例 `var store = window.app.store`
  - `var state = { tab: 'timetable', viewWeek: null }` —— `viewWeek` 为 `null` 时表示「跟随当前真实周」
  - `function render() → void` —— 按 `state.tab` 分发到 `renderTimetable()` / `renderToday()` / `renderSettings()`
  - `function renderTimetable() → void`
  - `function toast(msg, kind) → void` —— `kind` 为 `'info' | 'warn' | 'error'`
  - `function esc(s) → string` —— HTML 转义，所有插入 `innerHTML` 的用户数据都必须经过它

- [ ] **Step 1: 实现渲染**

课表页 DOM 结构（`#view` 的 innerHTML）：

```html
<div class="week-nav">
  <button id="week-prev">‹</button>
  <span id="week-label">第 3 周</span>
  <button id="week-next">›</button>
</div>
<div id="tt-wrap">
  <div class="tt-head">
    <div class="tt-corner"></div>
    <div class="tt-day">一</div> ... 共 7 个，周一…周日
  </div>
  <div class="tt-body" style="grid-template-rows: repeat(<N>, 56px)">
    <!-- 每节一行 -->
    <div class="tt-period" style="grid-row:<i>">
      <span class="p-idx"><i></span><span class="p-time">08:00</span>
    </div>
    <!-- 每个空格 -->
    <div class="tt-cell" style="grid-row:<i>;grid-column:<dayOfWeek+1>"></div>
    <!-- 每门课 -->
    <div class="course" style="grid-row:<startPeriod> / span <endPeriod-startPeriod+1>;grid-column:<dayOfWeek+1>;background:<color>">
      <span class="c-name">高等数学</span><span class="c-room">A-301</span>
    </div>
  </div>
</div>
```

- `.tt-body` 的 CSS：`display:grid; grid-template-columns: 44px repeat(7, 1fr); gap:2px;`
- 空格子必须先铺满 `节次总数 × 7` 个，再把课程格子叠上去（同格自动叠放，课程用更高 `z-index`）。
- 周的取值：`state.viewWeek != null ? state.viewWeek : currentWeek(new Date(), settings.termStartMonday)`。
- **未设置 `termStartMonday` 时**：`#view` 内只显示引导卡片「还没设置学期开始日期」+ 一个 `id="goto-settings"` 的按钮，点击切到设置页；不渲染网格。
- **`currentWeek` 返回 0**（学期未开始）或 **返回值 > `totalWeeks`**（学期已结束）时：正常渲染网格，但在 `#week-label` 下方显示一行提示「学期尚未开始，当前查看第 N 周」/「学期已结束，当前查看第 N 周」。
- 该周不上、但在别的周要上的课：渲染为灰色格子，内容是该课名 + 小字「本周不上」，加 `class="course inactive"`。
- 点击课程格子 → 调用 `openCourseForm(course)`（Task 5 实现；本任务先留一个空函数占位）。
- `#week-prev` / `#week-next` 把 `state.viewWeek` 加减 1 并夹在 `[1, totalWeeks]` 内，然后 `render()`。
- 点击左侧 `.tt-period` 行标签 → 跳转到该节次对应的今日页锚点（可选，本任务可先不做）。

- [ ] **Step 2: 实现 `esc` 与 `toast`**

`esc(s)`：`&` → `&amp;`、`<` → `&lt;`、`>` → `&gt;`、`"` → `&quot;`、`'` → `&#39;`。**课程名、教室、教师、备注全部要过 `esc`。**

`toast(msg, kind)`：往 `#toast` 写入 `esc(msg)`，移除 `.hidden`，加 `class="toast <kind>"`，1500ms 后加回 `.hidden`。用模块级的 `setTimeout` 句柄，重复调用时先 `clearTimeout`。

- [ ] **Step 3: 在浏览器中人工验证**

先写死两条测试数据方便验证（放在 `ui.js` 顶部的 `if (location.search.includes('demo'))` 分支里，Task 8 完成后删除）：

- 高等数学 / 张老师 / A-301 / 周一 1-2 节 / 1-16 周 / 每周
- 大学英语 / 王老师 / B-102 / 周三 5-6 节 / 3-12 周 / 单周

Run: `启动.bat`（或 `node server.js`），浏览器打开 `http://localhost:8080/?demo=1`
逐项确认：

- [ ] 左侧显示 8 行节次，时间与设置里的默认值一致
- [ ] 顶部显示周一到周日
- [ ] 高等数学出现在周一第 1-2 节，**格子纵向跨 2 行**
- [ ] 点 `›` 到第 3 周，`#week-label` 变「第 3 周」，此时大学英语出现（单周）
- [ ] 点 `›` 到第 4 周，大学英语消失（双周），高等数学仍在
- [ ] 点 `‹` 到第 1 周，进不去第 0 周（按钮被夹住）
- [ ] 到设置页把「学期开始日期」清空，回课表页看到引导卡片
- [ ] 把学期开始日期设成明年，看到「学期尚未开始」提示且网格仍可浏览

- [ ] **Step 4: 提交**

```bash
git add js/ui.js css/style.css index.html
git commit -m "feat: 课表周视图与周次切换"
```

---

## Task 5: 添加 / 编辑课程表单

**Files:**
- Modify: `js/ui.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `store`、`state`、`render()`、`toast()`、`esc()`（Task 4）
- Produces:
  - `function openCourseForm(course) → void` —— `course` 为 `null`/省略时是「新增」，否则是「编辑」
  - `function closeCourseForm() → void`
  - `function findConflicts(course, courses) → Course[]` —— 纯函数，导出到 `window.app` 以便单测

- [ ] **Step 1: 写 `findConflicts` 的失败测试**

`test/conflicts.test.js`：

```js
const test = require('node:test');
const assert = require('node:assert');

// ui.js 依赖 DOM，无法在 Node 中 require；把纯逻辑抽到 js/conflicts.js
const { findConflicts } = require('../js/conflicts.js');

const c = (over = {}) => Object.assign({
  id: 'x', name: 'A', dayOfWeek: 1, startPeriod: 1, endPeriod: 2,
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --testconflicts.test.js`
Expected: FAIL —— `Cannot find module '../js/conflicts.js'`

- [ ] **Step 3: 实现 `js/conflicts.js`**

导出 `{ findConflicts }`（浏览器里挂 `window.CWconflicts`，同样加 `module.exports` 守卫）。

判断逻辑：`a.dayOfWeek === b.dayOfWeek && 节次区间重叠 && 周次区间有交集 && 奇偶相容`。
- 节次重叠：`a.startPeriod <= b.endPeriod && b.startPeriod <= a.endPeriod`
- 周次交集：`a.weekStart <= b.weekEnd && b.weekStart <= a.weekEnd`
- 奇偶相容：只要有一方是 `'all'`，或两方相同，即相容；`odd` 与 `even` 不相容
- 排除 `a.id === b.id`

- [ ] **Step 4: 运行测试确认通过**

Run: `node --testconflicts.test.js`
Expected: PASS，6 个测试全绿

- [ ] **Step 5: 实现表单 `openCourseForm`**

`#sheet` 的 innerHTML（底部弹层，`position:fixed; bottom:0`，带半透明遮罩）：

```html
<form id="course-form">
  <h2>新增课程</h2>                       <!-- 编辑时为「编辑课程」 -->
  <label>课程名<input name="name" required maxlength="30"></label>
  <label>教师<input name="teacher"></label>
  <label>教室<input name="location"></label>
  <label>星期<select name="dayOfWeek">一…日</select></label>
  <label>起始节<select name="startPeriod">1…N</select></label>
  <label>结束节<select name="endPeriod">1…N</select></label>
  <label>起始周<input type="number" name="weekStart" min="1" max="<totalWeeks>"></label>
  <label>结束周<input type="number" name="weekEnd" min="1" max="<totalWeeks>"></label>
  <label>单双周<select name="weekParity">
    <option value="all">每周</option><option value="odd">单周</option><option value="even">双周</option>
  </select></label>
  <label>备注<textarea name="note"></textarea></label>
  <div class="row">
    <button type="button" id="form-copy">复制上一门课</button>
    <button type="button" id="form-cancel">取消</button>
    <button type="submit">保存</button>
    <button type="button" id="form-delete" class="danger">删除</button>   <!-- 仅编辑时 -->
  </div>
</form>
```

行为：

- 节次下拉的选项由 `settings.periods` 生成；`endPeriod` 的选项自动过滤为 `>= startPeriod`。
- 编辑时用 `course` 的现值预填。
- `#form-copy`：取 `courses[courses.length - 1]` 的值填入表单（`name` 清空，其余复制），新建模式下才显示。
- 提交时收集 `FormData` → 数字字段转 `Number` → 调 `store.addCourse` / `store.updateCourse`。
- **校验错误**：`store` 抛出的异常用 `toast(err.message, 'error')` 显示，表单不关闭。
- **冲突提示**：调 `findConflicts(新课程, store.getCourses())`，若有冲突，用 `confirm('与「X」时间冲突，仍要保存吗？')` 询问；用户确认则继续保存，否则留在表单。
- 保存成功后 `closeCourseForm()` + `render()` + `toast('已保存')`。
- `#form-delete` 用 `confirm('确定删除这门课？')` 二次确认。
- 点遮罩或 `#form-cancel` 关闭。

- [ ] **Step 6: 在浏览器中人工验证**

Run: `http://localhost:8080/`，设置里填好学期开始日期

- [ ] 点 `+`，表单从底部弹出，节次下拉有 8 项
- [ ] 课程名留空点保存 → 红色 toast「课程名不能为空」，表单不关
- [ ] 起始节选 3 后，结束节下拉里不再出现 1、2
- [ ] 保存一门周一 1-2 节的课 → 课表页立刻出现
- [ ] 再点 `+`，点「复制上一门课」→ 课程名清空、其余字段与上一门一致
- [ ] 保存一门周一 2-3 节、周次重叠的课 → 弹出冲突确认框
- [ ] 点已有课程格子 → 表单预填现值，标题为「编辑课程」，有删除按钮
- [ ] 删除后课表页立刻消失
- [ ] 在课程名里输入 `<img src=x onerror=alert(1)>` 保存 → 课表页显示为**纯文本**，不弹窗（`esc` 生效）

- [ ] **Step 7: 提交**

```bash
git add js/conflicts.js js/ui.js css/style.css test/conflicts.test.js
git commit -m "feat: 课程录入表单与冲突检测"
```

---

## Task 6: 设置页与备份

**Files:**
- Modify: `js/ui.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `store`、`render()`、`toast()`、`esc()`、`window.CWics`
- Produces: `function renderSettings() → void`、`function downloadFile(fileName, text, mime) → void`

- [ ] **Step 1: 实现设置页**

`#view` 的内容：

```html
<section class="card">
  <h2>学期</h2>
  <label>名称<input id="set-term-name"></label>
  <label>第 1 周周一<input type="date" id="set-term-start"></label>
  <label>总周数<input type="number" id="set-total-weeks" min="1" max="30"></label>
</section>

<section class="card">
  <h2>节次时间</h2>
  <div id="periods-editor"></div>
  <button id="period-add">+ 增加一节</button>
</section>

<section class="card">
  <h2>提醒</h2>
  <label>提前<input type="number" id="set-remind" min="0" max="120">分钟提醒</label>
  <label><input type="checkbox" id="set-notify"> 启用 App 内通知</label>
  <p class="hint">App 关闭后不保证准时提醒。要可靠的提醒请用下面的「导出到手机日历」。</p>
</section>

<section class="card">
  <h2>导出</h2>
  <button id="export-ics">导出到手机日历（.ics）</button>
  <button id="export-json">导出备份（.json）</button>
  <label class="file-btn">导入备份<input type="file" id="import-json" accept=".json,application/json" hidden></label>
</section>

<section class="card">
  <h2>关于</h2>
  <p class="hint">版本 1.0.0</p>
  <p class="hint">数据保存在这台设备的浏览器里。清除浏览器数据会丢失，请定期导出备份。</p>
  <button id="clear-all" class="danger">清除全部数据</button>
</section>
```

行为：

- 每个输入框 `change` 时立刻 `store.saveSettings({...})` 并 `toast('已保存')`。
- 「第 1 周周一」用 `<input type="date">`，值直接是 `YYYY-MM-DD`。
- 「总周数」改小后，已有的 `periods` 与课程不动；Task 4 的课表页对超范围课程自然显示为空。
- `#set-notify`：本任务先只做 `store.saveSettings({notifyEnabled: checked})`，并在勾选时留一行注释 `// Task 8 接线：改调 app.notifier.setEnabled(...)`。**不要**在这里引用 `CWnotify`——通知器实例由 Task 8 在 `ui.js` 里创建并挂到 `window.app.notifier`。
- **节次编辑器**：每一行是 `<div class="period-row"><span>第 1 节</span><input type="time" value="08:00"><input type="time" value="08:55"><button>删除</button></div>`。改动或增删后立即 `store.saveSettings({periods})`，由 `store` 的校验拦截非法值，捕获异常后 `toast(err.message, 'error')` 并把该行标红。行数最少保留 1 行。
- 每行的 `index` 在保存前按当前顺序重排为 1..N。

- [ ] **Step 2: 实现导出与导入**

`downloadFile(fileName, text, mime)`：造 `new Blob([text], {type: mime})` → `URL.createObjectURL` → 建一个 `a` 元素设 `href` 与 `download` → 点击 → `URL.revokeObjectURL`。

- **导出 .ics**：`CWics.buildICSResult(store.getCourses(), store.getSettings())`；`ok === false` 时 `toast(result.error, 'error')`；成功则 `downloadFile(result.fileName, result.text, 'text/calendar;charset=utf-8')`。
- **导出 .json**：`downloadFile('课程表备份.json', store.exportJSON(), 'application/json')`。
- **导入 .json**：读 `input.files[0]`，用 `file.text()` 拿到内容 → 先 `confirm('导入将覆盖当前 ' + store.getCourses().length + ' 门课程，继续吗？')` → 确认后 `store.importJSON(text)`；`ok === false` 则 `toast(error, 'error')`，否则 `toast('已导入 ' + courseCount + ' 门课程')` + `render()`。**无论成功失败都要把 `input.value` 清空**，否则同一个文件选第二次不触发 `change`。
- **清除全部数据**：`confirm('将删除全部课程和设置，此操作不可撤销。继续吗？')` → `store.clearAll()` → `render()`。

- [ ] **Step 3: 在浏览器中人工验证**

- [ ] 改学期名称 → 刷新页面后仍是新值
- [ ] 改第 1 周周一 → 课表页的当前周随之变化
- [ ] 点「+ 增加一节」→ 出现第 9 行；删除一行 → 后面的节次编号自动前移
- [ ] 把某节的开始时间改到晚于结束时间 → 红色 toast 报错，且该行标红
- [ ] 点「导出到手机日历」→ 下载到 `我的课程表.ics`；用文本编辑器打开，中文正常、无乱码
- [ ] 清空学期开始日期后点导出 → 红色 toast 提示去设置，不下载文件
- [ ] 删除所有课程后点导出 → 红色 toast 提示没有课程
- [ ] 点「导出备份」→ 下载 `.json`；「清除全部数据」后「导入备份」→ 课程全部回来
- [ ] 选一个非 JSON 的文件导入 → 红色 toast，原有数据不变

- [ ] **Step 4: 提交**

```bash
git add js/ui.js css/style.css
git commit -m "feat: 设置页、节次编辑器与备份导入导出"
```

---

## Task 7: 今日页

**Files:**
- Modify: `js/ui.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `store`、`render()`、`esc()`、`window.CWweeks`、`window.CWics`
- Produces:
  - `function renderToday() → void`
  - `function nextClass(courses, settings, now) → {course, startAt, minutesLeft} | null` —— 导出到 `window.app` 以便单测

- [ ] **Step 1: 写 `nextClass` 的失败测试**

`test/nextclass.test.js`：

```js
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --testnextclass.test.js`
Expected: FAIL —— `Cannot find module '../js/nextclass.js'`

- [ ] **Step 3: 实现 `js/nextclass.js`**

导出 `{ nextClass }`（同样加 `module.exports` 守卫，浏览器挂 `window.CWnextclass`），依赖 `weeks.js`（用双用 require 模式）。

逻辑：若 `termStartMonday` 为空返回 `null`；用 `currentWeek(now, termStartMonday)` 取周次，为 0 或超出 `totalWeeks` 返回 `null`；筛出 `dayOfWeek` 等于今天（周日按 7 算）且 `isActive` 的课；对每门课用 `courseStartAt` 取开始时刻，`null` 则跳过；把开始时刻 `< now` 的课也保留（判定为「正在进行」）；取开始时刻最早的一门，`minutesLeft = Math.max(0, Math.round((startAt - now) / 60000))`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --testnextclass.test.js`
Expected: PASS，8 个测试全绿

- [ ] **Step 5: 实现今日页渲染**

- 顶部大卡片：有下一节课时显示「下一节课」+ 课名 + `startAt` 的 `HH:MM` + 教室 + 「还有 N 分钟」（`minutesLeft === 0` 时显示「正在进行」）；没有时显示「今天没有课了」。
- 下方「今天的课」列表：`occurrencesInRange(courses, today, today, termStartMonday)` 得到今天的课，按开始节次排序，每条显示节次时间段 + 课名 + 教师 + 教室。
- 已过结束时间的课加 `class="past"` 置灰。
- 空列表显示「今天没有课」。
- 页面每次切到今日页时重新渲染；页面可见性变化（`document.visibilitychange` → `visible`）时也重渲染，保证切回 App 时数据是新的。

- [ ] **Step 6: 在浏览器中人工验证**

把系统时间附近的课造出来（或把某节课的节次时间临时改成「当前时间 + 10 分钟」）：

- [ ] 今日页顶部显示「下一节课」卡片与正确的剩余分钟数
- [ ] 把某节课的节次时间设成已过去 → 它出现在下方列表并置灰
- [ ] 把某节课设为双周而今天是单周 → 今日页不出现它
- [ ] 切到课表页再切回来 → 内容刷新
- [ ] 清空学期开始日期 → 今日页显示「今天没有课了」而不报错

- [ ] **Step 7: 提交**

```bash
git add js/nextclass.js js/ui.js css/style.css test/nextclass.test.js
git commit -m "feat: 今日页与下一节课倒计时"
```

---

## Task 8: App 内通知

**Files:**
- Modify: `js/notify.js`
- Test: `test/notify.test.js`
- Modify: `js/ui.js`

**Interfaces:**
- Consumes: `js/weeks.js`
- Produces（`notify.js` 导出 `window.CWnotify`）：
  - `dueReminders(courses, settings, now, firedKeys) → {key, course, startAt}[]` —— 纯函数
  - `createNotifier({getState}) → Notifier`
  - `Notifier.start() → void`、`Notifier.stop() → void`、`Notifier.setEnabled(bool) → Promise<boolean>`
  - `ui.js` 中创建并列唯一的通知器实例：
    ```js
    window.app.notifier = CWnotify.createNotifier({
      getState: function () { return { courses: store.getCourses(), settings: store.getSettings() }; }
    });
    ```
    Task 6 留下来的 `#set-notify` 处理函数在本任务改为调 `app.notifier.setEnabled(checked)`：返回 `true` 就保持勾选，返回 `false` 就把勾选框还原为未选中。

- [ ] **Step 1: 写 `dueReminders` 的失败测试**

`test/notify.test.js`：

```js
const test = require('node:test');
const assert = require('node:assert');
const { dueReminders } = require('../js/notify.js');

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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --testnotify.test.js`
Expected: FAIL —— `Cannot find module '../js/notify.js'`

- [ ] **Step 3: 实现 `dueReminders`**

对每门课：`courseStartAt` 得到 `startAt`，为 `null` 跳过；`settings.reminderMinutes <= 0` 直接返回空；`triggerAt = startAt - reminderMinutes * 60000`；`key = course.id + '|' + yyyymmdd(now)`；仅当 `triggerAt <= now < startAt` 且 `key` 不在 `firedKeys` 中时产出。还要先检查该课在 `currentWeek(now, termStartMonday)` 这周是否 `isActive`，以及 `dayOfWeek` 是否是今天。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --testnotify.test.js`
Expected: PASS，10 个测试全绿

- [ ] **Step 5: 实现 `createNotifier`**

- `setEnabled(true)`：调 `Notification.requestPermission()`，若返回 `'granted'` 则存 `notifyEnabled: true` 并 `start()`，返回 `true`；否则 `toast` 提示用户浏览器拒绝了通知权限，返回 `false`。
- `start()`：先 `stop()`，然后 `setInterval(tick, 60000)` 并存句柄；`tick` 里调 `dueReminders(courses, settings, new Date(), firedKeys)`，对每条结果：加入 `firedKeys`；若有通知权限就 `new Notification(course.name, {body: '在 ' + location + ' · 还有 N 分钟'})`；同时页内横幅 + `beep()` + `navigator.vibrate(200)`。
- `beep()`：用 `AudioContext` 生成一个 880Hz、200ms 的方波，避免依赖音频文件。`AudioContext` 必须懒加载并在首次用户交互后创建（移动端浏览器要求）。
- `firedKeys` 跨日清空：`tick` 里记录上次的日期字符串，变化时 `firedKeys.clear()`。
- `stop()`：`clearInterval` 并置空句柄。
- 页面加载时若 `settings.notifyEnabled` 为 `true` 且 `Notification.permission === 'granted'`，自动 `start()`。
- 在设置页与今日页的明显位置放一行固定文案：**「App 关闭后不保证准时提醒；可靠的提醒请用系统日历（设置页 → 导出到手机日历）。」**

- [ ] **Step 6: 在浏览器中人工验证**

- [ ] 设置页勾选「启用 App 内通知」→ 浏览器弹出权限请求
- [ ] 点「允许」→ 勾选框保持选中，刷新后仍是选中
- [ ] 点「拒绝」（在浏览器站点设置里改）→ 弹红色 toast 说明权限被拒，勾选框自动取消
- [ ] 把某节课的节次时间改成「当前时间 + 16 分钟」，提前量设 15 分钟 → 等 1 分钟内出现页内横幅 + 蜂鸣 + 震动
- [ ] 同一条提醒在接下来的 1 分钟内不重复弹出
- [ ] 把课程开始时间改成已过去 → 不再补发提醒

- [ ] **Step 7: 删除 Task 4 里写死的演示数据**

删掉 `ui.js` 中 `if (location.search.includes('demo'))` 那段。

- [ ] **Step 8: 提交**

```bash
git add js/notify.js js/ui.js test/notify.test.js
git commit -m "feat: App 内提醒通知"
```

---

## Task 9: PWA 化与收尾

**Files:**
- Create: `manifest.webmanifest`
- Create: `sw.js`
- Create: `tools/make-icons.js`
- Create: `icons/icon-192.png`、`icons/icon-512.png`（由脚本生成）
- Create: `使用说明.md`
- Modify: `index.html`
- Modify: `js/ui.js`

**Interfaces:**
- Consumes: 全部既有文件
- Produces: 可安装的 PWA

- [ ] **Step 1: 实现图标生成脚本 `tools/make-icons.js`**

用 `node:zlib` 手写 PNG 编码（不引入依赖），画一个圆角方块底 + 白色日历格：

```js
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

function crc32(buf) {
  let c, crc = 0xFFFFFFFF;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xFF;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;                       // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;  // 8bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 画一个圆角方块 + 三行「课表格」
function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const r = size * 0.22;            // 圆角半径
  const bg = [0x4A, 0x7C, 0xE8];    // 主色
  const fg = [0xFF, 0xFF, 0xFF];
  const put = (x, y, rgb) => {
    const i = (y * size + x) * 4;
    px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = 255;
  };
  // 底：圆角方块（带 2x2 超采样抗锯齿）
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let hit = 0;
    for (const dy of [0.25, 0.75]) for (const dx of [0.25, 0.75]) {
      const fx = x + dx, fy = y + dy;
      const cx = Math.min(Math.max(fx, r), size - r);
      const cy = Math.min(Math.max(fy, r), size - r);
      if ((fx - cx) ** 2 + (fy - cy) ** 2 <= r * r) hit++;
    }
    if (hit) {
      const i = (y * size + x) * 4;
      const a = hit / 4;
      // PNG 用的是非预乘 alpha：颜色分量保持原值，只有 alpha 随抗锯齿变化
      px[i] = bg[0];
      px[i + 1] = bg[1];
      px[i + 2] = bg[2];
      px[i + 3] = Math.round(255 * a);
    }
  }
  // 前：横线标题条 + 2x3 的格子
  const m = Math.round(size * 0.24);        // 边距
  const barH = Math.round(size * 0.09);
  for (let y = m; y < m + barH; y++)       // 顶部标题条（整条横贯）
    for (let x = m; x < size - m; x++) put(x, y, fg);
  const gap = Math.round(size * 0.06);
  const gx0 = m, gy0 = m + barH + Math.round(size * 0.08);
  const cw = Math.round((size - 2 * m - 2 * gap) / 3);
  const ch = Math.round(cw * 0.9);
  for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
    const x0 = gx0 + col * (cw + gap), y0 = gy0 + row * (ch + gap);
    for (let y = y0; y < y0 + ch && y < size - m; y++)
      for (let x = x0; x < x0 + cw && x < size - m; x++) put(x, y, fg);
  }
  return px;
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png(size, size, draw(size)));
  console.log(`已生成 icons/icon-${size}.png`);
}
```

Run: `node tools/make-icons.js`
Expected: 两行输出，`icons/` 下出现两个 PNG；用图片查看器打开能看到蓝底白格子的图标。

- [ ] **Step 2: 写 `manifest.webmanifest`**

```json
{
  "name": "我的课程表",
  "short_name": "课程表",
  "start_url": ".",
  "scope": ".",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#f5f6f8",
  "theme_color": "#4A7CE8",
  "lang": "zh-CN",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 3: 写 `sw.js`**

- `CACHE = 'claudeword-v1'`
- `ASSETS` 列出：`./`、`index.html`、`css/style.css`、`js/weeks.js`、`js/ics.js`、`js/store.js`、`js/conflicts.js`、`js/nextclass.js`、`js/notify.js`、`js/ui.js`、`manifest.webmanifest`、`icons/icon-192.png`、`icons/icon-512.png`
- `install`：`caches.open(CACHE).then(c => c.addAll(ASSETS))` 然后 `self.skipWaiting()`
- `activate`：删掉名字不等于 `CACHE` 的旧缓存，然后 `self.clients.claim()`
- `fetch`：只处理同源 `GET`；`caches.match(req)` 命中则返回缓存，否则 `fetch(req)` 并把成功的响应写入缓存；网络失败且是导航请求时回退到缓存的 `index.html`
- **不要缓存 `sw.js` 自身**

- [ ] **Step 4: 在 `index.html` 中接线**

在 `<head>` 里加：

```html
<meta name="theme-color" content="#4A7CE8">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/icon-192.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="课程表">
```

在 `</body>` 前加（Service Worker 只在安全上下文注册；`file://` 下会失败，要用 `try` 包住）：

```html
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SW 注册失败', e); });
    });
  }
</script>
```

- [ ] **Step 5: 写 `使用说明.md`**

必须包含以下小节，用大白话写：

1. **这是什么** —— 一个装在手机上的课程表，不联网、不上传任何数据。
2. **电脑上先试试** —— 双击 `启动.bat`，浏览器打开 `http://localhost:8080`。
3. **装到手机上** —— 手机浏览器打开你的 GitHub Pages 网址 → 菜单里选「添加到主屏幕」（iPhone 用 Safari，点分享 → 添加到主屏幕）。
4. **录入课程** —— 点右下角 `+`；先到「设置」里填**第 1 周周一的日期**，否则课表页只会显示一行提示。
5. **单双周怎么填** —— 「每周」= 每周都上；「单周」= 第 1、3、5… 周上；「双周」= 第 2、4、6… 周上。
6. **上课提醒（重点）** —— 设置页点「导出到手机日历」→ 浏览器下载 `.ics` → 在手机的「下载」里点这个文件 → 系统问「添加到日历」→ 确认。**之后提醒由手机系统日历负责，App 关着也照样响**，提前几分钟提醒由 `设置 → 提醒` 里的分钟数决定，改完要重新导出一遍。
7. **备份** —— 设置页「导出备份」存一个 `.json` 文件放微信收藏/网盘；换手机或浏览器清数据后用「导入备份」恢复。
8. **常见问题** —— 为什么 App 里的通知不准时（浏览器后台限制，用日历提醒）；导入了两次会不会重复（不会，同一个文件重复导入会更新而不是新增）；改了节次时间要不要重导（要）。

- [ ] **Step 6: 人工验证 PWA**

Run: `启动.bat`

- [ ] Chrome 地址栏右侧出现「安装」图标；点它，独立窗口打开，无浏览器地址栏
- [ ] F12 → Application → Manifest 无报错，图标正常显示
- [ ] F12 → Application → Service Workers 显示 `activated`
- [ ] F12 → Network 勾上 Offline，刷新页面 → **仍能正常打开并使用**（缓存生效）
- [ ] 拔网线/关 WiFi 后刷新 → 同样可用

- [ ] **Step 7: 全量测试**

Run: `node --test`
Expected: 全部 PASS（store 9 + weeks 12 + ics 20 + conflicts 6 + nextclass 8 + notify 10 = 65 个）

- [ ] **Step 8: 走一遍 spec 第 10.2 节的完整人工验证清单**

逐项对照 `docs/superpowers/specs/2026-10-02-course-schedule-app-design.md` 第 10.2 节，勾完所有项。任何一项不通过就修到通过再提交。

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "feat: PWA 化、图标、离线缓存与使用说明"
```

---

## 部署（不在本计划内，需单独确认）

计划完成后，`D:\claude word` 已是一个完整的 git 仓库。推送到 GitHub 并开启 Pages 的步骤见 spec 第 11 节 —— **执行前会先向你确认** GitHub 账号与仓库名，不擅自推送。
