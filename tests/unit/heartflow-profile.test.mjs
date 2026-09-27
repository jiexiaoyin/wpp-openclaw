// tests/unit/heartflow-profile.test.mjs - v1.7.0 心流群画像 (P1)
//
// 老板 2026-09-26: "希望能根据每个群聊环境, 能自动理解群身份与特征, 建立画像, 应景回复 … 更贴合真人身份角色",
//   且 "不愿意设定固定的触发关键词" —— 画像就是那句"自动理解"的落地 (不是关键词)。
//
// 本文件锁住三类东西:
//   1) 纯函数: 参数缺省 / 生成 prompt / 解析校验 / 截断 / 缓存 / 新旧判定
//   2) **安全边界** (最重要): 画像只能收紧约束 (阈值抬高/预算变小/静默段默认不生效), 且**永不写空画像**
//   3) 源级接线: sweep 生成 → 缓存 → judge prompt 注入 + 触发侧预算收紧 + 两个新子命令
//
// 数值断言尽量用**语义**而非魔数: 例如"画像建议 0.2 的阈值必须被抬到 bandMin 0.5", 而不是断言 0.5 === 0.5.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const read = (p) => fs.readFileSync(p, 'utf-8');
const src = (rel) => read(`${ROOT}/${rel}`);

let P = null;
let B = null;
let H = null;
try {
  P = await import(new URL('../../dist/inbound/heartflow-profile.js', import.meta.url));
  B = await import(new URL('../../dist/inbound/heartflow-budget.js', import.meta.url));
  H = await import(new URL('../../dist/inbound/heartflow.js', import.meta.url));
} catch (e) {
  // dist 缺失 (未 npm run build) → t.skip, 不红
  console.error(`[heartflow-profile.test] dist 缺失: ${e.message}`);
}

function skipNoDist(t) {
  if (!P) t.skip('dist/inbound/heartflow-profile.js 缺失 (先 npm run build)');
}

/** 取某个顶层声明的完整函数体 (与 heartflow-budget.test.mjs 同款; 防固定窗口把断言切出界) */
function fnBody(rel, decl) {
  const s = src(rel);
  const i = s.indexOf(decl);
  assert.ok(i >= 0, `${rel} 里找不到声明: ${decl}`);
  const rest = s.slice(i + decl.length);
  const next = rest.search(/\n(?:\/\*\*|export (?:async )?function|export const|export interface|const _|function )/);
  return s.slice(i, next < 0 ? s.length : i + decl.length + next);
}

const STATS = {
  total: 200,
  activeDays: 12,
  avgLen: 18,
  hourHist: (() => {
    const a = new Array(24).fill(0);
    a[9] = 40; a[10] = 30; a[14] = 35; a[20] = 25; a[3] = 1;
    return a;
  })(),
  topSenders: [{ wxid: "wxid_a", n: 40 }, { wxid: "wxid_b", n: 30 }],
  typeHist: { text: 180, image: 20 },
};

const GOOD = JSON.stringify({
  nature: "手机零售商的客户售后群",
  style: "短句口语, 爱用表情",
  bot_role: "答疑的客服",
  engage: ["售后", "价格", "新品"],
  avoid: ["政治", "同行业内幕"],
  active_hours: [9, 10, 14, 20],
  quiet_hours: [[23, 7]],
  band: 0.72,
  budget: { min_gap_sec: 300, max_per_hour: 6, max_per_day: 40 },
  summary: "群里问售后就答, 别抢话",
});

// ===== 1. 参数 =====

test('resolveHfProfileCfg: 缺省开 + 样本门槛 + maxTokens 不走 judge 的 300', (t) => {
  skipNoDist(t);
  const c = P.resolveHfProfileCfg(undefined);
  assert.equal(c.enabled, true, '画像默认开 (老板要的就是它)');
  assert.equal(c.minMsgs, 30);
  assert.equal(c.lookbackDays, 14);
  assert.equal(c.applyQuietHours, false, '静默段默认**不自动生效** (老板 2026-09-26 拍板"默认关")');
  assert.ok(c.maxTokens >= 800, `画像 maxTokens 必须远大于 judge 的 300 (实得 ${c.maxTokens})`);
  assert.ok(c.maxPromptChars === 400, '注入上限 400 字符 (计划值)');
  const o = P.resolveHfProfileCfg({ profile: { maxTokens: 2000 } });
  assert.equal(o.maxTokens, 2000, '覆盖生效');
  assert.equal(o.minMsgs, c.minMsgs, '未覆盖的键走默认');
});

test('HF_PROFILE_DEFAULTS.maxTokens 不得等于 judge 的硬编码 300 (2026-09-13 静默瘫的同类风险)', (t) => {
  skipNoDist(t);
  assert.notEqual(P.HF_PROFILE_DEFAULTS.maxTokens, 300);
  // judge 那处硬编码仍在 heartflow.ts 里 (本次不动它, 只是不复用)
  assert.match(src('src/inbound/heartflow.ts'), /const maxTokens = 300;/, 'judge 的 300 还在原地 (画像只是不复用它)');
});

// ===== 2. 生成 prompt =====

test('buildHfProfilePrompt: 带统计与样本 + 要求只输出 JSON + **不含群 ID**', (t) => {
  skipNoDist(t);
  const p = P.buildHfProfilePrompt({ msgs: STATS.total, days: 14, stats: STATS, samples: ["wxid_a**: 在吗", "wxid_b**: 多少钱"] });
  assert.match(p, /200/, '必须给出消息总数');
  assert.match(p, /12 天|活跃天数: 12/, '必须给出活跃天数');
  assert.match(p, /9时:40/, '必须给出小时直方图');
  assert.match(p, /wxid_a\*\*: 在吗/, '必须带样本消息');
  assert.match(p, /"band"/, '必须要求 band 字段');
  assert.match(p, /"quiet_hours"/, '必须要求 quiet_hours 字段');
  assert.match(p, /只输出 JSON/, '必须明确"只输出 JSON" (judge 同范式, 靠容忍式解析兜底)');
  // 隐私: 生成 prompt 不需要群 ID (样本已足够), 函数签名里也不该有
  const body = fnBody('src/inbound/heartflow-profile.ts', 'export function buildHfProfilePrompt');
  assert.doesNotMatch(body, /group_?[Ii]d/i, '生成 prompt 不得要求群 ID (无必要外发)');
  assert.doesNotMatch(p, /@chatroom/, 'prompt 里不得出现群 ID 形态的串');
});

// ===== 3. 解析与校验 (安全边界) =====

test('parseHfProfileResponse: 正常 JSON 解析 + 字段限长', (t) => {
  skipNoDist(t);
  const p = P.parseHfProfileResponse(GOOD);
  assert.equal(p.nature, "手机零售商的客户售后群");
  assert.equal(p.botRole, "答疑的客服");
  assert.deepEqual(p.engage, ["售后", "价格", "新品"]);
  assert.deepEqual(p.activeHours, [9, 10, 14, 20]);
  assert.deepEqual(p.quietHours, [[23, 7]]);
  assert.equal(p.band, 0.72);
  assert.equal(p.budget.minGapSec, 300);
  assert.equal(p.summary, "群里问售后就答, 别抢话", 'summary 必须被解析 (否则等于问了模型又丢掉)');
});

test('parseHfProfileResponse: 容忍 markdown 围栏/前后废话; 坏 JSON/空输入 → null', (t) => {
  skipNoDist(t);
  assert.ok(P.parseHfProfileResponse("好的, 这是结果:\n```json\n" + GOOD + "\n```\n以上。"));
  assert.equal(P.parseHfProfileResponse("完全不是 JSON"), null);
  assert.equal(P.parseHfProfileResponse(""), null);
  assert.equal(P.parseHfProfileResponse("{坏掉的"), null);
  assert.equal(P.parseHfProfileResponse("[1,2,3]"), null, '数组不是画像');
});

test('parseHfProfileResponse: 全空对象 → null (绝不写空画像)', (t) => {
  skipNoDist(t);
  assert.equal(P.parseHfProfileResponse("{}"), null);
  assert.equal(P.parseHfProfileResponse('{"nature":"","engage":[],"avoid":[]}'), null);
  assert.equal(P.parseHfProfileResponse('{"band":null,"budget":null}'), null);
  // 只有 summary 也算有内容 (模型对全群的归纳, 单看有价值)
  assert.ok(P.parseHfProfileResponse('{"summary":"这是个售后答疑群, 语气随意点"}'), 'summary 非空 ⇒ 不算空画像');
});

test('parseHfProfileResponse: band 非法值丢弃, 越界值**被抬进 band 区间** (画像不许把阈值压低)', (t) => {
  skipNoDist(t);
  const band = (v) => P.parseHfProfileResponse(JSON.stringify({ nature: "x", band: v }))?.band;
  assert.equal(band(1.5), null, '>1 丢弃');
  assert.equal(band(-0.2), null, '<=0 丢弃');
  assert.equal(band("高"), null, '非数字丢弃');
  assert.equal(band(0.2), H.HF_LEARNING_DEFAULTS.bandMin, '画像给的 0.2 必须被抬到 bandMin (否则等于绕开硬地板)');
  assert.equal(band(0.95), H.HF_LEARNING_DEFAULTS.bandMax, '超过 bandMax 被压回上限');
  assert.equal(band(0.7), 0.7, '区间内原样保留');
  // 调用方显式给区间时以调用方为准
  const p = P.parseHfProfileResponse(JSON.stringify({ nature: "x", band: 0.2 }), { bandMin: 0.3, bandMax: 0.9 });
  assert.equal(p.band, 0.3);
});

test('parseHfProfileResponse: 数组限长/去重/小时过滤/静默段非法丢弃', (t) => {
  skipNoDist(t);
  const p = P.parseHfProfileResponse(
    JSON.stringify({
      nature: "x",
      engage: ["a", "b", "c", "d", "e", "f", "g"],
      avoid: ["a", "a", "b"],
      active_hours: [9, 9, 99, -1, 10, 11, 12, 13, 14, 15, 16],
      quiet_hours: [[23, 7], [5, 5], [30, 2], [8, 12], [1, 2], [3, 4], [6, 7]],
    }),
  );
  assert.equal(p.engage.length, 5, '宜聊最多 5 条');
  assert.deepEqual(p.avoid, ["a", "b"], '去重');
  assert.deepEqual(p.activeHours, [9, 10, 11, 12, 13, 14], '越界/重复小时过滤 + 上限 6 个 (11 个有效值只留前 6)');
  assert.deepEqual(p.quietHours, [[23, 7], [8, 12], [1, 2]], 'start===end 丢弃 + 越界丢弃 + 最多 3 段');
  assert.ok(p.engage.every((s) => s.length <= 30), '单条限长');
});

test('clampHfProfileBudget / 解析出的 budget: **只能收紧, 不许放开**', (t) => {
  skipNoDist(t);
  const cfg = B.resolveHfBudget(undefined); // 中等档: 180 / 8 / 60
  const c = P.clampHfProfileBudget({ min_gap_sec: 60, max_per_hour: 20, max_per_day: 10 }, cfg);
  assert.equal(c.minGapSec, cfg.minGapSec, '画像想把间隔缩到 60s ⇒ 无效, 保持 180 (间隔取更严的)');
  assert.equal(c.maxPerHour, cfg.maxPerHour, '画像想放宽到 20/小时 ⇒ 无效, 保持 8');
  assert.equal(c.maxPerDay, 10, '画像收紧到 10/天 ⇒ 生效');
  const tighter = P.clampHfProfileBudget({ min_gap_sec: 600 }, cfg);
  assert.equal(tighter.minGapSec, 600, '画像要求更长间隔 ⇒ 生效');
  assert.equal(tighter.maxPerHour, undefined, '未给的字段不填 (避免覆盖配置)');
  assert.equal(P.clampHfProfileBudget({}, cfg), null, '无有效字段 ⇒ null');
  assert.equal(P.clampHfProfileBudget({ max_per_hour: -3 }, cfg), null, '负值不当真');
});

test('renderHfProfileForPrompt: 截断到上限且**不切半行**; 空画像 → ""', (t) => {
  skipNoDist(t);
  const p = P.parseHfProfileResponse(GOOD);
  const full = P.renderHfProfileForPrompt(p, 400);
  assert.ok(full.length <= 400, `必须 ≤400 (实得 ${full.length})`);
  assert.match(full, /群性质: /);
  assert.match(full, /我的角色定位: /);
  assert.match(full, /说话基调: /, 'summary 也要渲染 (问了模型就得用上)');
  const tiny = P.renderHfProfileForPrompt(p, 20);
  assert.ok(tiny.length <= 20, `小上限也必须守住 (实得 ${tiny.length})`);
  assert.doesNotMatch(tiny, /忌接话题/, '放不下的整行丢弃, 不切半句');
  assert.doesNotMatch(tiny, /说话基调/, 'summary 排最后 ⇒ 紧张时最先被丢 (它是硬信息的重述)');
  assert.equal(P.renderHfProfileForPrompt(P.parseHfProfileResponse('{"nature":""}') ?? { nature: "", style: "", botRole: "", engage: [], avoid: [], activeHours: [], quietHours: [], band: null, budget: null }, 400), "", '无内容 → 空串 (调用方据此不注入)');
});

test('deriveActiveHours: 按均值取活跃小时 (客观口径, 不靠 LLM)', (t) => {
  skipNoDist(t);
  assert.deepEqual(P.deriveActiveHours(STATS.hourHist), [9, 10, 14, 20]);
  assert.deepEqual(P.deriveActiveHours(new Array(24).fill(0)), [], '全 0 → 无活跃时段');
  assert.deepEqual(P.deriveActiveHours(new Array(24).fill(5)).length, 24, '均匀分布 = 每小时都算活跃');
});

test('isHfProfileStale: 无画像/无时刻/超期 → true; 未超期 → false', (t) => {
  skipNoDist(t);
  const now = 1_800_000_000;
  assert.equal(P.isHfProfileStale(null, now, 22), true);
  assert.equal(P.isHfProfileStale(0, now, 22), true);
  assert.equal(P.isHfProfileStale(now - 21 * 3600, now, 22), false, '21h < 22h ⇒ 还新');
  assert.equal(P.isHfProfileStale(now - 22 * 3600, now, 22), true, '恰好 22h ⇒ 该重生');
  assert.equal(P.isHfProfileStale(now - 3 * 86400, now, 22), true);
});

test('parseHfGroupProfileRow: 坏 JSON → null (不抛)', (t) => {
  skipNoDist(t);
  assert.equal(P.parseHfGroupProfileRow({ account_id: "a", group_id: "g", profile_json: "{坏" }), null);
  assert.equal(P.parseHfGroupProfileRow({ account_id: "a", group_id: "g", profile_json: "" }), null);
  assert.ok(P.parseHfGroupProfileRow({ account_id: "a", group_id: "g", profile_json: GOOD }));
});

// ===== 4. 缓存 (judge 热路径零 DB 读) =====

test('缓存: 预热后可取文本/下限/预算; 重置清空; 账号隔离', (t) => {
  skipNoDist(t);
  P.resetHfProfileCache();
  const rows = [
    { account_id: "acc1", group_id: "g1@chatroom", profile_json: GOOD, version: 3, generated_at: 111 },
    { account_id: "acc1", group_id: "g2@chatroom", profile_json: "{坏", version: 1, generated_at: 111 },
  ];
  const n = P.loadHfProfilesIntoCache("acc1", rows, 400);
  assert.equal(n, 1, '坏行被跳过 (不会以"空画像"进缓存)');
  assert.equal(P.hfProfileCacheSize(), 1);
  const text = P.getHfProfilePromptText("acc1", "g1@chatroom");
  assert.ok(text && text.length <= 400);
  assert.equal(P.getHfProfileBandFloor("acc1", "g1@chatroom"), 0.72);
  assert.equal(P.getHfProfileBudget("acc1", "g1@chatroom").minGapSec, 300);
  assert.equal(P.getHfProfilePromptText("acc2", "g1@chatroom"), null, '别的账号取不到');
  assert.equal(P.getHfProfilePromptText("acc1", "other@chatroom"), null);
  // 再预热一次: 已消失的群必须从缓存里删掉 (否则吃的是过期画像)
  const n2 = P.loadHfProfilesIntoCache("acc1", [{ account_id: "acc1", group_id: "g9@chatroom", profile_json: GOOD }], 400);
  assert.equal(n2, 1);
  assert.equal(P.getHfProfilePromptText("acc1", "g1@chatroom"), null, '旧群必须被清掉');
  P.resetHfProfileCache();
  assert.equal(P.hfProfileCacheSize(), 0);
});

test('缓存: 预热时按 maxPromptChars 截断 (注入上限在缓存层就生效)', (t) => {
  skipNoDist(t);
  P.resetHfProfileCache();
  P.loadHfProfilesIntoCache("acc", [{ account_id: "acc", group_id: "g", profile_json: GOOD }], 30);
  const text = P.getHfProfilePromptText("acc", "g");
  assert.ok(text.length <= 30, `缓存里的文本必须已截断 (实得 ${text.length})`);
  P.resetHfProfileCache();
});

// ===== 5. 预算收紧 (画像 ∩ 配置) =====

test('tightenHfBudget: 间隔取 max / 上限取 min / enabled=false 的建议整条忽略', (t) => {
  skipNoDist(t);
  const base = B.resolveHfBudget(undefined);
  const t1 = B.tightenHfBudget(base, { minGapSec: 600, maxPerHour: 2 });
  assert.equal(t1.minGapSec, 600);
  assert.equal(t1.maxPerHour, 2);
  assert.equal(t1.maxPerDay, base.maxPerDay, '未给的字段保持配置值');
  const t2 = B.tightenHfBudget(base, { minGapSec: 1, maxPerHour: 99 });
  assert.deepEqual(t2, base, '全想放宽 ⇒ 等于没提建议');
  const t3 = B.tightenHfBudget(base, { enabled: false, minGapSec: 600 });
  assert.equal(t3.minGapSec, base.minGapSec, '画像无权通过 enabled:false 关掉结构约束');
  assert.equal(B.tightenHfBudget(base, null).minGapSec, base.minGapSec);
});

test('静默段: 默认不并入; 开启时过硬上限 (单段 ≤6h, 全天 ≤8h, 超限整段丢弃)', (t) => {
  skipNoDist(t);
  const base = B.resolveHfBudget(undefined);
  assert.deepEqual(base.quietHours, [], '配置默认空');
  assert.deepEqual(
    B.tightenHfBudget(base, { quietHours: [[1, 5]] }).quietHours,
    [],
    '默认 (applyQuietHours 未开) 时画像的静默段不得生效 —— 老板拍板"默认关"',
  );
  const on = B.tightenHfBudget(base, { quietHours: [[1, 5]] }, { applyQuietHours: true });
  assert.deepEqual(on.quietHours, [[1, 5]], '开了才生效');
  assert.equal(B.hfQuietRangeHours([23, 7]), 8, '跨零点折算 8h');
  assert.equal(B.hfQuietRangeHours([5, 5]), 0, '空段 0h');
  // 单段超 6h → 整段丢弃
  assert.deepEqual(B.mergeHfQuietHours([], [[0, 23]]), [], '一天 23h 的静默段必须被拒 (一次幻觉就能整天不吭声)');
  assert.deepEqual(B.mergeHfQuietHours([], [[22, 6]]), [], '跨零点 8h 也超单段上限');
  // 合计超 8h → 短的先留
  const merged = B.mergeHfQuietHours([], [[1, 5], [13, 19], [8, 10]]);
  assert.equal(merged.length, 2, '4h + 2h = 6h 收下, 再来 6h 会超 8h ⇒ 丢');
  assert.ok(merged.some((r) => r[0] === 8), '短段优先 (2h 的 [8,10] 在, 6h 的被丢)');
  assert.ok(merged.reduce((s, r) => s + B.hfQuietRangeHours(r), 0) <= B.HF_QUIET_MAX_TOTAL_H);
});

// ===== 6. 源级接线 =====

test('接线: sweep 里画像在 learning 开关**之前** (关掉调阈也要画像) 且全 catch', (t) => {
  const body = fnBody('src/inbound/heartflow-learn.ts', 'export async function runHeartflowSweep');
  const gen = body.indexOf('maybeGenerateHfGroupProfiles');
  const learnGate = body.indexOf('if (!L.enabled) return;');
  assert.ok(gen > 0, 'sweep 必须调 maybeGenerateHfGroupProfiles');
  assert.ok(learnGate > 0 && gen < learnGate, '画像必须排在 learning 开关之前 (两者独立)');
  assert.match(body.slice(gen, gen + 400), /catch[\s\S]{0,200}?profile pass failed/, '画像失败不得打断 sweep');
});

test('接线: 无循环依赖 (heartflow-profile 不 import heartflow-learn; heartflow 只 import type)', (t) => {
  const prof = src('src/inbound/heartflow-profile.ts');
  assert.doesNotMatch(prof, /from "\.\/heartflow-learn\.js"/, 'heartflow-profile 不得 import heartflow-learn (会成环)');
  const hf = src('src/inbound/heartflow.ts');
  assert.match(hf, /import type \{ HfProfileConfig \} from "\.\/heartflow-profile\.js"/, 'heartflow.ts 只 type-import 画像 (值导入会成环)');
  assert.doesNotMatch(hf, /import \{[^}]*\} from "\.\/heartflow-profile\.js"/, 'heartflow.ts 不得值导入画像模块');
  // 运行期真能加载 (环会自动表现为 undefined)
  assert.equal(typeof P.maybeGenerateHfGroupProfiles, 'function');
  assert.equal(typeof H.checkHeartflowGate, 'function');
});

test('接线: judge prompt 注入画像 (已截断) + handler 从缓存取', (t) => {
  const hf = src('src/inbound/heartflow.ts');
  const prompt = fnBody('src/inbound/heartflow.ts', 'export function buildHeartflowPrompt');
  assert.match(prompt, /input\.groupProfile/, 'prompt 必须注入 groupProfile');
  assert.match(prompt, /本群画像/, '注入必须带小标题 (让 judge 知道这是背景而非待判内容)');
  const h = src('src/inbound/handler.ts');
  assert.match(h, /groupProfile: getHfProfilePromptText\(m\.accountId, chatId\) \?\? undefined/, 'handler 必须从缓存取画像 (不查 DB)');
});

test('接线: 触发侧把画像预算并进 gate (第 7 参), 且 gate 用 override 优先', (t) => {
  const tr = src('src/inbound/triggers.ts');
  assert.match(tr, /tightenHfBudget\(/, '触发侧必须做"配置 ∩ 画像"');
  assert.match(tr, /getHfProfileBudget\(msg\.accountId, chatId\)/, '画像预算从内存缓存取');
  assert.match(tr, /applyQuietHours: cfg\.heartflow\.profile\?\.applyQuietHours === true/, '静默段要显式开关才并');
  assert.match(tr, /resolveHfBudget\(cfg\.heartflow\)/, '基准仍是账号配置 (画像只是收紧)');
  assert.match(tr, /effBudget,\s*\n\s*\);/, '必须作为 checkHeartflowGate 的第 7 参传入');
  const gate = fnBody('src/inbound/heartflow.ts', 'export function checkHeartflowGate');
  assert.match(gate, /budgetOverride \?\? resolveHfBudget\(cfg\)/, 'gate 必须用 override 优先、缺省回落到配置');
});

test('接线: 两个新子命令 + 用法提示 (子命令此前零测试覆盖)', (t) => {
  const i = src('src/index.ts');
  assert.match(i, /arg === "profile"/, '必须有 /heartflow profile');
  assert.match(i, /arg === "why"/, '必须有 /heartflow why');
  assert.match(i, /getHfLedgerLast\(accountId, gid\)/, 'why 必须读最近一条台账');
  assert.match(i, /getHfGroupProfile\(accountId, gid\)/, 'profile 必须读画像行');
  assert.match(i, /profile <群ID>/, '未知 action 的用法提示里要带上新命令');
  assert.match(i, /why <群ID>/, '未知 action 的用法提示里要带上新命令');
  // 画像建议的静默段必须说明"是否生效" (老板看到的每个数字都要有出处)
  assert.match(i, /未生效, 仅建议|已生效/, 'profile 输出必须标明静默段是否生效');
});

test('接线: 生成失败保留上一版 —— upsert 只在解析成功后调用', (t) => {
  const gen = fnBody('src/inbound/heartflow-profile.ts', 'export async function maybeGenerateHfGroupProfiles');
  const parseIdx = gen.indexOf('parseHfProfileResponse(');
  const upsertIdx = gen.indexOf('await upsertHfGroupProfile(');
  assert.ok(parseIdx > 0 && upsertIdx > 0);
  const between = gen.slice(parseIdx, upsertIdx);
  assert.match(between, /if \(!p\) \{[\s\S]{0,200}?continue;/, '解析失败必须 continue (保留上一版, 不写空画像)');
  assert.match(between, /保留上一版/, '失败日志要说清是"保留上一版"');
  // 单群失败不拖垮整轮
  assert.match(gen, /catch[\s\S]{0,300}?profile 生成失败/, '单群生成失败必须就地 catch');
  // 配额: 一轮不并发打 LLM
  assert.match(gen, /out\.generated >= Math\.max\(1, P\.maxPerRun\)/, '必须有单轮生成配额');
});

test('接线: 画像只读本地 DB (统计来自 wpp_messages 单表; 不出机器)', (t) => {
  const m = src('src/storage/db/mysql.ts');
  const st = fnBody('src/storage/db/mysql.ts', 'async getHfGroupMessageStats(');
  assert.match(st, /FROM wpp_messages/, '统计必须只读 wpp_messages');
  assert.doesNotMatch(st, /JOIN/i, '不得 JOIN (wpp_messages 与 wpp_hf_* collation 不同, 会报 mix of collations)');
  assert.match(st, /direction = 'inbound'/, '只统计入站 (排除 bot 自己说的话, 否则画像自我强化)');
  assert.match(m, /CREATE TABLE IF NOT EXISTS wpp_hf_group_profile\s*\(/, 'DDL 必须存在');
  assert.match(read(`${ROOT}/db/schema.sql`), /CREATE TABLE IF NOT EXISTS wpp_hf_group_profile/, 'schema.sql 也要有 (dev 一致性)');
});
