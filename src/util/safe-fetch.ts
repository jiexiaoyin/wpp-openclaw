// src/util/safe-fetch.ts - v1.3.18 P1-安全2 + F1/F4/F5 fix (2026-08-10)
// 限制 fetch 只到白名单 host, 防 SSRF (prompt 注入 → 外带内网 / metadata / 本地 vendor)
// + 加字节 cap, 防 OOM (恶意/慢速 CDN → 内存耗尽)
//
// 设计:
//   - safeFetch: 只做 host 白名单 + 协议校验, 透传 vendor fetch
//   - safeFetchWithCap: 在 safeFetch 基础上加 maxBytes 限制 (Content-Length 预检 + 流式累加兜底)
//   - isHostAllowed: 暴露给测试, 也可由调用方自行判断 (e.g. 构造 URL 前)
//
// 白名单: OSS bucket + vendor 公网反代 + 第三方 AI 端点 (跟 enqueue/OSS/LLM 实际使用一致)
//   - openclaw-a.oss-cn-hangzhou.aliyuncs.com (OSS)
//   - WPP_VENDOR_HOST.example.com (vendor 反代, 即 API host)
//   - judge 主端点 (静态默认 + 经 env 点名的那个, 见 JUDGE_BASE_URL_ENV)
//   - judge 兜底端点 (v1.13.0, 见 JUDGE_FALLBACK_BASE_URL_ENV)
//
// 阻止列表: loopback / 私网 / link-local (含 cloud metadata 169.254.169.254) / localhost / IPv6 loopback

import { URL } from "node:url";

/**
 * v1.12.0 (2026-10-03): judge 主端点所在的 host 允许经 env 声明 (值 = 完整 base URL, 例:
 * https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1)。
 *
 * 为什么把它放进白名单: 换 judge 端点时若只改 baseUrl 而忘了改下面这张静态表, safeFetch 会对
 * **每一条** judge 调用抛 `host not in whitelist`, 而 heartflow 把 judge 异常吞成"不回复"
 * ⇒ 心流静默停摆, 日志里只留一条 warning (与 2026-09-11 那次"静默瘫 3 天"同族形态)。
 * 所以「换端点」必须只有**一个旋钮**: 本常量既在这里被解析成白名单条目, 又是
 * src/llm-judge.ts 的 baseUrl 来源 —— 两处共用同一个字符串常量, 结构性不会漂移。
 *
 * ⚠️ 白名单语义未变: 仍然是「只允许**运维点名**的主机」。env 由运维/配置层控制, 不是模型可写
 * (prompt 注入改不了它); 值缺失/非法 URL/非 http(s) 一律忽略(不抛), 不在名单里的 host 一律拒绝。
 */
/**
 * ⚠️ v1.14.0 (2026-10-04) 改名: 此常量原为 "DEEPSEEK_BASE_URL"。老板拍板「阿里的那个不能使用 deepseek*」——
 * v1.12.0 换了端点却没换名, 于是这个变量里装着**阿里云套餐 key 的配套端点**却叫 deepseek,
 * 与框架自家 models.providers.deepseek 的 env 兜底撞名 (阿里 key 被 POST 到 api.deepseek.com,
 * 2026-10-04 一天 62 条 invalid + 每次阿里端点 403 都拖成 "All models failed")。
 * 旧名不再被任何地方读取; 只留一处启动告警 (llm-judge.lingeringLegacyJudgeVars)。
 */
export const JUDGE_BASE_URL_ENV = "JUDGE_BASE_URL";

/**
 * v1.13.0 (2026-10-03): judge **兜底**端点 (主端点故障时重试的那一个) 所在的 host, 同样经 env 声明。
 * 与上一条**同一个理由, 但风险更高**: 兜底只在"主端点已经坏了"时才走, 是整条链上最没人看的一跳 ——
 * 少一个白名单条目 = 兜底从未生效过, 而现场表现只是"主端点一挂, 心流就还是不回复"
 * (兜底自己抛 host not in whitelist, 被 heartflow 吞成"不回复", 与 v1.6.1 那次静默瘫同族)。
 */
export const JUDGE_FALLBACK_BASE_URL_ENV = "JUDGE_FALLBACK_BASE_URL";

/** 允许经 env 声明 host 的变量名 (将来新增 AI 端点只需往这里追加一个) */
const ENV_DECLARED_HOST_VARS = [JUDGE_BASE_URL_ENV, JUDGE_FALLBACK_BASE_URL_ENV] as const;

/**
 * 读取 ENV_DECLARED_HOST_VARS 各变量声明的 hostname.
 * 值缺失 / 不是合法 URL / 非 http(s) → 跳过 (不抛): 非法值由 judge 那边给出更准的报错。
 */
function getEnvDeclaredHosts(): string[] {
  const hosts: string[] = [];
  for (const name of ENV_DECLARED_HOST_VARS) {
    const raw = (process.env[name] ?? "").trim();
    if (!raw) continue;
    try {
      const u = new URL(raw);
      if (/^https?:$/.test(u.protocol) && u.hostname) hosts.push(u.hostname);
    } catch {
      /* 值不是合法 URL → 忽略 */
    }
  }
  return hosts;
}

/**
 * v1.3.19 RELEASE: vendor host 可经 env WPP_VENDOR_HOST 覆盖 (发布版不含默认域名, 接收方设自己 vendor host).
 * 生产不设 env → 默认 WPP_VENDOR_HOST.example.com (行为不变).
 * 用 function 动态读 env (避免 module load 时 env 未设).
 */
function getAllowedHosts(): Set<string> {
  const vendorHost = process.env.WPP_VENDOR_HOST || "WPP_VENDOR_HOST.example.com";
  return new Set([
    // v1.12.0: judge 端点经 env 点名的 host (换端点只改 JUDGE_BASE_URL, 见 JUDGE_BASE_URL_ENV;
    //   v1.14.0 前该变量叫 DEEPSEEK_BASE_URL —— 旧名已不再被读取, 见上方改名说明)
    ...getEnvDeclaredHosts(),
    // OSS bucket
    "openclaw-a.oss-cn-hangzhou.aliyuncs.com",
    // vendor 公网反代 (可配置)
    vendorHost,
    // v1.3.27 P3-safe-fetch: 3 个第三方 AI 服务 (配置/常量来源, 非用户输入; 白名单化后
    //   裸 fetch → safeFetch, 仍拦截内网/loopback/metadata, 防 prompt 注入 → URL 操控)
    "dashscope.aliyuncs.com",     // 阿里 embedding (intent-embed)
    "api.minimaxi.com",           // MiniMax LLM (intent-llm)
    "api.deepseek.com",           // v1.6.0 judge 主端点默认值 (llm-judge: heartflow/jargon/affection/enrich);
                                  //   v1.12.0 起实际端点可被 JUDGE_BASE_URL 覆盖 → 上面 getEnvDeclaredHosts()
                                  //   (v1.14.0 前该 env 叫 DEEPSEEK_BASE_URL)
    "api.siliconflow.cn",         // SiliconFlow STT (storage/stt)
  ]);
}

const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^127\./,                    // loopback (127.0.0.0/8)
  /^10\./,                     // private 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\./, // private 172.16.0.0/12
  /^192\.168\./,               // private 192.168.0.0/16
  /^169\.254\./,               // link-local (含 cloud metadata 169.254.169.254)
  /^0\.0\.0\.0$/,
  /^::1$/,                     // IPv6 loopback
  /^fe80:/i,                   // IPv6 link-local
  /^localhost$/i,
];

/**
 * 判定 URL 是否在 host 白名单内 (协议 http/https + 非黑名单 + 在 ALLOWED_HOSTS 集合)
 * 默认拒绝: 不在白名单 → false
 */
export function isHostAllowed(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  // 协议白名单 (http/https only)
  if (!/^https?:$/.test(u.protocol)) return false;
  // 黑名单优先 (loosely match 私网 + metadata)
  if (BLOCKED_HOST_PATTERNS.some((p) => p.test(u.hostname))) return false;
  // 白名单 (唯一允许通过的 host, 动态读 env 支持发布版自定义)
  if (getAllowedHosts().has(u.hostname)) return true;
  return false; // 默认拒绝
}

/**
 * 带 host 白名单的 fetch (代替裸 fetch), 不在白名单 → throw.
 * 返回 Response, 调用方负责 .ok/.status/.body/.arrayBuffer() 等.
 */
export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  if (!isHostAllowed(url)) {
    throw new Error(`safeFetch: host not in whitelist: ${url}`);
  }
  return fetch(url, init);
}

/**
 * v1.3.18 F1/F4/F5 fix: 媒体下载字节 cap (防恶意/慢速 CDN → OOM).
 * 默认 100MB hard cap (F1/F4/F5 防御).
 *
 * 流程:
 *   1. safeFetch 拉 response (host 白名单 + 超时透传)
 *   2. Content-Length 预检 → 超 cap 立刻 throw
 *   3. 流式 reader 累加 → 任何时刻超出 cap 立刻 cancel + throw
 *   4. 累加 chunks → Buffer.concat 返回
 */
export const MAX_MEDIA_BYTES = 100 * 1024 * 1024; // 100MB hard cap

/**
 * 带 host 白名单 + 字节 cap 的 fetch → 返回 Buffer.
 *
 * @param url 目标 URL (必须 isHostAllowed)
 * @param init fetch init (headers/signal/timeout)
 * @param maxBytes 字节 cap (默认 100MB, sendFile 用 50MB 更严)
 */
export async function safeFetchWithCap(
  url: string,
  init?: RequestInit,
  maxBytes: number = MAX_MEDIA_BYTES,
): Promise<Buffer> {
  const resp = await safeFetch(url, init);
  if (!resp.ok) throw new Error(`safeFetchWithCap: HTTP ${resp.status} (${url})`);
  // Content-Length 预检 (defense in depth)
  const contentLength = parseInt(resp.headers.get("content-length") ?? "0", 10);
  if (contentLength > maxBytes) {
    throw new Error(`safeFetchWithCap: Content-Length ${contentLength} > cap ${maxBytes} (${url})`);
  }
  // 流式累加 + cap 校验 (兜底: Content-Length 缺失/被伪造时仍能 catch)
  const reader = resp.body?.getReader();
  if (!reader) throw new Error(`safeFetchWithCap: no body reader (${url})`);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {/* ignore */});
        throw new Error(`safeFetchWithCap: stream exceeded cap ${maxBytes} bytes (${url})`);
      }
      chunks.push(value);
    }
  } catch (e) {
    // 确保 stream 被关闭 (避免 connection leak)
    await reader.cancel().catch(() => {/* ignore */});
    throw e;
  }
  // 拼 Buffer (length 精确)
  let len = 0;
  for (const c of chunks) len += c.byteLength;
  return Buffer.concat(chunks, len);
}