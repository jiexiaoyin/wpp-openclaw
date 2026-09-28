// tests/unit/safe-regex.test.mjs — ReDoS 防护正确性回归
//
// 历史教训 (写进注释的, 测试要能守住): gewe v3.1.0 实测 `(a+)+$` 对 1000 字符输入 hang 119s。
//   本模块是群接龙 title / 引用 XML / 群 nick prefix 三条解析链路的统一护栏。
//
// 这批断言分两半, 缺一不可:
//   (1) 漏判 (false negative) —— 灾难模式没被识别 → 护栏形同虚设 → 真 hang;
//   (2) 误判 (false positive) —— 正常业务 regex 被当成灾难 → guardedRegex 抛错 → 功能直接挂。
//   只测 (1) 会让人把启发式越调越激进, 直到 (2) 在生产炸掉。
//
// 本文件不构造真的灾难输入去跑 (那正是要避免的事), 只验证"识别"与"截断"两个纯逻辑。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCatastrophicRegex,
  safeMatch,
  safeMatchAll,
  guardedRegex,
} from '../../dist/core/safe-regex.js';

// ── 1. 灾难模式识别 (漏判 = 护栏失效) ──────────────────────────────────

test('识别嵌套量词 (a+)+ / (a*)* / (a+)* — gewe A1 的原始形态', () => {
  for (const p of ['(a+)+$', '(a*)*', '(a+)*', '(a+)+b', '^(\\d+)+$']) {
    assert.equal(isCatastrophicRegex(p), true, `漏判: ${p}`);
  }
});

test('识别非捕获组嵌套量词 (?:.+)+', () => {
  assert.equal(isCatastrophicRegex('(?:.+)+'), true);
  assert.equal(isCatastrophicRegex('(?:[a-z]+)+'), true);
});

test('识别灾难 alternation: (a|a)+ / ([a-z]+|[0-9]+)+', () => {
  assert.equal(isCatastrophicRegex('(a|a)+'), true, '经典 (a|a)+ 必须命中');
  assert.equal(isCatastrophicRegex('([a-z]+|[0-9]+)+'), true);
});

test('识别连续量词: a++ / a*+ / a{1,}+', () => {
  // 三个样本都由第 3 条启发式 (多个连续量词) 负责。曾漏判第 3 个:
  //   旧规则 [+*]\{[0-9,]+\}\+ 要求 { 前面还得有个 +/*, 而 a{1,}+ 的 { 前面是普通字符 'a',
  //   于是 "花括号量词再叠 +" 这种形态整类漏检 —— 与注释声明的样本不符。
  //   现规则 \{[0-9,]+\}\+ 直接覆盖。每条单独断言, 漏判时能直接看出是哪个形态。
  assert.equal(isCatastrophicRegex('a++'), true, 'a++ 漏判 (靠 [ +* ]\\+ 分支)');
  assert.equal(isCatastrophicRegex('a*+'), true, 'a*+ 漏判 (靠 [ +* ]\\+ 分支)');
  assert.equal(isCatastrophicRegex('a{1,}+'), true, 'a{1,}+ 漏判 (靠 \\{[0-9,]+\\}\\+ 分支)');
  // 反向: 不带叠加的普通花括号量词不得误判 (生产 regex 大量使用 {n,m})
  assert.equal(isCatastrophicRegex('a{1,3}'), false);
  assert.equal(isCatastrophicRegex('^a{5,}$'), false);
});

test('第 4 条启发式 (多段 \\w+) 的可达性探针', () => {
  // 该分支要求 pattern 里出现两处 \\w+ 且以 [+*])?+ 收尾。用合成样本证明这条分支确实可达;
  // 现实中极难触发 (绝大多数带 ++ 的写法会先被第 3 条命中) —— 见报告"发现"一节。
  assert.equal(isCatastrophicRegex('\\w+\\w+*)+'), true, '第 4 条分支可达');
  // 反例: 只有一段 \\w+ 时不得命中 (否则误判面会失控)
  assert.equal(isCatastrophicRegex('\\w+\\w+'), false);
});

test('同时接受 string 与 RegExp 两种入参 (取 .source)', () => {
  assert.equal(isCatastrophicRegex(/(a+)+$/), true);
  assert.equal(isCatastrophicRegex('(a+)+$'), true);
  assert.equal(isCatastrophicRegex(/^\d+$/), false);
});

// ── 2. 正常 regex 不得误判 (误判 = 功能挂) ─────────────────────────────

test('误判防线: 生产在用的真实 regex 全部必须判为非灾难', () => {
  // 全部取自本仓 src/inbound/parser/mention.ts 的 AT_MENTION_PATTERNS
  const realPatterns = [
    /(wxid_[a-zA-Z0-9]+)@[^,\s]*/g,
    /@(wxid_[a-zA-Z0-9]+)/g,
    /<at\s+user="(wxid_[a-zA-Z0-9]+)"/g,
    /<atuserlist>[\s\S]*?<username>(wxid_[a-zA-Z0-9]+)<\/username>/g,
    /@([a-zA-Z][a-zA-Z0-9_-]{5,})[^\s@]*/g,
  ];
  for (const p of realPatterns) {
    assert.equal(isCatastrophicRegex(p), false, `误判成灾难: ${p}`);
  }
});

test('误判防线: 常见安全形态 (锚点/字符类/单量词/可选组) 一律放行', () => {
  const safePatterns = [
    '^\\d+$',
    '^[a-z]+$',
    '^[a-zA-Z0-9_-]+$',
    '<at\\s+user="([^"]+)"',
    '^(abc)*$',
    '^a{1,3}$',
    '^\\s*$',
  ];
  for (const p of safePatterns) {
    assert.equal(isCatastrophicRegex(p), false, `误判成灾难: ${p}`);
  }
});

test('边界: 空 pattern 不得判灾难 (也不得抛错)', () => {
  assert.equal(isCatastrophicRegex(''), false);
  assert.equal(isCatastrophicRegex(/(?:)/), false);
});

test('guardedRegex 对安全 pattern 返回原对象 (不得复制/包装, 保证 lastIndex 语义)', () => {
  const g = /a/g;
  assert.equal(guardedRegex(g), g, '必须返回同一引用 (带 g 标志的 regex 有状态)');
});

// ── 3. guardedRegex 的两种处置 (抛错 / fallback) ────────────────────────

test('guardedRegex: 灾难 pattern 且无 fallback → 抛错, 消息含 catastrophic 与定位信息', () => {
  assert.throws(
    () => guardedRegex(/(a+)+$/),
    (e) => {
      assert.match(e.message, /catastrophic regex detected/);
      assert.match(e.message, /\(a\+\)\+\$/, '错误消息要带 pattern 片段, 便于定位');
      return true;
    },
  );
});

test('guardedRegex: 灾难 pattern 但有 fallback → 返回 fallback, 不抛错', () => {
  const fb = /^$/;
  assert.equal(guardedRegex(/(a+)+$/, fb), fb, '有 fallback 时必须降级而不是炸掉调用方');
});

test('guardedRegex: fallback=null 等价于无 fallback (仍抛错)', () => {
  assert.throws(() => guardedRegex('(a*)*', null), /catastrophic regex detected/);
});

test('guardedRegex 对 string 入参: 灾难串仍抛错 (运行时不会漏检)', () => {
  // 契约: guardedRegex 与 isCatastrophicRegex 同域, 收 string | RegExp。
  // 这里同时钉住两件事:
  //   (1) 检测分支对 string 照样生效 —— 不会漏检;
  //   (2) 抛的是带诊断信息的 Error, 而不是构造消息时崩出来的 TypeError。
  //       (回归防线: 旧实现取 pattern.source 对 string 是 undefined.slice → TypeError,
  //        把 "这是灾难 regex" 的真因掩盖成 "Cannot read properties of undefined")
  for (const p of ['(a+)+$', '(a*)*', 'a{1,}+']) {
    assert.throws(
      () => guardedRegex(p),
      (e) => {
        assert.ok(!(e instanceof TypeError), `不得退化成 TypeError: ${e.message}`);
        assert.match(e.message, /catastrophic regex detected/, `string 入参须给出诊断信息: ${p}`);
        return true;
      },
    );
  }
});

test('guardedRegex 对 string 入参: 安全串编译成 RegExp (返回类型不撒谎)', () => {
  // 旧实现对安全 string 直接 return pattern —— 返回的是 string, 却声明 : RegExp。
  // 现按 String.match(str) 的原生语义编译, 保证返回值真的是 RegExp。
  const r = guardedRegex('^\\d+$');
  assert.ok(r instanceof RegExp, 'string 入参必须返回 RegExp, 不能原样返回 string');
  assert.equal(r.test('123'), true);
  assert.equal(r.test('abc'), false);
  // RegExp 入参仍保引用同一性 (上一条用例已覆盖), 此处补一条带 g 标志的
  const g = guardedRegex(/a/g);
  assert.equal(g.lastIndex, 0, 'g 标志 regex 的 lastIndex 语义不得被破坏');
});

// ── 4. safeMatch 截断 ─────────────────────────────────────────────────

test('safeMatch: 超长输入被截断到 maxLen (用零宽断言观察真实截断点)', () => {
  const long = 'a'.repeat(5000);
  // /$/ 在截断后的串上匹配 → index 正好等于截断长度
  assert.equal(safeMatch(/$/, long, 10).index, 10, '必须真的截到 10 字符');
  assert.equal(safeMatch(/$/, long, 4096).index, 4096, '默认上限 4096');
  assert.equal(safeMatch(/$/, long, 99999).index, 5000, '未超限时不得补长');
});

test('safeMatch: 输入短于 maxLen → 原样匹配 (截断不误伤)', () => {
  const m = safeMatch(/(\d+)/, 'abc123def', 4096);
  assert.equal(m[1], '123');
});

test('safeMatch: 不匹配时返回 null (不得返回 undefined/空数组)', () => {
  assert.equal(safeMatch(/^zzz$/, 'abc'), null);
});

test('safeMatch: 截断可能把匹配切掉 — 这是预期代价, 行为稳定可预期', () => {
  // 关键串在 maxLen 之后 → 截断后匹配不到。钉住这个语义, 避免有人以为 safeMatch 是"全量+保护"
  const input = `${'x'.repeat(20)}NEEDLE`;
  assert.equal(safeMatch(/NEEDLE/, input, 10), null);
  assert.notEqual(safeMatch(/NEEDLE/, input, 4096), null);
});

test('safeMatch: 空输入 / maxLen 边界不抛错', () => {
  assert.equal(safeMatch(/a/, ''), null);
  assert.equal(safeMatch(/a/, 'a', 0), null, 'maxLen=0 → 空串, 不匹配');
  assert.notEqual(safeMatch(/^$/, 'a', 0), null, 'maxLen=0 → 空串能匹配 ^$');
});

// ── 5. safeMatchAll 截断 ──────────────────────────────────────────────

test('safeMatchAll: 匹配数受 maxLen 截断限制 (超出部分不计)', () => {
  const input = 'a'.repeat(100);
  assert.equal([...safeMatchAll(/a/g, input, 10)].length, 10);
  assert.equal([...safeMatchAll(/a/g, input, 4096)].length, 100, '未超限时必须全量');
});

test('safeMatchAll: 返回 iterator (可被 for...of 消费), 且元素形态与 String.matchAll 一致', () => {
  const it = safeMatchAll(/(\d)(\d)/g, 'x12y34');
  assert.equal(typeof it[Symbol.iterator], 'function', '必须是可迭代的 (给 mention.ts 的 for...of 用)');
  const list = [...it];
  assert.equal(list.length, 2, '1 组非重叠匹配 = 2 条');
  assert.deepEqual(
    list.map((m) => [m[0], m[1], m.index]),
    [
      ['12', '1', 1],
      ['34', '3', 4],
    ],
    'match 数组必须与原生 matchAll 同形态 (m[0] 全匹配 / m[1] 捕获组 / m.index 偏移)',
  );
});

test('safeMatchAll: 捕获组可正常取出 (调用方依赖 m[1])', () => {
  const list = [...safeMatchAll(/wxid_([a-z]+)/g, 'wxid_abc wxid_def')];
  assert.deepEqual(list.map((m) => m[1]), ['abc', 'def']);
});
