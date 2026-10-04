// doctor-empty-group-allowlist-v1151.test.mjs — v1.15.1: 抑制框架的**假**「群白名单为空」告警
//
// 背景 (详见 src/channel-contract.ts doctor.shouldSkipDefaultEmptyGroupAllowlistWarning 注释):
//   v1.15.0 起 channels.wechatpadpro 顶层块的 groupAllowFrom 是**逗号串** (Channel 页单框必需),
//   而框架的通用判据 hasAllowFromEntries 只认 Array ⇒ 恒判成"空" ⇒ openclaw doctor 每次报
//   "groupPolicy is allowlist but groupAllowFrom is empty — all group messages silently dropped"
//   (假报: 真实名单在 accounts/<id>.json, 框架看不到)。
//
// 本测试锁死**抑制条件**:
//   · 账号文件里真有名单 (数组 or 逗号串) → true (跳过假报)
//   · 真为空 / 文件缺失 / 非法内容 / 非法 id / 别的 channel → false (让框架照旧告警)
// 只碰 scratch 账号 (dgv<pid>*), **绝不读写 accounts/default.json** (老板铁律: 生产配置零改动)。
// 需要对 default 分支的断言走**只读**: 现读现算期望值, 不写死内容。
//
// 需要 dist 编译产物 (npm run build 后跑)。

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const ACCT_DIR = join(ROOT, 'accounts');
const stateDir = await mkdtemp(join(tmpdir(), 'wpp-dgv-'));
process.env.OPENCLAW_STATE_DIR = stateDir;

const { createChannelContract } = await import(pathToFileURL(join(ROOT, 'dist/channel-contract.js')).href);

// deps 只在 outbound/gateway 等被调用时用到; 构造契约对象不需要 -> 给了就抛错当哨兵。
const boom = () => {
  throw new Error('deps 不应在构造 doctor 钩子时被调用');
};
const contract = createChannelContract({
  startAccountById: boom,
  resolveOutboundAccount: boom,
  inferFileNameForMedia: boom,
});
const skip = contract.doctor.shouldSkipDefaultEmptyGroupAllowlistWarning;

const P = `dgv${process.pid}`;
const ids = [`${P}a`, `${P}b`, `${P}c`, `${P}d`, `${P}e`];
const fp = (id) => join(ACCT_DIR, `${id}.json`);
const cleanup = async () => {
  for (const id of ids) await rm(fp(id), { force: true });
};
const call = (prefix, channelName = 'wechatpadpro') =>
  skip({ channelName, prefix, account: {}, dmPolicy: undefined, effectiveAllowFrom: undefined });

test('接线: doctor 契约暴露本钩子, 且没有把 warnOnEmptyGroupSenderAllowlist 关掉', () => {
  assert.equal(typeof skip, 'function', 'shouldSkipDefaultEmptyGroupAllowlistWarning 必须是函数');
  assert.equal(
    contract.doctor.warnOnEmptyGroupSenderAllowlist,
    true,
    '通用告警开关必须仍是 true —— 我们只是逐条条件性抑制, 不是全局关掉',
  );
});

test('账号文件里是数组且非空 -> 抑制 (true)', async () => {
  await writeFile(fp(ids[0]), JSON.stringify({ groupAllowFrom: ['1234@chatroom', '5678@chatroom'] }));
  assert.equal(call(`channels.wechatpadpro.accounts.${ids[0]}`), true);
});

test('账号文件里是逗号串且非空 -> 抑制 (true) —— 证明复用了运行期同一归一口径', async () => {
  await writeFile(fp(ids[1]), JSON.stringify({ groupAllowFrom: '1234@chatroom, 5678@chatroom' }));
  assert.equal(call(`channels.wechatpadpro.accounts.${ids[1]}`), true);
});

test('账号文件里是空数组 -> 不抑制 (false): 真为空时框架的告警有价值', async () => {
  await writeFile(fp(ids[2]), JSON.stringify({ groupAllowFrom: [] }));
  assert.equal(call(`channels.wechatpadpro.accounts.${ids[2]}`), false);
});

test('账号文件里是空串 / 只有分隔符 -> 不抑制 (false)', async () => {
  await writeFile(fp(ids[3]), JSON.stringify({ groupAllowFrom: ' , ,  ' }));
  assert.equal(call(`channels.wechatpadpro.accounts.${ids[3]}`), false);
});

test('账号文件缺失 / 非法 JSON / 非法 id -> 不抑制 (false), 且不抛', async () => {
  assert.equal(call(`channels.wechatpadpro.accounts.${P}nope`), false, '文件不存在');
  await writeFile(fp(ids[4]), '{ 这不是 JSON ');
  assert.equal(call(`channels.wechatpadpro.accounts.${ids[4]}`), false, '非法 JSON');
  assert.equal(call('channels.wechatpadpro.accounts.../../etc/passwd'), false, '路径穿越 id');
  assert.equal(call('channels.wechatpadpro.accounts.'), false, '空 id');
});

test('别的 channel 调过来 -> 一律 false (不替别人抑制)', () => {
  assert.equal(call('channels.telegram', 'telegram'), false);
  assert.equal(call('channels.wecom', 'wecom'), false);
});

test('无 accounts 段的 prefix (隐式 default 账号) -> 现读 default 文件算期望, 结果一致', async () => {
  const raw = JSON.parse(readFileSync(join(ACCT_DIR, 'default.json'), 'utf8'));
  const v = raw.groupAllowFrom;
  const expected = Array.isArray(v)
    ? v.map((s) => String(s).trim()).filter(Boolean).length > 0
    : typeof v === 'string'
      ? v.split(',').map((s) => s.trim()).filter(Boolean).length > 0
      : false;
  assert.equal(call('channels.wechatpadpro'), expected);
});

test.after(async () => {
  await cleanup();
  await rm(stateDir, { recursive: true, force: true });
});
