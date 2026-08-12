import { loadAccountConfig } from "/root/dev/wechatpadpro-openclaw/src/config.js";
const cfg = await loadAccountConfig("default");
const base = `${cfg.apiBaseUrl.replace(/\/$/, "")}/api`;
// 用已入库的语音 base64? 简化: 只查 swagger 是否有 response schema
console.log("swagger SendVoice/SendVideo response:");
