#!/usr/bin/env node
// tools/wpp-cli.mjs - WPP vendor 极简 CLI (P2-2)
// 4 命令: status / webhook-get / webhook-set / webhook-remove
// 用法: node tools/wpp-cli.mjs <cmd> [accountId] [args...]
// 不依赖 OpenClaw daemon, 直接 vendor + .env 协议
// SSOT: /root/dev/wechatpadpro-openclaw/accounts/<id>.json + env vars


import { request } from "undici";

const ACCOUNT_ID = process.argv[3] || "default";
const CONFIG_PATH = `/root/dev/wechatpadpro-openclaw/accounts/${ACCOUNT_ID}.json`;
const cmd = process.argv[2];

async function loadEnv(envPath) {
  // 简化: 从 openclaw gateway systemd env 读
  // 真实 env 来源: /root/.openclaw/gateway.systemd.env
  try {
    const fs = await import("fs");
    const envContent = fs.readFileSync(envPath, "utf8");
    for (const line of envContent.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2];
    }
  } catch (e) {
    // fallback: 进程已有 env
  }
}

async function getRawVendorConfig(accountId) {
  // 读 accounts/<id>.json raw, 拿 tokenKey/authcode 不带 env 解
  const fs = await import("fs");
  const raw = JSON.parse(fs.readFileSync(`/root/dev/wechatpadpro-openclaw/accounts/${accountId}.json`, "utf8"));
  const envVars = fs.readFileSync("/root/.openclaw/gateway.systemd.env", "utf8");
  const envMap = {};
  for (const line of envVars.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m) envMap[m[1]] = m[2];
  }
  const resolve = (val, envKey) => {
    if (typeof val === "string" && val.startsWith("$") && envKey) {
      return envMap[envKey] || "";
    }
    return val;
  };
  const tokenKey = raw.tokenKeyEnv ? envMap[raw.tokenKeyEnv] : raw.tokenKey;
  const authcode = raw.authcodeEnv ? envMap[raw.authcodeEnv] : raw.authcode;
  return {
    apiBaseUrl: raw.apiBaseUrl || raw.baseUrl || "https://wx.juhe.chat",
    tokenKey,
    authcode,
    webhookPublicUrl: raw.webhookPublicUrl || process.env.WECHATPRO_WEBHOOK_PUBLIC_URL || "",
    webhookPath: raw.webhookPath || "/wechatpadpro/webhook",
  };
}

async function cmdWebhookGet(accountId) {
  const cfg = await getRawVendorConfig(accountId);
  const url = `${cfg.apiBaseUrl}/api/Webhook/Get?authcode=${cfg.authcode}`;
  const res = await request(url, {
    method: "GET",
    headers: { "X-TokenKey": cfg.tokenKey },
  });
  const body = await res.body.text();
  console.log(`HTTP ${res.statusCode}`);
  try {
    const obj = JSON.parse(body);
    console.log(JSON.stringify(obj, null, 2));
  } catch {
    console.log(body.slice(0, 500));
  }
}

async function cmdWebhookSet(accountId, targetUrl) {
  const cfg = await getRawVendorConfig(accountId);
  const url = targetUrl || `${cfg.webhookPublicUrl.replace(/\/$/, "")}${cfg.webhookPath}`;
  const body = JSON.stringify({ url });
  const res = await request(`${cfg.apiBaseUrl}/api/Webhook/Set?authcode=${cfg.authcode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-TokenKey": cfg.tokenKey },
    body,
  });
  const resBody = await res.body.text();
  console.log(`HTTP ${res.statusCode}`);
  console.log(`Set URL: ${url}`);
  console.log(resBody);
}

async function cmdWebhookRemove(accountId) {
  const cfg = await getRawVendorConfig(accountId);
  const res = await request(`${cfg.apiBaseUrl}/api/Webhook/Remove`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-TokenKey": cfg.tokenKey },
    body: JSON.stringify({ authcode: cfg.authcode }),
  });
  const body = await res.body.text();
  console.log(`HTTP ${res.statusCode}`);
  console.log(body);
}

async function cmdStatus(accountId) {
  const cfg = await getRawVendorConfig(accountId);
  console.log(`Account: ${accountId}`);
  console.log(`  apiBaseUrl: ${cfg.apiBaseUrl}`);
  console.log(`  webhookPublicUrl: ${cfg.webhookPublicUrl || "(MISSING)"}`);
  console.log(`  webhookPath: ${cfg.webhookPath}`);
  console.log(`  expected webhook URL: ${cfg.webhookPublicUrl ? cfg.webhookPublicUrl + cfg.webhookPath : "(undefined)"}`);
  console.log(`  tokenKey: ${cfg.tokenKey ? cfg.tokenKey.slice(0, 8) + "..." : "MISSING"}`);
  console.log(`  authcode: ${cfg.authcode ? cfg.authcode.slice(0, 8) + "..." : "MISSING"}`);
  console.log("\n--- vendor /Webhook/Get ---");
  await cmdWebhookGet(accountId);
}

const usage = `Usage: node tools/wpp-cli.mjs <cmd> [accountId] [args]
Commands:
  status <id>           Show account + vendor webhook state
  webhook-get <id>      Query vendor /Webhook/Get
  webhook-set <id> [url]  Set webhook URL (default: auto-computed)
  webhook-remove <id>   Remove webhook URL`;

if (!cmd) {
  console.log(usage);
  process.exit(0);
}

try {
  if (cmd === "status") await cmdStatus(ACCOUNT_ID);
  else if (cmd === "webhook-get") await cmdWebhookGet(ACCOUNT_ID);
  else if (cmd === "webhook-set") await cmdWebhookSet(ACCOUNT_ID, process.argv[4]);
  else if (cmd === "webhook-remove") await cmdWebhookRemove(ACCOUNT_ID);
  else { console.log(usage); process.exit(1); }
} catch (e) {
  console.error("ERROR:", e.message);
  process.exit(1);
}
