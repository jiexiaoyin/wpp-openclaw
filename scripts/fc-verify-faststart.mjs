import { readFileSync } from "node:fs";
import { makeWppFriendCircle } from "../src/send/friendcircle.js";
const ctx = { baseUrl: "https://wx.juhe.chat", tokenKey: process.env.WECHATPRO_TOKEN_KEY, authcode: process.env.WECHATPRO_AUTHCODE, accountId: "default" };
const fc = makeWppFriendCircle(ctx);
const { postWppJson } = await import("../src/api/client.js");
const { ctxToCallOpts } = await import("../src/send/factory.js");

// 发布 faststart 视频
const vb = readFileSync("/tmp/vid/v_fast.mp4").toString("base64");
const tb = readFileSync("/tmp/vid/thumb2.jpg").toString("base64");
console.log("[1] publishVideo (faststart 768x768)...");
const pub = await fc.publishVideo("朋友圈视频faststart验证 [请勿删]", vb, tb);
const id = pub.Data?.SnsObject?.Id;
console.log("  SnsObject.Id:", id);

// 等 2 秒让服务端处理
await new Promise(r => setTimeout(r, 2000));

// GetList 查 XML
const r = await postWppJson(ctx.baseUrl, "/FriendCircle/GetList", { maxid: 0 }, ctxToCallOpts(ctx));
const target = (r.Data?.ObjectList ?? []).find(i => String(i.Id) === String(id));
const xml = target?.ObjectDesc?.buffer ?? "";
const size = xml.match(/<size height="([^"]+)" width="([^"]+)"[^>]*>/);
const dur = xml.match(/<videoDuration><!\[CDATA\[([^\]]+)\]\]>/);
console.log(`\n[2] 发布后 XML 元数据:`);
console.log(`  封面 size: ${size ? size[2]+"x"+size[1] : "未找到"}`);
console.log(`  时长: ${dur?.[1] ?? "未找到"}`);
const ok = size && size[1] === "768" && size[2] === "768";
console.log(ok ? "\n✅ faststart 修复生效: 封面 768x768 正常!" : "\n⚠️ 封面仍异常");
