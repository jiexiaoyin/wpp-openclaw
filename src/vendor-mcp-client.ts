// src/vendor-mcp-client.ts - vendor MCP 客户端封装 (v1.2.0 新增)
// 背景: 老板 2026-08-09 发现 vendor 提供 MCP 端点 (127.0.0.1:8062/mcp),
//       它暴露 7 只读工具 (wechat_get_recent_messages 等) + 6 可写 (需 mcp:write, 当前关)。
// 用途: v1 schema 文件消息 (只拿 filename, 无 CDN URL) → 通过 wechat_get_recent_messages
//       拿 vendor 视角的完整 payload, 看是否含 CDN URL / 下载凭证, 再走 OSS 上传 → AI 读到文件。
//
// 鉴权: Authorization: Bearer <token> (实测 = WECHATPRO_AUTHCODE, 不是 TokenKey)
// 会话: StreamableHTTP 用 Set-Cookie (SDK transport 自动处理)
// 安全: 只调 7 只读工具, 不碰写 (mcp_write_enabled=false, 且无调用路径)

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { MCP_BASE_URL, MCP_AUTH_TOKEN_ENV, MCP_TIMEOUT_MS, LOG_TAG } from "./core/constants.js";
import { info, warn, error as logError, formatErr } from "./core/logger.js";
import { getDefaultAccountRegistry } from "./account-state.js";

// ============ 模块级单例 (lazy init) ============
// v1.3.60 MCP-MULTIACCOUNT (2026-08-13): 多账号适配 — 连接按 accountId 隔离。
//   token 从账号 config.authcodeEnv 解析 (每账号独立 authcode env), 连接 Map key=accountId。
//   单账号 (default) 行为不变 (用 WECHATPRO_AUTHCODE)。

interface McpConn {
  client: Client;
  transport: StreamableHTTPClientTransport;
  token: string;
  connectedAt: number;
  connectPromise: Promise<boolean> | null;
}
const _conns = new Map<string, McpConn>();

/**
 * 解析指定账号的 MCP token (Bearer authcode)。
 * 多账号: 账号 config.authcodeEnv → env 值; 单账号/default: WECHATPRO_AUTHCODE。
 */
export function getMcpToken(accountId?: string): string | null {
  if (accountId && accountId !== "default") {
    try {
      const state = getDefaultAccountRegistry().get(accountId);
      const authcodeEnv = state?.config.authcodeEnv || "WECHATPRO_AUTHCODE";
      return process.env[authcodeEnv] ?? null;
    } catch {
      return process.env[MCP_AUTH_TOKEN_ENV] ?? null;
    }
  }
  return process.env[MCP_AUTH_TOKEN_ENV] ?? null;
}

/**
 * 连接 vendor MCP (幂等, 并发安全, per-account)。
 * 失败不抛 — 返回 false, 调用方走 fallback (不卡主链路)。
 */
export async function connectMcpClient(accountId?: string): Promise<boolean> {
  const token = getMcpToken(accountId);
  if (!token) {
    warn(`${LOG_TAG} [VENDOR-MCP] connect skipped: no authcode for account=${accountId ?? "default"}`);
    return false;
  }
  const key = accountId ?? "default";
  const existing = _conns.get(key);
  // 已连接且 5 分钟内 → 直接 true
  if (existing?.client && existing?.transport && Date.now() - existing.connectedAt < 5 * 60 * 1000) {
    return true;
  }
  // 并发连接去重
  if (existing?.connectPromise) return existing.connectPromise;

  const entry: McpConn = { client: null as never, transport: null as never, token, connectedAt: 0, connectPromise: null };
  _conns.set(key, entry);
  entry.connectPromise = (async () => {
    try {
      // v1.2.1 P2-fix: 重连前 close 旧 transport (防 SSE 连接每 5 分钟泄漏)
      if (entry.transport) {
        try { await entry.transport.close(); } catch { /* ignore */ }
      }
      if (entry.client) {
        try { await entry.client.close(); } catch { /* ignore */ }
      }
      const transport = new StreamableHTTPClientTransport(
        new URL(MCP_BASE_URL),
        {
          requestInit: {
            headers: {
              Authorization: `Bearer ${entry.token}`,
              "Content-Type": "application/json",
            },
            // 注: SDK 内部覆盖 signal (requestInit.signal 死代码), 用下方 Promise.race 硬超时
          },
        },
      );
      const client = new Client({ name: "wechatpadpro", version: "1.2.0" });
      // v1.2.1 P2-fix: 连接也加 5s 硬超时 (Promise.race, 防 vendor 接受但挂住)
      // v1.3.59 P0-3: 保存 timer 引用 + clearTimeout, 防 timer 泄漏 (否则 --test-force-exit 杀测试)
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          client.connect(transport),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error("mcp connect timeout")), MCP_TIMEOUT_MS);
          }),
        ]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
      entry.client = client;
      entry.transport = transport;
      entry.connectedAt = Date.now();
      info(`${LOG_TAG} [VENDOR-MCP] connected: url=${MCP_BASE_URL} account=${key}`);
      return true;
    } catch (e) {
      logError(`${LOG_TAG} [VENDOR-MCP] connect failed: ${formatErr(e)}`, { url: MCP_BASE_URL, account: key });
      entry.client = null as never;
      entry.transport = null as never;
      return false;
    } finally {
      entry.connectPromise = null;
    }
  })();
  return entry.connectPromise;
}

/**
 * 调 vendor MCP 工具。失败不抛 → 返回 null, 调用方 fallback。
 * v1.3.60: accountId 参数 — 多账号下用对应账号的 MCP 连接/token。
 */
export async function callMcpTool(
  name: string,
  args: Record<string, unknown> = {},
  accountId?: string,
): Promise<unknown | null> {
  const key = accountId ?? "default";
  const ok = await connectMcpClient(key);
  const conn = _conns.get(key);
  if (!ok || !conn?.client) return null;
  try {
    const result = await conn.client.callTool({
      name,
      arguments: args,
    }, undefined, { timeout: MCP_TIMEOUT_MS });
    info(`${LOG_TAG} [VENDOR-MCP] callTool ok: ${name} account=${key} args=${JSON.stringify(args).slice(0, 100)}`);
    return result;
  } catch (e) {
    warn(`${LOG_TAG} [VENDOR-MCP] callTool failed: ${name} account=${key} ${formatErr(e)}`, { tool: name });
    return null;
  }
}

/** 获取 vendor MCP 工具列表 (诊断用) */
export async function listMcpTools(accountId?: string): Promise<string[] | null> {
  const key = accountId ?? "default";
  const ok = await connectMcpClient(key);
  const conn = _conns.get(key);
  if (!ok || !conn?.client) return null;
  try {
    const tools = await conn.client.listTools();
    return tools.tools.map((t) => t.name);
  } catch (e) {
    warn(`${LOG_TAG} [VENDOR-MCP] listTools failed: ${formatErr(e)}`);
    return null;
  }
}

/** 断开 MCP (shutdown 时调用, 全部账号) */
export async function disconnectMcpClient(): Promise<void> {
  for (const [key, conn] of _conns) {
    if (conn.transport) {
      try {
        await conn.transport.close();
      } catch (e) {
        warn(`${LOG_TAG} [VENDOR-MCP] disconnect warn (${key}): ${formatErr(e)}`);
      }
    }
  }
  _conns.clear();
  info(`${LOG_TAG} [VENDOR-MCP] disconnected all (${_conns.size} remaining)`);
}

// ============ 文件下载增强 (MCP 视角) ============

/**
 * v1 schema 文件消息 → 用 MCP 的 wechat_get_recent_messages 拿完整 payload,
 * 解析是否含 CDN URL / 下载凭证。拿不到返回 null (调用方走确定性回复兜底)。
 * (v1.2.1 P2-fix: 改名为 resolveFileViaMcp 避免与 media-enrich 同名混淆; 多 block 累积 + isError 识别)
 *
 * @param localId 文件消息的 local_id (vendor 内部 id)
 * @param filename 文件名 (日志用)
 */
export async function resolveFileViaMcp(
  localId: number,
  filename: string,
  accountId?: string,
): Promise<{ cdnUrl: string; originContent: string } | null> {
  // v1.3.60 MULTI-ACCOUNT: 传 accountId → 用对应账号的 MCP 连接/token
  const recent = await callMcpTool("wechat_get_recent_messages", { limit: 500 }, accountId);
  if (!recent) {
    warn(`${LOG_TAG} [VENDOR-MCP] resolveFileViaMcp: get_recent_messages null (fallback)`);
    return null;
  }
  // 解析 result → 消息数组 (v1.2.1: 多 block 累积, 识别 isError, 不覆盖)
  let messages: Array<Record<string, unknown>> = [];
  let isError = false;
  try {
    const result = (recent as { content?: Array<{ text?: string }>; isError?: boolean }) ?? {};
    isError = result.isError === true;
    const blocks = result.content ?? [];
    for (const block of blocks) {
      if (block?.text) {
        const parsed = JSON.parse(block.text);
        if (Array.isArray(parsed)) messages = messages.concat(parsed);
        else if (parsed?.messages && Array.isArray(parsed.messages)) messages = messages.concat(parsed.messages);
      }
    }
  } catch (e) {
    warn(`${LOG_TAG} [VENDOR-MCP] resolveFileViaMcp: parse recent messages failed: ${formatErr(e)}`);
    return null;
  }
  if (isError) {
    warn(`${LOG_TAG} [VENDOR-MCP] resolveFileViaMcp: MCP isError=true (可能 mcp_realtime_forbidden)`);
    return null;
  }

  const target = messages.find(
    (m) => String(m.local_id) === String(localId) || String(m.content ?? "").includes(filename),
  );
  if (!target) {
    warn(`${LOG_TAG} [VENDOR-MCP] resolveFileViaMcp: msg not found localId=${localId} filename=${filename}`);
    return null;
  }
  info(`${LOG_TAG} [VENDOR-MCP] resolveFileViaMcp: found msg localId=${localId} payload=${JSON.stringify(target).slice(0, 200)}`);

  const rawContent = String(target.content ?? "");
  const cdnUrl =
    (typeof target.cdnUrl === "string" && target.cdnUrl) ||
    (typeof target.cdn_url === "string" && target.cdn_url) ||
    (typeof target.fileUrl === "string" && target.fileUrl) ||
    (typeof target.file_url === "string" && target.file_url) ||
    extractHttpUrl(rawContent);
  if (cdnUrl) {
    info(`${LOG_TAG} [VENDOR-MCP] resolveFileViaMcp: got CDN URL: ${cdnUrl.slice(0, 80)}`);
    return { cdnUrl, originContent: rawContent };
  }
  warn(`${LOG_TAG} [VENDOR-MCP] resolveFileViaMcp: no CDN URL in payload localId=${localId}`);
  return null;
}

/** 从 content 提取 HTTP(S) URL (CDN 地址常见于 content 里的 URL) */
function extractHttpUrl(content: string): string | null {
  const m = content.match(/https?:\/\/[^\s"'<>]+/);
  return m ? m[0] : null;
}
