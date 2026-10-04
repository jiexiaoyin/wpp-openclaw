// channel-contract.ts — wppChannelContract (channel 运行时契约对象) 外提
// 2026-09-28 从 index.ts 外提 (原 L939-1459, 522 行): index.ts 已 1587 行, 契约对象独占三分之一。
//
// 依赖注入 (避免循环依赖):
//   契约块闭包引用了 3 个 index.ts **自有**函数 (resolveOutboundAccount / startAccountById /
//   inferFileNameForMedia)。若本文件直接 import index.ts, 而 index.ts 又 import 本文件 → **成环**。
//   故这 3 个符号走 ChannelContractDeps 注入; 其余依赖 (log / CHANNEL_ID / dispatchSendText /
//   AGENT_TOOLS / setChannelRuntime / setOpenClawConfig / getDefaultAccountRegistry / formatErr)
//   本文件直接 import —— 它们是叶子模块, 不反向依赖 index.ts。
//
// 因此: **本文件不 import index.ts** (含 import type), 运行时与类型上都不存在环。
// 对外 API 零变化: index.ts 仍导出 wppChannelPlugin = Object.assign(contract, legacyApi)。
//
// 注: wppOutboundLegacyApi (原 index.ts L859-870) 一并外提到本文件 —— 它是**非导出**的私有
//   const, 且**唯一**消费点就是契约块的 `outbound: Object.assign({...}, wppOutboundLegacyApi)`
//   (原 L1106)。留在 index.ts 会因 noUnusedLocals 报未使用, 且本文件无从引用 (只能再注入)。
//   它零导出面 ⇒ 搬移不改变任何对外 API。
import { logObj as log, formatErr } from "./core/logger.js";
import { CHANNEL_ID, DEFAULT_ACCOUNT_ID } from "./core/constants.js";
// v1.15.1: doctor 抑制钩子要读账号文件里的群白名单 -> 复用 config.ts 的**同一**归一函数
//   (单一收口: 逗号串/数组两种磁盘形态在这里都是"有名单")。config.ts 不反向 import 本文件, 无环。
import { coerceStringArrayList } from "./config.js";
import { getDefaultAccountRegistry } from "./account-state.js";
import { listAccountIds as helperListAccountIds, resolveAccount, defaultAccountId, isConfigured as helperIsConfigured, unconfiguredReason, describeAccount, } from "./config-helpers.js";
import { sendText as dispatchSendText, sendImage as dispatchSendImage } from "./dispatch/outbound.js";
import { AGENT_TOOLS } from "./dispatch/agent-tools/index.js";
import { setChannelRuntime, setOpenClawConfig } from "./dispatch/dispatcher.js";
// ============================================================
// 2026-09-28 契约对齐 (S8): 原对象字面量里混着 **9 个非契约成员**
//   (name / version / kind / start / stop / sendText / sendImage / sendMessage / buildSessionKey)
//   以及嵌套在 outbound 下的 1 个非契约成员 (sendImage)。
//   `satisfies ChannelPlugin` 对**新鲜对象字面量**做 excess-property 检查 ⇒ 这些成员必须先移出。
//
// 处置 = 方案 (a)+(c) 的组合: **移出为独立 export**, 再用 Object.assign 合并回去。
//   - 仓内对这 9 个成员**零调用点** (全仓 src/ + tests/ grep 命中均为注释/定义处);
//     openclaw 2026.9.6 也**完全不读不调** (证据见下)。
//   - 但「openclaw 2026.7.1 ~ 2026.9.5 是否调用 plugin.start/stop/sendText」**未经验证** ⇒
//     直接删除、或只移出不挂回, 都可能在更老框架上丢掉启动/收发入口 (与"不弱化连接/收发"冲突)。
//   - 故: 契约面走受检字面量, 历史面走独立 export, Object.assign 合回 →
//     **运行时对象成员集合与改动前完全一致** (零行为变化), 且全程无 as any / @ts-expect-error / 断言。
//   - 若确认部署目标只有 2026.9.6, 后续可把 wppChannelLegacyApi 从合并里摘掉 (纯减法)。
//
// 证据 (openclaw 2026.9.6 dist):
//   - 生命周期走 plugin.gateway.startAccount / stopAccount
//     (server-channels-D1JRZ19m.mjs:409-410, 590-595), **不调** plugin.start / plugin.stop。
//   - outbound 只调 sendText / sendMedia (channel-outbound-c-7621zH.mjs:161-176);
//     全 dist `sendImage` 仅 3 处且都是 Telegram 内部 sendImageAsPhoto,
//     契约 ChannelOutboundAdapter 亦无该成员。
//   - buildSessionKey 全 dist 0 命中。
// ============================================================
/**
 * outbound 下的历史方法 (非契约; 保留运行时以兼容更老框架 —— 见上方 S8 说明)。
 * 它是**工厂函数**: 唯一外部依赖 resolveOutboundAccount 来自 deps, 模块级 const 拿不到它
 * (那会造成对本文件注入参数的隐式全局引用)。改成接收 deps 的工厂, 在 createChannelContract
 * 内部调用 —— 语义与原来逐字一致 (原来在 index.ts 里也是闭包取外层函数)。
 */
function makeWppOutboundLegacyApi(resolveOutboundAccount) {
    return {
        async sendImage(opts) {
            const r = await dispatchSendImage(resolveOutboundAccount(opts.accountId, "sendImage"), opts.to, opts.imageUrl);
            return {
                ok: r.ok, error: r.error,
                msgId: r.msgId, newMsgId: r.newMsgId, createTime: r.createTime,
                messageId: r.newMsgId ?? (r.msgId != null ? String(r.msgId) : ""),
                chatId: opts.to,
                roomId: opts.to.includes("@chatroom") ? opts.to : undefined,
            };
        },
    };
}
export function createChannelContract(deps) {
    const { startAccountById, resolveOutboundAccount, inferFileNameForMedia } = deps;
    const wppOutboundLegacyApi = makeWppOutboundLegacyApi(resolveOutboundAccount);
    /** 受 `satisfies ChannelPlugin` 检查的契约对象 (excess 字段已全部移出, 见上方 S8 说明) */
    const wppChannelContract = {
        id: CHANNEL_ID,
        // 注入 agentTools 供 OpenClaw 框架读取 (配合 api/client.ts 空凭证兑底 → 工具真正可调)
        agentTools: AGENT_TOOLS,
        // ============================================================
        // v1.3.43 OUTBOUND-RUNTIME (2026-08-12 接总立 P1, 修复 cron announce delivery 永久错误)
        //
        // 根因: framework 找 channel outbound adapter 的判定 (channel-resolution-7UuTfW1_.js:56)
        //   messageAdapterCanSendText: typeof plugin?.message?.send?.text === "function" → 否则 throw "Outbound not configured for channel: X"
        // WPP 之前没 register outbound, 监控层错报 permanent error → cron 累计失败通知 (例: 8-12 07:50 晨报任务失败 2 次)
        // 消息实际由 OUTBOUND-PERSIST (v1.3.16) 已真送达, 但 delivery-recovery 判 permanent error (跟 7-24 同类)
        //
        // 修复: 仿 GeWe v1.4.4 范式 (gewe-multi-agent/src/index.ts:231), 加 outbound 字段
        //   - deliveryMode: "direct" (framework 直接调 wppSendText, 跟 WPP 历史 inbound/outbound 路径一致)
        //   - sendText/sendImage 直接调 dispatch/outbound.ts (复用现成 sendText → 同一个 mediaPersist 路径)
        //
        // 不动 wppChannelPlugin.sendText/sendImage/sendMessage (历史 inbound/outbound 都在调, 不能破坏)
        // 不动 gateway.startAccount (v1.1.14 已修 inbound dispatcher 的 channelRuntime 注入)
        // 最小可行版: 只 sendText + sendImage + deliveryMode, 跑通再说; chunker/normalizePayload/resolveTarget 后补
        // Object.assign = 把非契约的 outbound.sendImage 合回 (运行时与改动前一致)。
        //   返回的是交叉类型 (非新鲜字面量) ⇒ 不触发 excess-property 检查; 无任何断言。
        outbound: Object.assign({
            deliveryMode: "direct",
            // v1.3.46 IDENTITY-RETURN (2026-08-12 接总立 P1, 修复 framework hasDeliveryResultIdentity 报
            //   "adapter_returned_no_identity" → payload outcome: suppressed → message 工具看似 ok 但实际没发)
            //
            // 根因 SSOT (framework deliver-BdKtkX_b.js:hasDeliveryResultIdentity):
            //   function hasDeliveryResultIdentity(result) {
            //     return Boolean(result.messageId || result.chatId || result.channelId || result.roomId
            //                  || result.conversationId || result.toJid || result.pollId);
            //   }
            // 8-12 09:37 实证 (v1.3.45 deploy 后): main agent 调 message 工具 → framework 走 plugin.outbound.sendMedia
            //   → WPP v1.3.45 sendMedia 返 { ok: false, error: 'account not found: default', msgId: undefined }
            //   → 没 messageId / chatId / roomId 任何 identity 字段 → 返 adapter_returned_no_identity
            //   → payload outcome: suppressed (老板群里实际看不到)
            //
            // 修复: 所有 outbound.* 函数返值统一加 framework 期望的 identity 字段:
            //   - messageId: 兼容 vendor 返的 msgId/newMsgId (任一存在即 OK, 仿 framework normalize 行为)
            //   - chatId / roomId: 群 ID (to 字段, 群时返, 私聊时也返 [同一字段])
            //   - ok/error: 保留 (调用方检测错误用)
            //   - msgId: 保留 (内部调用方兼容)
            //
            // 不动现有功能 (sendText/sendImage/sendMedia 行为保持)
            // 仿 GeWe v1.4.4 范式 (gewe-multi-agent/src/index.ts:231 完整 outbound 字段定义)
            // 2026-09-28 契约对齐 (E2): 契约签名 `(ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>`。
            //   - 入参 accountId 放宽为 `string | null` (契约如此; 实现走 resolveOutboundAccount 的 falsy 兜底)
            //   - 返回值补**必填** `channel`; `messageId` 由 `string | undefined` 收紧为 `string`
            //     (缺失时用 "" —— 空串在框架 hasDeliveryResultIdentity 里与 undefined 同为 falsy,
            //      故不会凭空制造投递身份; chatId/roomId 仍照旧兜底)
            async sendText(opts) {
                const r = await dispatchSendText(resolveOutboundAccount(opts.accountId, "sendText"), opts.to, opts.text, opts.ats);
                return {
                    ok: r.ok, error: r.error,
                    msgId: r.msgId, newMsgId: r.newMsgId, createTime: r.createTime,
                    // v1.3.46 + 2026-09-28 identity 字段 (契约必填 channel/messageId):
                    channel: CHANNEL_ID,
                    messageId: r.newMsgId ?? (r.msgId != null ? String(r.msgId) : ""),
                    chatId: opts.to,
                    roomId: opts.to.includes("@chatroom") ? opts.to : undefined,
                };
            },
            // 注: 原 outbound.sendImage 是非契约成员, 已移出为 wppOutboundLegacyApi (见上方 S8 说明),
            //     并由本对象外层 Object.assign 在**运行时**合回 —— 行为与改动前一致。
            // ============================================================
            // v1.3.44 SENDMEDIA (2026-08-12 接总立 P1, 修复 cron 晨报图片降级为文件卡片)
            //
            // 根因: framework deliver.js:1471 检测 plugin.outbound.sendMedia 不存在 →
            //   "Plugin outbound adapter does not implement sendMedia; media URLs will be dropped and text fallback will be used"
            // 8-12 09:05 晨报任务实证: AI 调 message 工具带 attachments=[{type:image}] → framework 调 sendMedia → WPP v1.3.43 没实现
            //   → media dropped + AI 降级用 sendFile (变成文件下载卡片, 不是直接展示图片)
            //
            // 修复: 仿 GeWe v1.4.4 范式 (gewe-multi-agent/src/index.ts:231 + dispatch/outbound.ts:134),
            //   outbound 字段加 sendMedia, 按 mediaType/url 后缀路由到 WPP 统一 sendMessage 入口
            //   (v1.3.17 MESSAGE-UNIFY 已统一 image/video/voice/file/link/card/location/miniprogram/emoji)
            //
            // 不动现有 outbound.sendText/sendImage (v1.3.43 修复保持)
            // 不动 wppChannelPlugin.sendText/sendImage/sendMessage (历史 inbound/outbound 都在调)
            //
            // framework sendMedia ctx (deliver.js:1454):
            //   { kind: "media", text: caption, mediaUrl, cfg, to, accountId, replyToId, threadId, formatting, ... }
            // WPP 暂不支持 replyToId/threadId (WPP outbound.ts sendText/sendImage 不支持 replyTo, 后续 P3 补)
            // 2026-09-28 契约对齐 (E3):
            //   - accountId: `string` → `string | null` (契约 ChannelOutboundContext.accountId)
            //   - mediaUrl:   `string` → `string | undefined` (**契约里 mediaUrl 是可选的**, outbound.types:82)
            //   - 返回值补必填 `channel` + `messageId` 收紧为 `string` (同 E2)
            //   - 运行时防御: 旧实现 `opts.mediaUrl.split("?")` 在 mediaUrl 缺省时会抛 TypeError。
            //     契约既然允许缺省, 就**不能崩**: 空 mediaUrl 直接返回结构化失败 (不发空媒体)。
            //     这是把既有潜在崩溃改成显式失败, 正常路径 (mediaUrl 存在) 逐字不变。
            async sendMedia(opts) {
                const { sendMessage: dispatchSendMessage } = await import("./dispatch/send-message.js");
                const accountId = resolveOutboundAccount(opts.accountId, "sendMedia");
                const mediaUrl = opts.mediaUrl ?? "";
                if (!mediaUrl) {
                    log.warn(`outbound.sendMedia: mediaUrl missing (to=${opts.to}) — 拒绝发送空媒体 (契约允许 mediaUrl 缺省)`);
                    return {
                        ok: false,
                        error: "sendMedia: mediaUrl is required",
                        channel: CHANNEL_ID,
                        messageId: "",
                        chatId: opts.to,
                        roomId: opts.to.includes("@chatroom") ? opts.to : undefined,
                    };
                }
                // 按 mediaType 优先; 没传则按 url 后缀推断
                const urlNoQuery = (mediaUrl.split("?")[0] ?? "").toLowerCase();
                const inferred = /\.(jpg|jpeg|png|gif|webp|bmp|ico|tiff)$/i.test(urlNoQuery) ? "image" :
                    /\.(mp4|mov|avi|mkv|webm|3gp)$/i.test(urlNoQuery) ? "video" :
                        /\.(mp3|wav|ogg|flac|m4a|silk|amr)$/i.test(urlNoQuery) ? "voice" :
                            "file";
                const type = opts.mediaType ?? inferred;
                // ============================================================
                // v1.3.47 FILENAME-FALLBACK (2026-08-12 接总立 P1, 修复 framework ctx 不传 fileName → vendor sendFile 拿到空名 → 老板手机显示 "file" 无后缀)
                //
                // 根因: framework deliver.js:createChannelHandler 调 plugin.outbound.sendMedia(caption, mediaUrl, overrides),
                //   ctx 只含 { kind: "media", text, mediaUrl, ...baseCtx }, 没有 fileName / attachments 字段
                //   → WPP plugin v1.3.44 sendMedia 调 dispatchSendMessage({type, content: mediaUrl, fileName: undefined})
                //   → resolveMediaFromAttachments 拿不到 att.name (undefined) → attName = "" → vendor sendFile 拿空名
                //   → 老板手机看到“文件”卡片但文件名是空的 “file” (无后缀)
                // 8-12 09:56 实证: AI 调 message 工具 attachments=[{type:"file", name:"test-message-log.txt", media:"https://...test-message-log.txt"}]
                //   → 老板手机看不到 .txt 后缀
                //
                // 修复: 从 mediaUrl basename 推 fileName 兑底 (仿 gewe v1.4.4 resolveMediaFromAttachment 逻辑)。
                //   优先级: opts.fileName > URL basename > "" (保持兼容)
                //   仍然允许调用方传 fileName 覆盖 (未来 framework 支持 attachments 传递后可直接覆盖)
                //
                // 不动现有 framework ctx 接口 (让 plugin 兼容 framework 不传 fileName 的现状)。
                // 不动现有 sendMedia 类型推断 (v1.3.44 修复保持)。
                // ============================================================
                const fileName = inferFileNameForMedia(mediaUrl, opts.fileName);
                // 走 WPP 统一 sendMessage 入口 (v1.3.17 MESSAGE-UNIFY 已统一所有 type 路由 + persist + oss)
                const r = await dispatchSendMessage({
                    accountId,
                    toWxid: opts.to,
                    type,
                    content: mediaUrl,
                    fileName, // v1.3.47: 传 fileName 给 dispatchSendMessage → vendor sendFile(toWxid, mediaUrl, fileName)
                });
                return {
                    ok: r.ok, error: r.error,
                    msgId: r.msgId, newMsgId: r.newMsgId, createTime: r.createTime,
                    // v1.3.46 + 2026-09-28 identity 字段 (契约必填 channel/messageId):
                    channel: CHANNEL_ID,
                    messageId: r.newMsgId ?? (r.msgId != null ? String(r.msgId) : ""),
                    chatId: opts.to,
                    roomId: opts.to.includes("@chatroom") ? opts.to : undefined,
                };
            },
        }, wppOutboundLegacyApi), // ← 合回非契约的 outbound.sendImage (见上方 S8 说明)
        // ============================================================
        // v1.3.45 MESSAGING-TARGET-RESOLVER (2026-08-12 接总立 P1,
        //   修复 cron/AI 调 message 工具 + attachments type=image → framework 报
        //   "Unknown target xxxxxxxx@chatroom for WeChatPadPro")
        //
        // 根因 SSOT (framework target-normalization-Cp3RZ0Yv.js):
        //   1. framework resolveNormalizedTargetInput 调 plugin.messaging?.normalizeTarget
        //      → WPP 没定义 → fallback 到 normalizeOptionalString (trim)
        //   2. framework looksLikeTargetId 默认规则: 只识别 channel:/group:/user: 前缀,
        //      @开头 但仅 @thread 格式 (e.g. 123@thread), +86xxx 数字 ID
        //      → "xxxxxxxx@chatroom" 不命中任何一条 (chatroom 后缀不在框架默认白名单)
        //      → looksLikeTargetId 返 false → framework 不调 plugin resolver
        //      → framework 直接抛 unknownTargetError("Unknown target X for WeChatPadPro")
        //
        // 实证:
        //   - 8-12 09:05 09:05 cron session 调 message 工具带 attachments type=image
        //     → 同样错, AI 才降级用 sendFile (变成文件下载卡片)
        //   - 8-12 09:33 main agent 调 message 工具带 attachments type=image
        //     → 同样错, owner 上报 (本次会话)
        //
        // 修复: 仿 GeWe v1.4.4 范式 (gewe-multi-agent/src/index.ts:channelPlugin.messaging),
        //   在 wppChannelPlugin 加 messaging 字段:
        //     - targetResolver.resolveTarget: 接收任何微信 ID/wxid/groupID, 直接 to: input
        //     - targetResolver.looksLikeId: 识别 @chatroom 后缀 / wxid_xxx / 数字+@chatroom
        //
        // 不动现有 outbound (v1.3.43 + v1.3.44 保持)
        // 不动现有 gateway/config/meta/capabilities (历史路径)
        messaging: {
            targetResolver: {
                hint: "WeChat wxid (e.g. wxid_xxx / xxxxxxxx@chatroom)",
                /**
                 * 接收任意微信目标格式, 直接返回 (后续 plugin.outbound 知道怎么发).
                 * 框架会调 resolveTarget 后再用返回值 (.to) 去调 outbound.sendText / sendImage / sendMedia.
                 */
                async resolveTarget({ input }) {
                    const trimmed = String(input ?? "").trim();
                    if (!trimmed)
                        return null;
                    // 不解析 (转发给 plugin.outbound.* 统一处理)
                    return { to: trimmed, kind: "channel", source: "normalized" };
                },
                /**
                 * 识别 input 是不是像 wxid/群 ID:
                 *   - 包含 @chatroom / @thread 后缀 → 群
                 *   - wxid_ 开头 → wxid
                 *   - q + 数字 (老板主号 / 营销号常见) → wxid
                 *   - 纯字母数字 (>=6 位) → wxid
                 */
                looksLikeId(rawInput, normalizedInput) {
                    const s = (normalizedInput ?? rawInput ?? "").trim();
                    if (!s)
                        return false;
                    if (s.includes("@chatroom"))
                        return true;
                    if (s.includes("@thread"))
                        return true;
                    if (s.startsWith("wxid_"))
                        return true;
                    if (/^q\d{6,}$/.test(s))
                        return true;
                    if (/^[a-z][a-z0-9_]{5,}$/i.test(s))
                        return true;
                    return false;
                },
            },
        },
        // OpenClaw channel config helpers (UI/诊断用; helper* 是 config-helpers.ts 版本, 避免与 config.ts 命名冲突)
        config: {
            listAccountIds: helperListAccountIds,
            resolveAccount,
            defaultAccountId,
            isConfigured: helperIsConfigured,
            unconfiguredReason,
            describeAccount,
        },
        // OpenClaw channel meta (UI / 文档 / 启动向导显示)
        meta: {
            id: CHANNEL_ID,
            label: "WeChatPadPro",
            selectionLabel: "WeChatPadPro (微信 Pad 协议 v1.0)",
            docsPath: `/channels/${CHANNEL_ID}`,
            docsLabel: "WeChatPadPro 文档",
            blurb: "WeChatPadPro (微信 Pad 协议 HTTP API) OpenClaw channel plugin. AccountRegistry class 多账号管理.",
            aliases: ["wpp", "wechatpadpro"],
            quickstartAllowFrom: true,
        },
        // OpenClaw channel capabilities (路由决策 feature flags)
        capabilities: {
            chatTypes: ["direct", "group"],
            reactions: false,
            threads: false,
            media: true, // 图片/语音/视频支持
            nativeCommands: false,
            blockStreaming: false,
        },
        // ============================================================
        // v1.5.5 CHANNEL-UI-RELOAD (2026-09-10 老板: Channel 页保存 → 即时热生效不掉线)
        //
        // 网关 config-reload-plan 按**插件自声明**的 reload 规则决定保存后重启范围:
        //   - 只声明 noopPrefixes(不声明 configPrefixes!) → channels.wechatpadpro 改动计划 kind="none"
        //     → 网关对该路径**完全不重启 channel runtime**, 微信连接不掉、网关不重启。
        //     唯一 applier = channel-ui-bridge 的 fs.watch openclaw.json → merge accounts/<id>.json
        //     → 既有 watchAccountConfigs 热载引擎 (零重连)。
        //   - 绝不可再叠加 configPrefixes: 同前缀时 configPrefixes(热=重启该 channel)排序在 noop 前获胜,
        //     会把编辑变回整 channel 重启 (=掉线)。
        //   - 不用 accountScopedRestart: extractAccountIdFromPath 对 accountId="default" 返回 null
        //     (特判整 channel 重启), default 账号无法被账号级重启隔离。
        // 2026-09-27 OPENCLAW-STATUS: 接入 OpenClaw 2026.9.6 的 status 契约
        //   背景: 审阅发现插件仅实现 ChannelPlugin 必填 4 项 + 8 个可选项 (共 35 可选;
        //         数字实测自 openclaw 2026.9.6 的 types.plugin-*.d.ts。已实现的 8 项:
        //         reload/outbound/status/gateway/doctor/messaging/directory/agentTools),
        //         status 缺失 -> openclaw status 看不到本 channel 的账号健康度。
        //   数据源: AccountRegistry (get/listIds) + WppAccountState (vendorAuthed/selfWxid/ws/webhook)。
        //   字段语义对齐 ChannelAccountSnapshot (见 OpenClaw types.core)。
        status: {
            defaultRuntime: {
                accountId: "default",
                configured: false,
                running: false,
                connected: false,
            },
            buildAccountSnapshot: ({ account }) => {
                const accountId = account?.accountId ?? "";
                const st = getDefaultAccountRegistry().get(accountId);
                if (!st) {
                    return {
                        accountId,
                        configured: false,
                        running: false,
                        connected: false,
                        statusState: "stopped",
                    };
                }
                const wsUp = Boolean(st.wsClient);
                const webhookUp = Boolean(st.webhookServer);
                const connected = wsUp && webhookUp;
                return {
                    accountId,
                    name: st.selfWxid || accountId,
                    enabled: true,
                    configured: true,
                    running: true,
                    connected,
                    statusState: connected ? "connected" : "degraded",
                    lifecycle: connected ? "ready" : "recovering",
                    lastError: !st.vendorAuthed
                        ? "vendor authcode 未通过"
                        : connected ? null : "ws/webhook 未就绪",
                };
            },
            buildChannelSummary: () => {
                const reg = getDefaultAccountRegistry();
                const ids = reg.listIds();
                let connected = 0;
                for (const id of ids) {
                    const st = reg.get(id);
                    if (st && st.wsClient && st.webhookServer)
                        connected++;
                }
                return { accounts: ids.length, connected, degraded: ids.length - connected };
            },
        },
        // 2026-09-27 OPENCLAW-DIRECTORY: 接入 OpenClaw 2026.9.6 的 directory 契约
        //   背景: 承接 status/doctor 契约接入。directory 缺失 -> OpenClaw 无法识别
        //         本 channel 的身份(self)与群目录(listGroups), Agent 寻址/群枚举受限。
        //   数据源: AccountRegistry (selfWxid 由 setVendorAuth 写入) + 账号群配置 (groupAllowFrom/blacklistGroups)。
        //   本适配器为**只读** (仅 self / listGroups 两个方法), 不改任何状态。
        directory: {
            // 我是谁: 返回本账号的 wxid 身份。Agent 需要知道自己绑的是哪个微信号。
            self: async ({ accountId }) => {
                const reg = getDefaultAccountRegistry();
                const id = accountId || reg.listIds()[0];
                if (!id)
                    return null;
                const st = reg.get(id);
                if (!st)
                    return null;
                const wxid = st.selfWxid || "";
                if (!wxid)
                    return null; // 未登录/vendor 未鉴权 -> 无身份可报, 返回 null 而非空条目
                return {
                    kind: "user",
                    id: wxid,
                    name: st.config?.nickname || wxid,
                    handle: wxid,
                };
            },
            // 群目录: 枚举本账号已知的群 (来源: 账号配置的群白名单 + 黑名单)。
            //   注意: 这是**配置已知**的群, 不是微信侧全量群列表
            //         (全量需 vendor API 拉取, 属运行期动作, 不放入只读目录适配器)。
            listGroups: async ({ accountId }) => {
                const reg = getDefaultAccountRegistry();
                const id = accountId || reg.listIds()[0];
                if (!id)
                    return [];
                const st = reg.get(id);
                if (!st)
                    return [];
                const cfg = st.config;
                if (!cfg)
                    return [];
                const ids = new Set();
                for (const x of cfg.groupAllowFrom ?? [])
                    if (x)
                        ids.add(x);
                for (const x of cfg.blacklistGroups ?? [])
                    if (x)
                        ids.add(x);
                return [...ids].map((gid) => ({
                    kind: "group",
                    id: gid,
                    name: gid, // 微信群名需 API 拉取; 此处用 id 保底, 不编造
                }));
            },
        },
        // 2026-09-27 OPENCLAW-DOCTOR: 接入 OpenClaw 2026.9.6 的 doctor 契约
        //   背景: 审阅发现插件只实现 ChannelPlugin 必填 4 项 + 8 个可选项 (共 35 可选;
        //         数字实测自 openclaw 2026.9.6 的 types.plugin-*.d.ts。已实现的 8 项:
        //         reload/outbound/status/gateway/doctor/messaging/directory/agentTools)。
        //         doctor 缺失 -> openclaw doctor 无法诊断本 channel 的配置问题,
        //         运维只能手写 ps/curl/grep 排查 (本会话调试时即如此)。
        //   本适配器是纯声明式的: 告诉框架「本 channel 的配置长什么样、边界在哪」,
        //   由框架自己的 doctor 引擎据此检查, 本插件不重复实现校验逻辑。
        doctor: {
            // 私聊白名单只认顶层 (channels.wechatpadpro.allowFrom)。
            //   本插件不读嵌套账号级 allowFrom 做 DM 准入 -> 声明 topOnly 让 doctor 不误报。
            dmAllowFromMode: "topOnly",
            // 群模型: 走 route (按 chatroom id 路由到群策略), 非 sender 粒度。
            groupModel: "route",
            // 顶层 allowFrom 为空时不回落到群白名单
            //   (本插件 DM 是 fail-closed: 空 = 拒绝所有, 见 configUiHints.allowFrom 说明)。
            groupAllowFromFallbackToAllowFrom: false,
            // 群白名单为空时给出警告 -- allowlist 策略下空名单 = 所有群被拒。
            warnOnEmptyGroupSenderAllowlist: true,
            // 历史配置迁移规则: 早期版本用过的旧键 -> 现行键。
            //   仅声明, 不自动修复 (repairConfig 才改配置); 由 openclaw doctor 提示用户。
            legacyConfigRules: [
                {
                    path: ["channels", "wechatpadpro", "tokenKey"],
                    message: "tokenKey 现应放 plugins.entries.wechatpadpro.config.tokenKey (或 WECHATPRO_TOKEN_KEY env); 顶层残留键不会被读取。",
                },
                {
                    path: ["channels", "wechatpadpro", "groupPolicy"],
                    message: "groupPolicy 现由 accounts/<id>.json 的 per-account 配置管理; openclaw.json 顶层值仅作 default 账号兜底。",
                },
            ],
            // 空白名单场景的补充警告 (在框架通用警告之外追加)。
            collectEmptyAllowlistExtraWarnings: (params) => {
                const out = [];
                if (params.dmPolicy === "allowlist") {
                    out.push(params.prefix +
                        " wechatpadpro 私聊为 allowlist 且白名单为空 -> 所有 DM 将被拒绝 (fail-closed)。用 npm run setup 添加 allowFrom。");
                }
                return out;
            },
            // 2026-10-04 v1.15.1 OPENCLAW-DOCTOR: 抑制框架的**假**「群白名单为空」告警。
            //
            // 问题: v1.15.0 把这五个 wxid 列表的 manifest channel schema 改成 string (Channel 页渲染成
            //   逗号分隔单框所必需)。框架自己的通用判据只认数组 ——
            //   `empty-allowlist-scan-QxhNaDKI.mjs` 的
            //     hasAllowFromEntries(list) = Array.isArray(list) && normalizeStringEntries(list).length > 0
            //   ⇒ 顶层块里的 `groupAllowFrom: "a@chatroom,b@chatroom"` 恒被判成"空" ⇒
            //     groupPolicy==="allowlist" 时每次 doctor 都报
            //     "groupPolicy is "allowlist" but groupAllowFrom is empty — ... all group messages will be
            //      silently dropped"。而**真实**群白名单在 accounts/<id>.json (SSOT), 框架看不到那个文件
            //   ⇒ 这是纯假报, 与收发无关 (doctor 只是建议性的, --fix 亦为 noop)。
            //
            // 修法: 框架在 channelDoctorFunctionKeys 白名单里留了本钩子, 调用点
            //   `channel-doctor-6TyVVqIn.mjs:125` `entry.doctor.shouldSkip...(ctx) === true`, 在
            //   `empty-allowlist-scan` 里位于「groupPolicy==="allowlist" 且 warnOnEmptyGroupSenderAllowlist」
            //   **之后**、计算 groupAllowFrom 是否为空**之前** ⇒ 返回 true 即短路掉**该记录**的这一条警告。
            //
            // ⚠️ 只在 truth 非空时返回 true。真为空/读不到文件一律 false —— 那时框架的告警**有价值**
            //    (群名单真空 ⇒ 群消息确实会被全拒), 绝不能无条件抑制 (那会把真问题的信号一起闷掉)。
            //
            // 记录 → 账号的映射: 框架对**每条记录**调用一次, prefix 形如
            //   `channels.wechatpadpro` (= 隐式 default 账号) 或 `channels.wechatpadpro.accounts.<id>`
            //   (桥会把非默认账号核心字段写进 block.accounts.<id>, 见 channel-ui-bridge)。
            //   `params.account` 是**块**里的记录 (看不到磁盘), 故只能按 prefix 反解 id 再读盘。
            // ⚠️ 实测结论 (2026-10-04, v1.15.1 上线后): 本钩子**在 `openclaw doctor` 里不会被调用**,
            //   因为那是个独立 CLI 进程, 它**不加载第三方 channel 插件代码** —— 证据 (三条独立):
            //     ① 该进程里 `normalizeAnyChannelId("wechatpadpro")` 返回 null
            //        (registry-normalize-BnQO61Jh.mjs:8 = `findRegisteredChannelPluginEntry(key)?.plugin.id ?? null`,
            //         查的就是运行时注册表), 于是 getDoctorChannelCapabilities 落到
            //        DEFAULT_DOCTOR_CHANNEL_CAPABILITIES (groupAllowFromFallbackToAllowFrom: **true**) ——
            //         与 doctor 实际打印的措辞「(and allowFrom) is empty / …or …allowFrom」完全吻合,
            //         而本契约声明的 false 从未生效 ⇒ 说明 getChannelPlugin("wechatpadpro") 是空的。
            //     ② `openclaw doctor` 输出里**零**条插件自身日志 (本插件 register 时必打
            //        `plugin.register: wppChannelPlugin registered`; 同进程也没有任何别的扩展插件日志)。
            //     ③ 框架设计如此: doctor 侧走 read-only-Dwh541LY.mjs 的 manifest 元数据路径,
            //        `listChannelDoctorEntries` 的 doctor 适配器只可能来自
            //        `getLoadedChannelPlugin` / bundled 插件; read-only 对象**没有 doctor 字段**。
            //   ⇒ 本契约 (含 2026-09-27 那批 dmAllowFromMode/groupModel/legacyConfigRules/
            //     collectEmptyAllowlistExtraWarnings) 对 `openclaw doctor` 而言**全是空转**。
            //     bundled/官方外部插件 (有 catalog metadata: `doctorCapabilities`) 才生效 ——
            //     第三方 extension 没有 manifest 级开关 (dist 里 `doctorCapabilities` 只出现在
            //     bundled catalog, 全 docs 0 命中)。
            //   保留本钩子的理由: 语义正确、零副作用, 且一旦框架改为在 doctor 里加载插件代码
            //     (或某条 in-process 路径调用 scanEmptyAllowlistPolicyWarnings) 立即生效。
            //     那条 CLI 假报**无法从插件侧消除** —— 已在 CHANGELOG v1.15.1 与记忆里记档。
            shouldSkipDefaultEmptyGroupAllowlistWarning: (params) => {
                if (params.channelName !== CHANNEL_ID)
                    return false; // 防御: 不该被别的 channel 调到
                const marker = `channels.${CHANNEL_ID}.accounts.`;
                const accountId = params.prefix.startsWith(marker)
                    ? params.prefix.slice(marker.length)
                    : DEFAULT_ACCOUNT_ID;
                // resolveAccount = 仓库既有的 sync 账号读取 (与运行期同一路径/同一文件, 含 id 合法性校验);
                //   读不到/非法 → null → 不抑制。
                let acct = null;
                try {
                    acct = resolveAccount(undefined, accountId);
                }
                catch (err) {
                    log.warn(`[doctor] shouldSkipDefaultEmptyGroupAllowlistWarning 读账号 ${accountId} 失败, 不抑制告警: ${formatErr(err)}`);
                    return false;
                }
                return coerceStringArrayList(acct?.groupAllowFrom).length > 0;
            },
        },
        // 2026-09-28 契约对齐 (E7): 契约要求 `configPrefixes: string[]` 为**必填** (types.plugin-DWwKnMgs.d.ts:40-44)。
        //   补**空数组** = 不声明任何「热前缀」。framework 装配规则 (config-reload-plan-D9XO5ks7.mjs:308-322):
        //     prefixes: plugin.reload?.configPrefixes ?? []  → 空数组不产出任何 hot 规则
        //   ⇒ 与「完全不声明 configPrefixes」在 reload 计划上**逐位等价** (该 channel 只剩 noop 规则, kind: "none")
        //     → 网关对 channels.wechatpadpro 不重启 channel runtime, 微信连接不掉。
        //   ⚠️ 绝不可写成 ["channels.wechatpadpro"]: 等深同前缀时 hot 规则靠插入顺序排在 noop 前获胜
        //      → accountId===null ⇒ plan.restartChannels.add(plugin.id) ⇒ 整 channel 停启 ⇒ **微信掉线**。
        //   (复刻 config-reload-plan 的比较器 + 规则构造实测: absent / [] 均 kind:"none"; ["channels.wechatpadpro"] 为 kind:"hot")
        reload: {
            configPrefixes: [],
            noopPrefixes: ["channels.wechatpadpro"],
        },
        // OpenClaw channel gateway (start/stop 细粒度入口, 委托 startAccountById/registry.stop)
        gateway: {
            async startAccount(ctx) {
                log.info(`gateway.startAccount: accountId=${ctx.accountId}`);
                // 注入 channel runtime (否则 getChannelRuntime 返 NOOP → AI reply 链路断裂)
                if (ctx.channelRuntime) {
                    setChannelRuntime(ctx.channelRuntime);
                    log.info(`gateway.startAccount: channel runtime injected (accountId=${ctx.accountId})`);
                }
                else {
                    log.warn(`gateway.startAccount: no channelRuntime provided (accountId=${ctx.accountId}) — AI replies will be NOOP`);
                }
                // 注入 OpenClaw 完整配置 (否则 dispatcher cfg:{} → model 解析失败 → gpt-5.5 → 401)
                if (ctx.cfg) {
                    setOpenClawConfig(ctx.cfg);
                    log.info(`gateway.startAccount: openclaw config injected (accountId=${ctx.accountId})`);
                }
                else {
                    log.warn(`gateway.startAccount: no cfg provided (accountId=${ctx.accountId}) — model resolution may fallback to default`);
                }
                try {
                    await startAccountById(ctx.accountId);
                    // 上报 connected=true 给 OpenClaw runtime (否则 health-monitor 判 disconnected → 每 ~10min 重启账号).
                    // ws-client 自带断线重连 (scheduleRetry), 断线无需 health-monitor 介入; 故就绪即报 true.
                    ctx.setStatus?.({ accountId: ctx.accountId, connected: true, lastError: null });
                    log.info(`gateway.startAccount: started ${ctx.accountId}`);
                }
                catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    log.error(`gateway.startAccount: failed ${ctx.accountId}: ${msg}`);
                    return { ok: false, error: msg };
                }
                // keep-alive: 返回 pending promise 让 OpenClaw 认为 channel 一直运行 (否则误判 exited → restart-loop breaker)
                if (ctx.abortSignal) {
                    const abortSignal = ctx.abortSignal;
                    if (abortSignal.aborted) {
                        // 已 aborted: 直接返回, 不 keep-alive
                        return { ok: true };
                    }
                    await new Promise((resolve) => {
                        abortSignal.addEventListener("abort", () => {
                            log.info(`gateway.startAccount: abort signal received (accountId=${ctx.accountId}) — cleaning up`);
                            // 仿 stopAccount 语义: 单账号 stop (registry.stop)
                            const reg = getDefaultAccountRegistry();
                            if (reg.has(ctx.accountId)) {
                                reg.stop(ctx.accountId).catch((e) => {
                                    log.warn(`gateway.startAccount: abort cleanup stop failed: ${formatErr(e)}`);
                                });
                            }
                            resolve();
                        });
                    });
                }
                return { ok: true };
            },
            // 2026-09-28 契约对齐 (E8): 返回 `Promise<{ok,error?}>` → `Promise<void>`。
            //   依据: 契约 `stopAccount?: (ctx: ChannelGatewayContext) => Promise<void>` (types.adapters:503);
            //   框架唯一调用点 server-channels-D1JRZ19m.mjs:590-595 走
            //   `runPluginCleanup(stopAccount, …)`, 而 runPluginCleanup
            //   (plugin-instance-scope-C9hxyH_A.mjs:32-35) **丢弃返回值** —— 框架从不读 {ok,error}。
            //   故: 原来靠返回值传达的 "no-op / 失败" 改走 log (信息不减, 只是换成框架真会看的通道);
            //   且旧实现本就**不抛**(错误被 catch 后转成 {ok:false}), 新实现同样不抛 → 上层语义不变。
            async stopAccount(ctx) {
                log.info(`gateway.stopAccount: accountId=${ctx.accountId}`);
                const reg = getDefaultAccountRegistry();
                // registry.stop 对未知账号是 no-op + warn → 这里显式记录, 便于区分 "真停了" 与 "什么都没做"
                if (!reg.has(ctx.accountId)) {
                    log.warn(`gateway.stopAccount: no-op — account not found: ${ctx.accountId}`);
                    return;
                }
                try {
                    await reg.stop(ctx.accountId);
                    log.info(`gateway.stopAccount: stopped ${ctx.accountId}`);
                }
                catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    log.error(`gateway.stopAccount: failed ${ctx.accountId}: ${msg}`);
                }
            },
        },
    };
    return wppChannelContract;
}
//# sourceMappingURL=channel-contract.js.map