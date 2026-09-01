// src/util/safe-fetch.ts - v1.3.18 P1-安全2 + F1/F4/F5 fix (2026-08-10)
// 限制 fetch 只到白名单 host, 防 SSRF (prompt 注入 → 外带内网 / metadata / 本地 vendor)
// + 加字节 cap, 防 OOM (恶意/慢速 CDN → 内存耗尽)
//
// 设计:
//   - safeFetch: 只做 host 白名单 + 协议校验, 透传 vendor fetch
//   - safeFetchWithCap: 在 safeFetch 基础上加 maxBytes 限制 (Content-Length 预检 + 流式累加兜底)
//   - isHostAllowed: 暴露给测试, 也可由调用方自行判断 (e.g. 构造 URL 前)
//
// 白名单: OSS bucket + vendor 公网反代 (跟 enqueue/OSS 实际使用一致)
//   - openclaw-a.oss-cn-hangzhou.aliyuncs.com (OSS)
//   - wx.juhe.chat (vendor 反代, 即 API host)
//
// 阻止列表: loopback / 私网 / link-local (含 cloud metadata 169.254.169.254) / localhost / IPv6 loopback

import { URL } from "node:url";

/**
 * v1.3.19 RELEASE: vendor host 可经 env WPP_VENDOR_HOST 覆盖 (发布版不含默认域名, 接收方设自己 vendor host).
 * 生产不设 env → 默认 wx.juhe.chat (行为不变).
 * 用 function 动态读 env (避免 module load 时 env 未设).
 */
function getAllowedHosts(): Set<string> {
  const vendorHost = process.env.WPP_VENDOR_HOST || "wx.juhe.chat";
  return new Set([
    // OSS bucket
    "openclaw-a.oss-cn-hangzhou.aliyuncs.com",
    // vendor 公网反代 (可配置)
    vendorHost,
    // v1.3.27 P3-safe-fetch: 3 个第三方 AI 服务 (配置/常量来源, 非用户输入; 白名单化后
    //   裸 fetch → safeFetch, 仍拦截内网/loopback/metadata, 防 prompt 注入 → URL 操控)
    "dashscope.aliyuncs.com",     // 阿里 embedding (intent-embed)
    "api.minimaxi.com",           // MiniMax LLM (intent-llm)
    "api.deepseek.com",           // v1.6.0 DeepSeek LLM (llm-judge: heartflow/jargon/affection/enrich/intent-llm 主路径)
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