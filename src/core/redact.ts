// redact.ts — 日志脱敏 (2026-10-16, v1.16.1)
//
// 为什么单独一个模块: 同一条脱敏规则要被两处共用 ——
//   index.ts            打 setWebhook / setBusinessWebhook / STARTUP banner 日志
//   webhook-receiver.ts 打 addPath / removePath / listening / signature 日志
// 两处各写一遍必然漂移 (改了 A 忘 B = 还剩一条泄密的日志), 所以规则只在这里定义一次。
//
// 背景: webhookPathToken (见 config.ts ensureWebhookPathToken: **新生成**的走 randomBytes(16)
//   = 32 hex / 128-bit, 而**已存在**的值原样复用 ⇒ 老账号可能更短, 本机 default 在用的那把就是
//   24 hex / 96-bit —— 仍然无法暴力, 但"去日志里 grep 32 个 hex"这种找法会一条都搜不到) 是
// webhook 路径的唯一鉴权 —— 拿到它就等于拿到"往插件里灌任意消息"的入口。它嵌在
// `${webhookPublicUrl}${webhookPath}` 里, 而这几条日志天天在打完整 URL ⇒ 明文 token
// 会长期落在 journald / 日志文件里。authcode 早就走 maskSecret 了, token 没有 —— 这就是本次补的洞。

/** 和 authcode 同一套 mask: 留头 4 尾 2, 便于人工核对"是不是同一条", 又不给出可用信息 */
export function maskSecret(secret: string): string {
  if (!secret) return "(empty)";
  return secret.length <= 4 ? "****" : `${secret.slice(0, 4)}...${secret.slice(-2)}`;
}

/**
 * 把字符串 (URL / 路径) 里出现的 webhook token 换成 maskSecret 形式。纯函数。
 *
 * 为什么按**值**替换, 而不是按 `/wechatpadpro/<段>/` 的**结构**替换:
 *   结构式替换在没有配 token 的老配置上会把字面量段 "webhook" 当成 token 打码,
 *   日志就变成 `/wechatpadpro/webh...ok/` —— 恰好在排障时把人往沟里带。
 *   按值替换时 token 为空 ⇒ 原样返回, 语义精确: 路径里没有 token 就没有秘密可脱。
 *   (token 由 config.ts 生成/读取: 生成的是 32 hex, 读到的可能是任意长度的老值;
 *    手填的短 token 由 maskSecret 的 `length <= 4 → "****"` 分支兜住, 不会漏出原文。)
 */
export function redactWebhookPath(s: string, token?: string): string {
  if (!token) return s;
  return s.split(token).join(maskSecret(token));
}

/**
 * 多 token 版: 依次替换。给**共享 webhook server** (v1.3.61 多账号共用一个端口) 用 ——
 * 后启动账号注册的 path 带的是**它自己**的 token, 只拿首个账号的 token 做闭包会漏掉它。
 * 空值/undefined 项自动跳过 (调用方不必过滤)。
 */
export function redactWebhookPathAny(s: string, tokens: Iterable<string | undefined | null>): string {
  let out = s;
  for (const t of tokens) out = redactWebhookPath(out, t ?? undefined);
  return out;
}
