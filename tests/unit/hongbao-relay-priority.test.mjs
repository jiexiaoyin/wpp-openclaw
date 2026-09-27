// tests/unit/hongbao-relay-priority.test.mjs - v1.9.1/v1.9.2 接龙 vs 红包 判定优先级 + 关键词收窄 (回归门)
//
// 为什么这批测试重要: 这是一次**静默失效** —— 接龙被误判成红包后, handler 两处红包拦截
//   (静默入库 / 不触发 AI) 会把整条接龙丢掉, **不报错、不写日志标签**, 唯一痕迹是一行
//   "red packet detected: … url=missing" (看着像"来了个没 url 的红包")。
//   实测 (只读回放生产账本): 群接龙文案加上"红包"字样之后的接龙条条零回复,
//   而此前文案不含"红包"时的接龙条条有回复 ⇒ 相关性完美对应。
//   这类"文案一改就静默失灵"必须有门钉住, 否则下次改文案再中一次。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = '/root/dev/wechatpadpro-openclaw';
const read = (p) => fs.readFileSync(p, 'utf-8');

let hb = null;
let rl = null;
let loadErr = null;
try {
  hb = await import(new URL('../../dist/inbound/hongbao.js', import.meta.url));
  rl = await import(new URL('../../dist/inbound/relay.js', import.meta.url));
} catch (e) {
  loadErr = e;
}
function skipNoDist(t) {
  if (!hb || !rl) t.skip(`dist 缺失 (先 npm run build): ${loadErr?.message ?? ''}`);
}

// 真实群接龙的形状 (打码, 只保留判定所需特征): type=49 + "#接龙" 开头 + 文案里自带"红包"
const RELAY_WITH_HONGBAO = {
  msgType: 49,
  content: '#接龙 💥抓住新机，全力冲刺 🔥使命必达 今日开售，提升业绩，领取红包🧧 红包100元 1. 门店＋型号 2. A店 watch6pro 3. B店 watch6pro',
};
const RELAY_PLAIN = {
  msgType: 49,
  content: '#接龙 周年庆 1. 门店＋型号 2. A店 GT7蓝',
};

test('1. 核心回归: 文案自带"红包"的接龙**不得**被判为红包 (否则整条静默丢弃)', (t) => {
  skipNoDist(t);
  assert.equal(rl.isRelayMessage(RELAY_WITH_HONGBAO), true, '前提: 它确实是接龙');
  assert.equal(hb.isRedPacketMessage(RELAY_WITH_HONGBAO), false, '接龙优先 ⇒ 不是红包 (这就是本次修的 bug)');
  // 不含"红包"的接龙一向正常, 一并钉住 (防修 A 坏 B)
  assert.equal(hb.isRedPacketMessage(RELAY_PLAIN), false);
});

test('2. 真红包照旧被识别 (修 bug 不能把红包静默一起放开)', (t) => {
  skipNoDist(t);
  // heuristic 1: content 关键词 (**卡片形态**, 见 test 8: 纯文本不再采信关键词)
  assert.equal(hb.isRedPacketMessage({ msgType: 49, content: '恭喜发财，红包拿来', raw: {} }), true);
  // 厂商把原生红包卡片译成的精确文案 ⇒ 卡片 + 关键词, 必判红包 (生产上真红包就是这个形态)
  assert.equal(hb.isRedPacketMessage({ msgType: 49, content: '微信红包', raw: {} }), true);
  // heuristic 2: 微信原生 red packet appMsg.type=2002 (内容里没有"红包"二字也要认)
  assert.equal(hb.isRedPacketMessage({ msgType: 49, content: '', raw: { appMsg: { type: 2002 } } }), true);
  // heuristic 3: vendor 私有 type 串
  assert.equal(hb.isRedPacketMessage({ msgType: 49, content: '', raw: { type: 'hongbao' } }), true);
  // v1.3.72 转账/支付通知: category 命中即静默
  assert.equal(hb.isRedPacketMessage({ msgType: 49, content: '', raw: { app: { category: 'payment_notice' } } }), true);
  // category 未命中但 description 含"转账" ⇒ 兜底分支 (注意: 该分支嵌在 category 判断内,
  //   所以 **只有** category 存在时才可能命中 —— 这是既有实现的缺口, 本次不动, 如实钉在这里)
  assert.equal(
    hb.isRedPacketMessage({ msgType: 49, content: '', raw: { app: { category: 'other', description: '收到转账10.00元' } } }),
    true,
  );
  assert.equal(
    hb.isRedPacketMessage({ msgType: 49, content: '', raw: { app: { description: '收到转账10.00元' } } }),
    false,
    '无 category 时 description 兜底不生效 (既有缺口, 非本次范围)',
  );
});

test('3. 普通消息不受影响 (不误伤)', (t) => {
  skipNoDist(t);
  assert.equal(hb.isRedPacketMessage({ msgType: 1, content: '今天下午三点开会', raw: {} }), false);
  assert.equal(hb.isRedPacketMessage({ msgType: 1, content: '[图片] https://oss/a.jpg', raw: {} }), false);
  assert.equal(hb.isRedPacketMessage({ msgType: 3, content: '', raw: {} }), false);
});

test('4. 旧 chat-history (msgType=53) 走接龙兼容路径 ⇒ 同样不被当红包', (t) => {
  skipNoDist(t);
  // isRelayMessage 对 53 无条件 true (历史兼容); 53 是"聊天记录"而非红包, 排除它是正确方向
  assert.equal(rl.isRelayMessage({ msgType: 53, content: '红包' }), true);
  assert.equal(hb.isRedPacketMessage({ msgType: 53, content: '聊天记录 红包', raw: {} }), false);
});

test('5. 结构优先于关键词: 只有真接龙 (type=49 + "#接龙") 才豁免', (t) => {
  skipNoDist(t);
  // 卡片 (49) 但正文不是接龙 → 不豁免, 关键词照常命中
  assert.equal(hb.isRedPacketMessage({ msgType: 49, content: '红包雨来了', raw: {} }), true);
  // 纯文本不是接龙也不算红包 (v1.9.2) —— 接龙豁免**不是**这里生效, 而是关键词根本不采信纯文本
  assert.equal(hb.isRedPacketMessage({ msgType: 1, content: '接龙报名 1. 张三 红包100元', raw: {} }), false);
});

test('6. 源级门: 豁免必须写在 hongbao.ts 内、且在关键词启发式**之前**', (t) => {
  const src = read(`${ROOT}/src/inbound/hongbao.ts`);
  // 锚在**代码行**上: 注释里也会出现 "heuristic 1" 等字样, 用文字锚会被自己的注释打败 (写这批测试时真踩过)
  const GUARD = 'if (isRelayMessage(msg)) return false;';
  const HEURISTIC1 =
    'if (typeof msg.content === "string" && /红包|red.?packet/i.test(msg.content) && isCardMessage(msg))';
  const iGuard = src.indexOf(GUARD);
  const iHeuristic = src.indexOf(HEURISTIC1);
  assert.ok(iGuard > 0, 'hongbao.ts 必须有豁免代码行 (单一真源: handler 两处调用点自动都受保护)');
  assert.ok(iHeuristic > 0, 'heuristic 1 (内容关键词) 必须还在 (不能靠删掉关键词判定来"修" bug)');
  assert.ok(iGuard < iHeuristic, '接龙豁免必须在 heuristic 1 之前生效');
  assert.match(src, /import \{ isRelayMessage \} from "\.\/relay\.js"/, '必须 import 结构识别 (不得在 hongbao.ts 内联第二套接龙判定)');
});

test('8. v1.9.2 收窄: 纯文本提到"红包"不再被静默 (卡片照旧)', (t) => {
  skipNoDist(t);
  // 这三条都是生产账本里真实出现过的**人类聊天**形态 (打码): 拿关键词静默它们 = 把群友的话吞了
  for (const content of ['@某某 群收红包', '50红包店群发放@某某', '抓紧领大红包啦，坐等你们晒单']) {
    assert.equal(hb.isRedPacketMessage({ msgType: 1, content, raw: {} }), false, `纯文本不该静默: ${content}`);
  }
  // 图片/表情/语音同理 (只有卡片才采信关键词)
  assert.equal(hb.isRedPacketMessage({ msgType: 3, content: '红包截图', raw: {} }), false);
  assert.equal(hb.isRedPacketMessage({ msgType: 47, content: '红包', raw: {} }), false);
  // 反向: 卡片形态 (真红包的形态) 一律照旧静默
  assert.equal(hb.isRedPacketMessage({ msgType: 49, content: '微信红包', raw: {} }), true);
});

test('9. 源级门: 关键词启发式必须与"卡片"条件绑定 (不得退回裸关键词)', (t) => {
  const src = read(`${ROOT}/src/inbound/hongbao.ts`);
  assert.match(src, /isCardMessage\(msg\)/, 'hongbao.ts 必须有 isCardMessage');
  assert.match(
    src,
    /isCardMessage\(msg\)\)\s*\{\s*return true;/,
    '关键词判定必须 `&& isCardMessage(msg)` 之后才 return true (否则纯文本又被吞)',
  );
  assert.match(src, /function isCardMessage\(msg: WppInboundMessage\): boolean \{\s*return msg\.msgType === 49;/, '卡片定义 = msgType 49');
});

test('7. 源级门: handler 两处红包拦截都走同一个判定函数 (不得内联关键词)', (t) => {
  const src = read(`${ROOT}/src/inbound/handler.ts`);
  const hits = src.match(/isRedPacketMessage\(/g) ?? [];
  assert.equal(hits.length, 2, '两处拦截 (静默入库 + 不触发 AI) 都必须调 isRedPacketMessage');
  assert.match(src, /import \{ isRedPacketMessage, processRedPacket \} from "\.\/hongbao\.js"/, '必须从 hongbao.ts 取判定');
  // 接龙强制触发路径仍必须在 (防"顺手删了接龙分支")
  assert.match(src, /relay force-trigger dispatch/, '接龙强制触发分支必须还在');
});
