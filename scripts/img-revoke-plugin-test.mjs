import { loadAccountConfig } from "/root/dev/wechatpadpro-openclaw/src/config.js";
import { AccountContext } from "/root/dev/wechatpadpro-openclaw/src/accounts/account-context.js";
import { getDefaultAccountRegistry } from "/root/dev/wechatpadpro-openclaw/src/account-state.js";
import { setBackend, resetAdapter } from "/root/dev/wechatpadpro-openclaw/src/storage/db/factory.js";
import { sendMessage } from "/root/dev/wechatpadpro-openclaw/src/dispatch/send-message.js";
import { revokeMsg } from "/root/dev/wechatpadpro-openclaw/src/dispatch/outbound.js";
import { readFileSync } from "node:fs";

const groupId = process.argv[2] ?? "57737516566@chatroom";
const imgUrl = readFileSync("/tmp/wpp-test-img.txt", "utf8").trim();
const cfg = await loadAccountConfig("default");
resetAdapter();
setBackend({ backend: "mariadb", mysql: { host: "127.0.0.1", port: 3306, user: "wechatpro", password: process.env.WECHATPRO_DB_PASSWORD ?? "", database: "wechatpro", connectionLimit: 5 } });
const ctx = new AccountContext({ accountId: "default", config: cfg });
getDefaultAccountRegistry().contexts.set("default", ctx);

// 1. 插件发图
console.log(`[1/3] sendMessage 发图 → ${groupId}`);
const r = await sendMessage({ accountId: "default", toWxid: groupId, type: "image", content: imgUrl });
console.log(`  返回: ${JSON.stringify(r)}`);
if (!r.ok || !r.newMsgId) { console.log("❌ 无 newMsgId"); resetAdapter(); process.exit(1); }

// 2. 插件撤回 (createTime=server)
await new Promise(res => setTimeout(res, 800));
console.log(`[2/3] revokeMsg(newMsgId=${r.newMsgId}, createTime=${r.createTime})`);
const rv = await revokeMsg("default", groupId, r.msgId, r.newMsgId, r.createTime);
console.log(`  返回: ${JSON.stringify(rv)}`);

// 3. 等撤回事件
console.log("[3/3] 等 12s 查撤回事件...");
await new Promise(res => setTimeout(res, 12000));
console.log("done");
resetAdapter();
