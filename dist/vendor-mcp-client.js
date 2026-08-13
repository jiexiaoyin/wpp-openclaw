import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { MCP_BASE_URL, MCP_AUTH_TOKEN_ENV, MCP_TIMEOUT_MS, LOG_TAG } from "./core/constants.js";
import { info, warn, error as logError, formatErr } from "./core/logger.js";
import { getDefaultAccountRegistry } from "./account-state.js";
const _conns = new Map();
export function getMcpToken(accountId) {
    if (accountId && accountId !== "default") {
        try {
            const state = getDefaultAccountRegistry().get(accountId);
            const authcodeEnv = state?.config.authcodeEnv || "WECHATPRO_AUTHCODE";
            return process.env[authcodeEnv] ?? null;
        }
        catch {
            return process.env[MCP_AUTH_TOKEN_ENV] ?? null;
        }
    }
    return process.env[MCP_AUTH_TOKEN_ENV] ?? null;
}
export async function connectMcpClient(accountId) {
    const token = getMcpToken(accountId);
    if (!token) {
        warn(`${LOG_TAG} [VENDOR-MCP] connect skipped: no authcode for account=${accountId ?? "default"}`);
        return false;
    }
    const key = accountId ?? "default";
    const existing = _conns.get(key);
    if (existing?.client && existing?.transport && Date.now() - existing.connectedAt < 5 * 60 * 1000) {
        return true;
    }
    if (existing?.connectPromise)
        return existing.connectPromise;
    const entry = { client: null, transport: null, token, connectedAt: 0, connectPromise: null };
    _conns.set(key, entry);
    entry.connectPromise = (async () => {
        try {
            if (entry.transport) {
                try {
                    await entry.transport.close();
                }
                catch { }
            }
            if (entry.client) {
                try {
                    await entry.client.close();
                }
                catch { }
            }
            const transport = new StreamableHTTPClientTransport(new URL(MCP_BASE_URL), {
                requestInit: {
                    headers: {
                        Authorization: `Bearer ${entry.token}`,
                        "Content-Type": "application/json",
                    },
                },
            });
            const client = new Client({ name: "wechatpadpro", version: "1.2.0" });
            let timeoutId;
            try {
                await Promise.race([
                    client.connect(transport),
                    new Promise((_, reject) => {
                        timeoutId = setTimeout(() => reject(new Error("mcp connect timeout")), MCP_TIMEOUT_MS);
                    }),
                ]);
            }
            finally {
                if (timeoutId)
                    clearTimeout(timeoutId);
            }
            entry.client = client;
            entry.transport = transport;
            entry.connectedAt = Date.now();
            info(`${LOG_TAG} [VENDOR-MCP] connected: url=${MCP_BASE_URL} account=${key}`);
            return true;
        }
        catch (e) {
            logError(`${LOG_TAG} [VENDOR-MCP] connect failed: ${formatErr(e)}`, { url: MCP_BASE_URL, account: key });
            entry.client = null;
            entry.transport = null;
            return false;
        }
        finally {
            entry.connectPromise = null;
        }
    })();
    return entry.connectPromise;
}
export async function callMcpTool(name, args = {}, accountId) {
    const key = accountId ?? "default";
    const ok = await connectMcpClient(key);
    const conn = _conns.get(key);
    if (!ok || !conn?.client)
        return null;
    try {
        const result = await conn.client.callTool({
            name,
            arguments: args,
        }, undefined, { timeout: MCP_TIMEOUT_MS });
        info(`${LOG_TAG} [VENDOR-MCP] callTool ok: ${name} account=${key} args=${JSON.stringify(args).slice(0, 100)}`);
        return result;
    }
    catch (e) {
        warn(`${LOG_TAG} [VENDOR-MCP] callTool failed: ${name} account=${key} ${formatErr(e)}`, { tool: name });
        return null;
    }
}
export async function listMcpTools(accountId) {
    const key = accountId ?? "default";
    const ok = await connectMcpClient(key);
    const conn = _conns.get(key);
    if (!ok || !conn?.client)
        return null;
    try {
        const tools = await conn.client.listTools();
        return tools.tools.map((t) => t.name);
    }
    catch (e) {
        warn(`${LOG_TAG} [VENDOR-MCP] listTools failed: ${formatErr(e)}`);
        return null;
    }
}
export async function disconnectMcpClient() {
    for (const [key, conn] of _conns) {
        if (conn.transport) {
            try {
                await conn.transport.close();
            }
            catch (e) {
                warn(`${LOG_TAG} [VENDOR-MCP] disconnect warn (${key}): ${formatErr(e)}`);
            }
        }
    }
    _conns.clear();
    info(`${LOG_TAG} [VENDOR-MCP] disconnected all (${_conns.size} remaining)`);
}
export async function resolveFileViaMcp(localId, filename, accountId) {
    const recent = await callMcpTool("wechat_get_recent_messages", { limit: 500 }, accountId);
    if (!recent) {
        warn(`${LOG_TAG} [VENDOR-MCP] resolveFileViaMcp: get_recent_messages null (fallback)`);
        return null;
    }
    let messages = [];
    let isError = false;
    try {
        const result = recent ?? {};
        isError = result.isError === true;
        const blocks = result.content ?? [];
        for (const block of blocks) {
            if (block?.text) {
                const parsed = JSON.parse(block.text);
                if (Array.isArray(parsed))
                    messages = messages.concat(parsed);
                else if (parsed?.messages && Array.isArray(parsed.messages))
                    messages = messages.concat(parsed.messages);
            }
        }
    }
    catch (e) {
        warn(`${LOG_TAG} [VENDOR-MCP] resolveFileViaMcp: parse recent messages failed: ${formatErr(e)}`);
        return null;
    }
    if (isError) {
        warn(`${LOG_TAG} [VENDOR-MCP] resolveFileViaMcp: MCP isError=true (可能 mcp_realtime_forbidden)`);
        return null;
    }
    const target = messages.find((m) => String(m.local_id) === String(localId) || String(m.content ?? "").includes(filename));
    if (!target) {
        warn(`${LOG_TAG} [VENDOR-MCP] resolveFileViaMcp: msg not found localId=${localId} filename=${filename}`);
        return null;
    }
    info(`${LOG_TAG} [VENDOR-MCP] resolveFileViaMcp: found msg localId=${localId} payload=${JSON.stringify(target).slice(0, 200)}`);
    const rawContent = String(target.content ?? "");
    const cdnUrl = (typeof target.cdnUrl === "string" && target.cdnUrl) ||
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
function extractHttpUrl(content) {
    const m = content.match(/https?:\/\/[^\s"'<>]+/);
    return m ? m[0] : null;
}
