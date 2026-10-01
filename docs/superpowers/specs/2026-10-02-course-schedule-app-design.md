# 课程表 App 设计文档

日期：2026-10-02
状态：待评审

---

## 1. 目标

做一个能在手机上用的课程表应用，满足三件事：

1. **手动录入课程** —— 输入课程名、老师、教室、星期几、第几节、第几周到第几周、单周/双周/每周。
2. **上课前提醒** —— 到点弹通知，告诉我下一节上什么课、在哪个教室。
3. **纯离线、零成本、可自己改** —— 不依赖任何服务器，不花一分钱，代码全是明文，随时能改。

**成功标准**

- 在手机上「添加到主屏幕」后，图标、全屏、启动画面与原生 App 无差别。
- 录入一门课后，导出的 `.ics` 导入手机系统日历，能在设定的提前时间准时提醒，**App 关着也照样响**。
- 打开 App 时能一眼看到本周课表、今天是第几周、下一节课还有多久。
- 断网也能正常使用。

---

## 2. 非目标（明确不做）

- ❌ 不做短信/微信提醒 —— 需要服务器与短信通道，要花钱，且手机端无法自行定时发送。改用系统日历提醒（可靠性更高）。
- ❌ 不做账号系统、云同步、多设备共享 —— localStorage + JSON 手动备份足够。
- ❌ 不做自动导入教务系统课表 —— 各校格式不一，维护成本远超收益。
- ❌ 不做调课/请假/考勤等教务功能。
- ❌ 不处理跨午夜课程（如 23:00–01:00）—— 会在界面中提示不支持。

---

## 3. 技术选型

| 项 | 选择 | 理由 |
|---|---|---|
| 形态 | PWA（静态网页） | 手机可装到主屏幕像 App；无需安卓 SDK；改起来最快 |
| 框架 | 无框架，原生 HTML/CSS/JS | 体量小、零构建步骤、用户可自行修改 |
| 脚本加载 | 普通 `<script src>`，非 ES Module | 保留 `file://` 直接双击打开也能用的能力（ES Module 在 `file://` 下会被 CORS 拦截） |
| 存储 | localStorage | 数据量极小（一学期几十门课），无需 IndexedDB |
| 后端 | 无 | 纯前端 |
| 构建 | 无 | 源码即产物 |
| 测试 | Node 内置 `node:test` + `node:assert` | 零依赖，`node --test` 或双击 `测试.bat` 即可跑 |
| 部署 | GitHub Pages | 免费 HTTPS，满足 PWA 与通知权限的安全上下文要求 |

---

## 4. 数据模型

### 4.1 课程 Course

| 字段 | 类型 | 说明 | 校验 |
|---|---|---|---|
| `id` | string | 唯一标识，生成后不变 | 非空 |
| `name` | string | 课程名 | 非空，≤ 30 字 |
| `teacher` | string | 教师 | 可空 |
| `location` | string | 教室 | 可空 |
| `dayOfWeek` | number | 1–7 表示周一–周日 | 1 ≤ x ≤ 7 |
| `startPeriod` | number | 起始节次 | ≥ 1 |
| `endPeriod` | number | 结束节次 | ≥ startPeriod 且 ≤ 节次总数 |
| `weekStart` | number | 起始周 | 1 ≤ x ≤ totalWeeks |
| `weekEnd` | number | 结束周 | weekStart ≤ x ≤ totalWeeks |
| `weekParity` | `'all' \| 'odd' \| 'even'` | 每周 / 单周 / 双周 | 枚举内 |
| `color` | string | 颜色标记（色板索引或 hex） | 色板内 |
| `note` | string | 备注 | 可空 |

### 4.2 设置 Settings

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `schemaVersion` | number | 1 | 数据结构版本，供未来迁移 |
| `termName` | string | `'我的课程表'` | 用于 .ics 日历名与文件名 |
| `termStartMonday` | string `YYYY-MM-DD` | `''`（未设置） | **第 1 周的周一日期**，周次计算的基准 |
| `totalWeeks` | number | 20 | 学期总周数 |
| `periods` | `{index, start, end}[]` | 8 节（见 4.3） | 节次时间表，**可自由增删改** |
| `reminderMinutes` | number | 15 | 提前多少分钟提醒；0 表示不设闹钟 |
| `notifyEnabled` | boolean | false | 是否启用页内通知 |

`periods` 数组的 `index` 从 1 连续编号，`start`/`end` 为 `HH:MM`（24 小时制）。增删节次时自动重排 `index`。

### 4.3 默认节次（可在设置中全部修改）

| index | start | end |
|---|---|---|
| 1 | 08:00 | 08:55 |
| 2 | 08:55 | 09:50 |
| 3 | 10:05 | 11:00 |
| 4 | 11:00 | 11:55 |
| 5 | 14:00 | 14:55 |
| 6 | 14:55 | 15:50 |
| 7 | 16:05 | 17:00 |
| 8 | 17:00 | 17:55 |

> 这只是一个占位默认值。用户可在设置页任意增删节次、改时间，界面与 .ics 均以用户设置的为准。

### 4.4 存储键

- `claudeword.courses.v1` —— 课程数组的 JSON
- `claudeword.settings.v1` —— 设置对象的 JSON

存储键带版本后缀，便于将来无痛迁移。

### 4.5 备份文件格式

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-10-02T12:00:00.000Z",
  "settings": { },
  "courses": [ ]
}
```

导入时校验结构，导入前向用户确认「将覆盖当前 N 门课程」。

---

## 5. 核心逻辑（纯函数，可独立测试）

### 5.1 周次计算

```
currentWeek(today, termStartMonday):
    d = daysBetween(termStartMonday, today)      // today - termStartMonday，按本地日期算整天
    if d < 0: return 0                            // 学期还没开始
    w = floor(d / 7) + 1
    return w                                      // 可能 > totalWeeks，由调用方判断
```

日期一律按**本地日期的零点**做差，避免夏令时/时区导致的偏移。国内无夏令时，但仍按此实现以保证正确。

### 5.2 奇偶匹配

```
matchesParity(parity, week):
    'all'  → true
    'odd'  → week % 2 === 1     // 单周
    'even' → week % 2 === 0     // 双周
```

注意：「单周」指**学期周次的奇偶**，而非自然周数的奇偶。

### 5.3 某周是否上课

```
isActive(course, week):
    week >= course.weekStart
      && week <= course.weekEnd
      && matchesParity(course.weekParity, week)
```

### 5.4 首个匹配周（供 .ics 使用）

```
firstMatchingWeek(course):
    for w in [weekStart .. weekEnd]:
        if matchesParity(parity, w): return w
    return null      // 无匹配周次 → 该课不生成日历事件
```

### 5.5 一学期内的所有上课时刻

用于「今日页」与通知调度：

```
occurrencesInRange(course, fromDate, toDate) → { date, course, periodIndex }[]
```

对区间内每一天，反推其所在周次，若 `isActive`，则产生一条记录。

---

## 6. 界面规格（移动端优先）

底部标签栏切换：**课表 / 今日 / 设置** 三个页面，右下角悬浮 `+` 按钮弹出新增课程的底部表单。

### 6.1 课表页

- 网格布局：左侧列为节次（`1 / 08:00-08:55`），顶部行为周一–周日，当前列高亮。
- 单元格显示课程名 + 教室，背景用该课分配的颜色。
- 顶部周次切换：`‹ 第 7 周 ›`，可左右切换；右上角显示今天是第几周。
- 非当前周才上的课，在本周格子里显示为灰色「本周不上」占位，让用户知道那格不是空的。
- 学期开始日期未设置时，整页替换为引导提示 + 跳转设置页的按钮。

### 6.2 今日页

- 顶部大卡片：「下一节课：高等数学 · 教学楼 A-301 · 还有 42 分钟」。
- 下方列出今天全部课程（含已过去的，置灰），显示节次时间段。
- 无课时显示「今天没有课」。
- 打开页面时请求通知权限（仅一次，若被拒则不再打扰，改为页内视觉提醒）。

### 6.3 添加 / 编辑课程

- 底部弹出表单，字段：课程名、教师、教室、星期、起始节、结束节、起始周、结束周、单双周、颜色、备注。
- 「复制上一门课」按钮 —— 录入一学期课程时最省事的优化。
- 冲突检测：与已有课程在**同一天、节次重叠、且周次范围与奇偶有交集**时给出警告，但允许用户坚持保存。

### 6.4 设置页

- 学期名称、学期第 1 周周一日期（日期选择器）、学期总周数。
- **节次表编辑器**：逐行编辑每节的开始/结束时间，可增行、删行；改动即时生效。
- 提醒提前分钟数、是否启用页内通知。
- 「导出到手机日历」→ 生成并下载 `.ics`。
- 「导出备份」/「导入备份」JSON。
- 页脚：版本号与「清除全部数据」（二次确认）。

### 6.5 视觉

圆角卡片、柔和阴影；每门课自动分配一个柔和色（预设 10 色色板，按课程 `id` 稳定分配）；深色模式跟随系统 `prefers-color-scheme`。

---

## 7. .ics 生成规格

这是提醒可靠性的核心，细节必须精确。

### 7.1 基本结构

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//claude word//Course Schedule//CN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:<学期名>
<VTIMEZONE>
<VEVENT>*
END:VCALENDAR
```

- 行结束符必须是 **CRLF (`\r\n`)**，不是 `\n`。
- 文件编码 **UTF-8**。
- 下载文件名：`<学期名>.ics`。

### 7.2 时区

内嵌 Asia/Shanghai 的 VTIMEZONE（固定 +08:00，无夏令时）：

```
BEGIN:VTIMEZONE
TZID:Asia/Shanghai
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:+0800
TZOFFSETTO:+0800
TZNAME:CST
END:STANDARD
END:VTIMEZONE
```

所有 `DTSTART`/`DTEND` 使用 `DTSTART;TZID=Asia/Shanghai:YYYYMMDDTHHMMSS`。不用浮动时间（会被不同日历按不同方式解释），也不用 UTC（会让上课时间随时区漂移）。

### 7.3 每门课 → 一个 VEVENT

```
BEGIN:VEVENT
UID:<courseId>-<firstWeek>@claudeword
DTSTAMP:<导出时刻，UTC，YYYYMMDDTHHMMSSZ>
DTSTART;TZID=Asia/Shanghai:<首周该日 起始节开始时间>
DTEND;TZID=Asia/Shanghai:<首周该日 结束节结束时间>
RRULE:FREQ=WEEKLY;INTERVAL=<1或2>;COUNT=<次数>;BYDAY=<MO..SU>
SUMMARY:<课程名>
LOCATION:<教室>
DESCRIPTION:教师：<教师>\n<备注>
BEGIN:VALARM
TRIGGER:-PT<reminderMinutes>M
ACTION:DISPLAY
DESCRIPTION:<课程名> <reminderMinutes> 分钟后开始
END:VALARM
END:VEVENT
```

**计算规则**

- `firstWeek = firstMatchingWeek(course)`；若为 `null` → 跳过该课，不生成事件。
- `INTERVAL`：`all` → 1；`odd` / `even` → 2。
- `COUNT`：`[weekStart, weekEnd]` 区间内匹配该奇偶的周数。
  - `all`：`weekEnd - weekStart + 1`
  - `odd` / `even`：`floor((weekEnd - firstWeek) / 2) + 1`
- `DTSTART` 日期 = `termStartMonday + (firstWeek - 1) × 7 + (dayOfWeek - 1)` 天。
- `DTSTART` 时间 = `periods[startPeriod].start`；`DTEND` 时间 = `periods[endPeriod].end`。
- `BYDAY`：MO / TU / WE / TH / FR / SA / SU。
- `reminderMinutes === 0` 时**不生成** VALARM 块。
- `UID` 稳定不变（依赖 `course.id` 与 `firstWeek`），因此重复导入时日历会**更新已有事件**而非重复添加。

### 7.4 文本转义（RFC 5545 TEXT）

按顺序处理（反斜杠必须最先）：

1. `\` → `\\`
2. `;` → `\;`
3. `,` → `\,`
4. 换行 → `\n`（字面反斜杠 + n）

应用于 `SUMMARY`、`LOCATION`、`DESCRIPTION`、`X-WR-CALNAME`。

### 7.5 行折叠（Folding）

- 按 **UTF-8 字节数**计算，每行不超过 **75 字节**，超出部分换行并以**一个空格**开头续行。
- 折叠点必须落在字符边界上，**绝不能把中文字符（3 字节）切一半**。
- 先折叠、后拼接 CRLF。

### 7.6 交付路径

用户在**手机浏览器**里打开 App → 点「导出到手机日历」→ 浏览器下载 `.ics` → 在下载列表/文件管理器里点它 → 系统弹出「添加到日历」→ 完成。
即使用户只在电脑上操作，也可以把 `.ics` 用微信/数据线传到手机再点开导入。

---

## 8. 页内通知规格（辅助手段）

### 8.1 机制

- 进入今日页时请求 `Notification.requestPermission()`；被拒后不再重复请求。
- 用 **每 60 秒轮询**（而非长 `setTimeout`）检查「是否跨过了某节课的提醒时刻」——轮询不会因后台节流而漂移。
- 跨过时触发：系统通知（若已授权）+ 页面内横幅 + Web Audio 生成的蜂鸣音 + `navigator.vibrate`。
- 用「已提醒集合」（key = `课程id+日期`）防止同一条重复提醒；跨日清空。

### 8.2 已知限制（必须在界面中如实告知用户）

- **App 完全关闭后不保证准时响**，依赖浏览器后台策略，安卓各厂商限制不同。
- iOS 需 16.4+ 且必须已「添加到主屏幕」。
- 因此：**系统日历 .ics 才是可靠的提醒方式，页内通知仅作补充。**

---

## 9. 文件结构

```
D:\claude word\
├── index.html                    应用外壳
├── manifest.webmanifest          PWA 清单（名称、图标、独立窗口）
├── sw.js                         Service Worker：离线缓存
├── package.json                  仅供 `node --test` 使用，无依赖
├── server.js                     零依赖本地静态服务器
├── css/
│   └── style.css
├── js/
│   ├── store.js                  数据读写、默认值、导入导出、迁移钩子
│   ├── weeks.js                  周次/奇偶/命中计算（纯函数）
│   ├── ics.js                    .ics 生成（纯函数）
│   ├── conflicts.js              课程冲突检测（纯函数）
│   ├── nextclass.js              下一节课计算（纯函数）
│   ├── notify.js                 提醒判定（纯函数）+ 通知调度
│   └── ui.js                     渲染与事件绑定
├── test/                         `node --test` 的测试文件
├── tools/make-icons.js           生成 PWA 图标（node:zlib 手写 PNG）
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
├── 启动.bat                      双击启动本地预览服务器
├── 测试.bat                      双击运行全部测试
├── 使用说明.md                    装机、导出日历、备份的操作指引
└── docs/superpowers/specs/      设计文档（不参与部署）
```

`weeks.js`、`ics.js`、`conflicts.js`、`nextclass.js`、`notify.js` 都不引用 DOM。它们采用「浏览器全局 + Node 可 require」双用写法（文件末尾加 `module.exports` 守卫），因此同一份代码既能在页面里被 `<script src>` 加载，也能被 `node --test` 直接测试。

---

## 10. 测试策略

### 10.1 自动化测试（`node --test`）

用 Node 内置的 `node:test` + `node:assert`，**不引入任何 npm 依赖**。运行方式：命令行 `node --test`，或双击 `测试.bat`。

> 早期设计里曾计划做一个 `tests.html` 断言页。实际实现时改掉了：浏览器版和 Node 版会各写一份同样的断言，违反 DRY。既然 Node 内置测试运行器（v18+）且本机是 v24，只保留一份即可，`测试.bat` 同样双击就能看红绿结果。

**weeks.js**

- 学期开始当天 → 第 1 周；第 7 天 → 第 1 周；第 8 天 → 第 2 周。
- 学期开始前一天 → 返回 0。
- 跨月、跨年边界正确。
- 单周/双周/每周 奇偶匹配正确。
- `isActive` 在「周次超范围」「奇偶不符」「两者皆不符」时均为 false。
- `firstMatchingWeek`：起始周为偶数但要求单周时，正确跳到下一周；区间内无匹配周时返回 `null`。

**ics.js**

- 转义：含 `,` `;` `\` 与换行的课程名输出正确。
- 折叠：构造长中文课程名，断言每行 ≤ 75 字节，且无字符被截断（逐行按 UTF-8 解码不报错）。
- 行结尾为 CRLF。
- `RRULE` 的 `INTERVAL` / `COUNT` 在 all / odd / even 三种情况下均正确。
- `UID` 稳定性：同一课程两次导出，`UID` 一致。
- `reminderMinutes = 0` 时不出现 `BEGIN:VALARM`。
- `firstMatchingWeek` 为 `null` 的课程不产生 VEVENT。
- VEVENT 数量 = 有效课程数。

### 10.2 手动验证清单

- [ ] 电脑 `localhost` 打开，功能完整。
- [ ] Chrome DevTools 手机模拟下布局不错位。
- [ ] GitHub Pages 打开，「添加到主屏幕」成功，图标与名称正确。
- [ ] 切到飞行模式，刷新仍可用（Service Worker 生效）。
- [ ] 导出的 `.ics` 用手机日历导入，**时间与教室正确**。
- [ ] 日历中的提醒在设定提前量触发。
- [ ] 同一份 `.ics` 再次导入，日历中**不产生重复事件**。
- [ ] 单周课在双周查看时不显示为上课。
- [ ] 修改节次时间后，导出内容随之变化。
- [ ] 导出 JSON 备份 → 清除数据 → 导入备份，数据完全恢复。

---

## 11. 部署（GitHub Pages）

1. 在 `D:\claude word` 初始化 git 仓库并提交。
2. 推送到 GitHub 新仓库。
3. 仓库 Settings → Pages → Source 选 `main` 分支 `/ (root)`。
4. 得到 `https://<用户名>.github.io/<仓库名>/`，手机浏览器打开即可。
5. 可加 `.nojekyll` 避免 Jekyll 处理。

> git 初始化与推送将在实现完成后、得到你确认时进行。

---

## 12. 边界情况与已知限制

| 情况 | 处理 |
|---|---|
| 学期开始日期未设置 | 课表页显示引导，引导去设置页 |
| 当前日期不在学期内 | 显示「学期尚未开始 / 已结束」，仍可浏览任意周 |
| `weekStart > weekEnd` | 表单阻止保存并提示 |
| 某课的周次范围内无匹配奇偶 | 允许保存，但提示「按当前设置不会有任何一节课」，且不生成日历事件 |
| 两门课时间冲突 | 警告但允许保存 |
| localStorage 被浏览器清除 | 应用无法避免；靠 JSON 备份恢复，首次使用即在设置页提示备份 |
| 跨午夜课程 | 不支持，表单会提示 |
| 节次时间填成非法格式 | 输入校验，拒绝保存 |
| 用户把某节开始时间改成晚于结束时间 | 设置页即时标红并拒绝保存该行，避免生成 `DTEND < DTSTART` 的非法事件 |
| 课程没有教师和备注 | `.ics` 中省略 `DESCRIPTION` 行，不输出空的描述字段 |
| 极端情况：导出事件数过多 | 一学期 20 周 × 30 门课 ≈ 600 个 VEVENT，文件约数十 KB，日历可正常导入 |

---

## 13. 实施顺序（供后续计划参考）

1. 骨架：`index.html` + `style.css` + 数据模型与 `store.js`
2. `weeks.js` + `tests.html`（先写测试与逻辑）
3. `ics.js` + 对应断言
4. 课表页渲染 + 周次切换
5. 添加/编辑表单 + 复制上一门课 + 冲突检测
6. 设置页（含节次表编辑器）+ 备份导入导出
7. 今日页 + 倒计时
8. `notify.js` 通知调度
9. PWA：`manifest`、图标、`sw.js` 离线缓存
10. `启动.bat` + `使用说明.md`
11. 手动验证清单逐项过一遍
12. GitHub Pages 部署（需你确认后再执行）
