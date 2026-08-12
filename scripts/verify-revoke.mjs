// scripts/verify-revoke.mjs - 验证撤回能力: 发消息到群 → 撤回
// 用法: node scripts/verify-revoke.mjs <群ID> <内容>  (默认 57737516566@chatroom)
// 直接调 vendor HTTP (不依赖 registry), 验证 SendTxt → Revoke 链路

import { loadAccountConfig } from "/root/dev/wechatpadpro-openclaw/src/config.js";
import { request } from "undici";

const cfg = await loadAccountConfig("default");
if (!cfg.tokenKey || !cfg.authcode) {
  console.log("❌ 缺 tokenKey/authcode, 中止");
  process.exit(1);
}

const groupId = process.argv[2] ?? "57737516566@chatroom";
const content = process.argv[3] ?? `撤回能力测试 ${new Date().toISOString().slice(11, 19)}`;
const base = `${cfg.apiBaseUrl.replace(/\/$/, "")}/api`;

async function vendor(ep, body) {
  const res = await request(`${base}${ep}?authcode=${cfg.authcode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-TokenKey": cfg.tokenKey },
    body: JSON.stringify(body),
  });
  const text = await res.body.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { Code: -1, CodeValue: "BAD_JSON", Message: text.slice(0, 200) }; }
  return { status: res.statusCode, json };
}

// ===== 1. 发消息 =====
console.log(`[1/3] 发消息到群 ${groupId}: "${content}"`);
const send = await vendor("/Msg/SendTxt", { ToWxid: groupId, Content: content, At: "", Type: 1 });
console.log(`  HTTP ${send.status} Code=${send.json.Code} CodeValue=${send.json.CodeValue ?? ""}`);
const d = (send.json.Data ?? {}) ?? {};
// vendor SendTxt 响应: Data.List[0] 含 NewMsgId/ClientMsgid/MsgId/Createtime (实测 2026-08-10)
const list0 = Array.isArray(d.List) ? (d.List[0] ?? {}) : {};
const msgId = list0.NewMsgId ?? d.msgId ?? d.MsgId;       // 撤回用 NewMsgId (全局唯一)
const clientMsgId = list0.ClientMsgid ?? list0.MsgId ?? ""; // ClientMsgid (客户端ID, 可能 0)
const createTime = list0.Createtime ?? Math.floor(Date.now() / 1000);
console.log(`  返回 newMsgId=${msgId} clientMsgId=${clientMsgId} createTime=${createTime}`);
if (send.json.Code !== 0 || !msgId) {
  console.log("❌ 发消息失败, 无法继续撤回测试");
  process.exit(1);
}

// 等 1s 让消息落地
await new Promise((r) => setTimeout(r, 1000));

// ===== 2. 撤回 =====
console.log(`[2/3] 撤回 newMsgId=${msgId} clientMsgId=${clientMsgId}`);
const rev = await vendor("/Msg/Revoke", {
  ClientMsgId: String(clientMsgId),
  NewMsgId: String(msgId),
  CreateTime: createTime,
  ToUserName: groupId,
});
console.log(`  HTTP ${rev.status} Code=${rev.json.Code} CodeValue=${rev.json.CodeValue ?? ""}`);
const rd = (rev.json.Data ?? {}) ?? {};
console.log(`  ret=${rd.BaseResponse?.ret ?? rd.ret ?? "?"} errMsg=${JSON.stringify(rd.BaseResponse?.errMsg ?? rd.errMsg ?? "")}`);

// ===== 3. 判据 =====
// 发消息 ret (发送成功看 Code, 撤回成功看 BaseResponse.ret===0)
const ret = rd.BaseResponse?.ret;
const ok = rev.json.Code === 0 && (ret === 0 || ret === undefined);
console.log("");
console.log(ok
  ? "✅ 撤回成功 (Code=0 + BaseResponse.ret=0)"
  : `⚠️ 撤回响应 Code=${rev.json.Code} ret=${ret} — 需人工确认是否真的撤回 (可查群消息)`);
console.log(`  消息: "${content}" @ ${groupId}`);
