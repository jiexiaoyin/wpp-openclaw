import { loadAccountConfig } from "/root/dev/wechatpadpro-openclaw/src/config.js";
import { AccountContext } from "/root/dev/wechatpadpro-openclaw/src/accounts/account-context.js";
import { request } from "undici";

const cfg = await loadAccountConfig("default");
const ctx = new AccountContext({ accountId: "default", config: cfg });

if (!cfg.webhookPublicUrl || !cfg.authcode) {
  console.log("missing env, abort");
  process.exit(0);
}

const url = `${cfg.webhookPublicUrl.replace(/\/$/, "")}${cfg.webhookPath}`;
console.log(`Calling vendor /Webhook/Set:`);
console.log(`  POST ${cfg.apiBaseUrl}/api/Webhook/Set?authcode=${cfg.authcode}`);
console.log(`  body: { url: "${url}", authcode: "${cfg.authcode}" }`);

// 真调 vendor
const res = await request(`${cfg.apiBaseUrl}/api/Webhook/Set?authcode=${cfg.authcode}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-TokenKey": cfg.tokenKey },
  body: JSON.stringify({ url, authcode: cfg.authcode }),
});
const body = await res.body.text();
console.log(`\nResult:`);
console.log(`  HTTP ${res.statusCode}`);
console.log(`  body: ${body}`);
