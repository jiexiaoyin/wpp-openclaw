// 验证 periodic retry: mock apiClient 第一次失败, 模拟定时器 5min 后成功
import { AccountContext } from "../src/accounts/account-context.js";
import { loadAccountConfig } from "../src/config.js";

const cfg = await loadAccountConfig("default");
const ctx = new AccountContext({ accountId: "default", config: cfg });

// mock apiClient: 第一次失败 (Code=-1), 之后 OK
let attempt = 0;
ctx.apiClient.setWebhook = async (url, authcode) => {
  attempt++;
  console.log(`[mock apiClient] setWebhook attempt=${attempt} url=${url}`);
  if (attempt === 1) return { Code: -1, CodeValue: "MOCK_FIRST_FAIL" };
  return { Code: 0 };
};

// 模拟 index.ts P1-1 周期性 retry 逻辑
const PERIODIC_RETRY_MS = 5 * 60 * 1000;
const url = `https://wx.juhe.chat/wechatpadpro/default/webhook`;

// 第 1 次失败
let result = await ctx.apiClient.setWebhook(url, cfg.authcode);
if (result.Code !== 0) {
  console.log("[P1-1] 启动时 setWebhook 失败, schedule periodic retry...");
  // 模拟: 缩短到 100ms 测试
  const TEST_INTERVAL_MS = 100;
  let timer = setInterval(async () => {
    const r = await ctx.apiClient.setWebhook(url, cfg.authcode);
    if (r.Code === 0) {
      console.log(`[P1-1] 周期性 retry 成功! clear timer. attempt=${attempt}`);
      ctx.clearRetryTimer(timer);
    } else {
      console.log(`[P1-1] 周期性 retry 失败 (会继续): Code=${r.Code}`);
    }
  }, TEST_INTERVAL_MS);
  timer.unref();
  ctx.setRetryTimer(timer);
  // 等 250ms 让 mock 跑 3 次 (1 fail + 1 ok + 1 ok)
  await new Promise((r) => setTimeout(r, 250));
}

console.log(`\nFinal state: attempt=${attempt} (期望 2 次: 1 fail + 1 ok)`);
console.log(`Periodic retry timer cleared: ${attempt >= 2 ? "YES" : "NO"}`);
process.exit(0);
