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

// RFC 5545 折行规则：续行以「一个空格」开头，展开（unfold）时该空格被丢弃。
// 所以比较折行是否无损，必须先按规则展开，不能直接 join。
const unfold = ls => ls.map((l, i) => (i === 0 ? l : l.slice(1))).join('');

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
  // 必须关掉闹钟：RFC 5545 要求 ACTION:DISPLAY 的 VALARM 内部必须有 DESCRIPTION，
  // 否则 !t.includes('DESCRIPTION:') 命中的是闹钟那行，测的不是事件本身。
  const t = ICS.buildICS([course({ location: '', teacher: '', note: '' })], settings({ reminderMinutes: 0 }));
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
    assert.ok(!l.includes('�'), '不应有被截断的字符');
  }
  assert.deepEqual(ICS.foldLine('SUMMARY:短'), ['SUMMARY:短']);
  assert.equal(unfold(ICS.foldLine(long)), long, '按折行规则展开后应与原文一致');
});

test('foldLine 处理 4 字节字符（emoji）不切断', () => {
  const s = 'SUMMARY:' + '🎓'.repeat(30);
  const out = ICS.foldLine(s);
  for (const l of out) assert.ok(Buffer.byteLength(l, 'utf8') <= 75);
  assert.equal(unfold(out), s);
  assert.ok(!out.join('').includes('�'), 'emoji 不应被截断成乱码');
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

test('buildICSResult 在有课程但全部生成不了事件时也拒绝导出', () => {
  // 保存时允许这种情况（用户可能只是想先记下来），但导出空日历没有意义
  const r = ICS.buildICSResult([course({ weekStart: 3, weekEnd: 3, weekParity: 'even' })], settings());
  assert.equal(r.ok, false);
  assert.match(r.error, /周次|节次|日历事件/);
});

test('buildICSResult 成功时给出文件名', () => {
  const r = ICS.buildICSResult([course()], settings());
  assert.equal(r.ok, true);
  assert.equal(r.fileName, '我的课程表.ics');
  assert.ok(r.text.includes('BEGIN:VCALENDAR'));
  assert.equal(ICS.buildICSFileName(settings({ termName: '' })), '课程表.ics');
  assert.equal(ICS.buildICSFileName(settings({ termName: '2026 秋' })), '2026 秋.ics');
});
