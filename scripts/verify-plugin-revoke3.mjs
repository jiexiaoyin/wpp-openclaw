import { loadAccountConfig } from "/root/dev/wechatpadpro-openclaw/src/config.js";
import { AccountContext } from "/root/dev/wechatpadpro-openclaw/src/accounts/account-context.js";
import { getDefaultAccountRegistry } from "/root/dev/wechatpadpro-openclaw/src/account-state.js";
import { sendMessage } from "/root/dev/wechatpadpro-openclaw/src/dispatch/send-message.js";
import { revokeMsg } from "/root/dev/wechatpadpro-openclaw/src/dispatch/outbound.js";

const groupId = process.argv[2] ?? "57737516566@chatroom";
const cfg = await loadAccountConfig("default");
const ctx = new AccountContext({ accountId: "default", config: cfg });
getDefaultAccountRegistry().contexts.set("default", ctx);

const content = `插件撤回验证${new Date().toISOString().slice(11, 19)}`;
const r = await sendMessage({ accountId: "default", toWxid: groupId, type: "text", content });
console.log(`[1/3] 发送: ${JSON.stringify(r)}`);
if (!r.ok || !r.newMsgId) { console.log("❌ 无 newMsgId"); process.exit(1); }
await new Promise((res) => setTimeout(res, 800));
// 用 createTime=server (消息自己的)
console.log(`[2/3] 撤回 (createTime=${r.createTime})`);
const rv = await revokeMsg("default", groupId, r.msgId, r.newMsgId, r.createTime);
console.log(`  返回: ${JSON.stringify(rv)}`);
console.log(`[3/3] 等 12s 查撤回事件...`);
await new Promise((res) => setTimeout(res, 12000));
console.log(rv.ok ? "revokeMsg ok=true" : "revokeMsg ok=false");
