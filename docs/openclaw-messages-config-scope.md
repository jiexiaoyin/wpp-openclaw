# OpenClaw Communications → Messages 各字段对 WPP 通道的生效范围

> 评估日期：2026-10-04
> 对象：框架 `openclaw 2026.9.7`（生产网关实际加载的那份）的顶层 `messages.*` 配置
> 结论：**只有 4 组对 WPP 通道生效；5 项完全空转；`ackReaction` 结构性不可实现。**
> ⇒ **不需要为"适配 Communications"改插件代码**（详见「五、结论」）。

## 一、先划边界：本插件跨了框架哪几根线

判定每字段是否生效，只取决于**它的消费点是否落在本插件走过的代码路径上**。实测边界（证据见下）：

| 阶段 | 本插件走的框架入口 | 是否在框架持久队列/入站管线内 |
|---|---|---|
| 入站 | `runtime.session.recordInboundSession`（**只登记**） | ❌ **不走** `runChannelInboundEvent` / `buildChannelInboundEventContext` |
| 回合 | `runtime.reply.dispatchReplyWithBufferedBlockDispatcher`（`src/dispatch/dispatcher.ts:944`） | ✅ 走 | 
| 出站（agent 主动发，如 `message` 工具 / cron 直投） | 框架 outbound 管线 → `executeDeliveryQueueEnqueue` → 队列 `outbound-prepared-v1` | ✅ 在（durable custody/receipt/recovery 由此白拿） |
| 出站（本插件回复） | 框架只 prepare payload（`deliver-prepare--wQvThDe.mjs` 内**零** enqueue），然后回调本插件的 `deliver` 直发 vendor | ❌ **不在** |

回合链路（已逐文件追通）：`dispatchReplyWithBufferedBlockDispatcher`
→ `provider-dispatcher-COm8phxv.mjs: dispatchReplyWithBufferedBlockDispatcherCore`
→ `dispatch-DNGUu9Pl.mjs: dispatchInboundMessageWithBufferedDispatcher` → `dispatchInboundMessage`
→ `params.dispatchReplyFromConfig ?? dispatchReplyFromConfig`（`dispatch-from-config-BfxY-Rlw.mjs`）
→ agent 回合核心 `get-reply-fCAtF3T_.mjs`。

> 关键：本插件调用时**未传 `replyResolver`** ⇒ agent 回合由框架跑 ⇒ 框架"回合内"的配置项对本通道天然生效。

## 二、逐字段判定

### ✅ 生效（4 组，已生效，无需任何改动）

| UI 字段 | 配置键 | 消费点（框架文件） |
|---|---|---|
| 群组可见回复 / 可见回复 | `messages.groupChat.visibleReplies` / `messages.visibleReplies` | `resolveSourceReplyDeliveryMode()`（`source-reply-delivery-mode-CUa15KMA.mjs`）按 ChatType 取值，group/channel 时 groupChat 优先；施加于 `dispatch-from-config-BfxY-Rlw.mjs: prepareDispatchOperationContext`（→ `resolveVisibleRepliesPolicy` → `resolveSourceReplyVisibilityPolicy`）与 `agent-runner.runtime-wq3pHHwj.mjs` |
| 队列模式 / 队列容量 / 队列丢弃策略 | `messages.queue.{mode,cap,drop,debounceMs}`（含 `byChannel.<chan>`） | `settings-CfwtCLpn.mjs: resolveQueueSettingsCore()`；调用点 `get-reply-fCAtF3T_.mjs`（`resolveQueueSettings({cfg, channel: sessionCtx.Provider, …})`）与 `agent-runner.runtime-wq3pHHwj.mjs`（followup 队列） |
| 发出回复的前缀 | `messages.responsePrefix` | `delivery.runtime-DrfEYUf8.mjs`：`resolveResponsePrefixTemplate` → `normalizeReplyPayloadOutcome({responsePrefix, …})` |
| 默认用量页脚模式 / 用量页脚模板 | `messages.responseUsage` / `messages.usageTemplate` | `agent-runner.runtime-wq3pHHwj.mjs: resolveResponseUsageLine`（默认 `off`） |

本插件的 ctx 确实填了 `ChatType`（`src/dispatch/dispatcher.ts:591` = `isGroup ? "group" : "direct"`）⇒ 上面按 ChatType 分组的取值全部命中。

### ❌ 空转（5 项，配了也没有任何效果）

| UI 字段 | 配置键 | 消费点 | 为什么空转 |
|---|---|---|---|
| 群组提及匹配模式 | `messages.groupChat.mentionPatterns` | `mentions-4gNTXEZa.mjs: buildMentionRegexes` | 本插件路径里它**只**被 `dispatch-DNGUu9Pl.mjs: resolveGroupThreadMentionedAgentIds` 用（多 agent 群线程路由，入口 gate `group?.qualified`）；其余调用点在框架自带的通道处理器（如 Telegram `bot-message-D_h8xVny.mjs`） |
| 群组未提及入站消息 | `messages.groupChat.unmentionedInbound` | 读 `ctx.InboundEventKind` | 该字段由框架入站管线 `context-T1_U-yOL.mjs: buildChannelInboundEventContext` 填；本插件 ctx 里 **0 命中** |
| 群聊历史记录上限 | `messages.groupChat.historyLimit` | `bot-message-D_h8xVny.mjs`（Telegram）+ `doctor-contract-Dcoj6um0.mjs`（迁移） | 通用历史走 `ctx.InboundHistory` / `ctx.SessionTranscriptContext.historyLimit`（`channel-prompt-context-BXvHKHFK.mjs: selectInboundHistoryContext`），本插件 **0 命中** |
| 入站消息防抖（毫秒） | `messages.inbound.debounceMs` / `byChannel` | `inbound-debounce-BE0dOTzv.mjs: resolveInboundDebounceMs` ← `channel-inbound-WCt4Km7S.mjs: createChannelInboundDebouncer` | 消费点在框架的 **channel-inbound SDK**，只有插件调用 `runChannelInboundEvent` 才生效；本插件自带 500ms per-sender 合并（`src/inbound/debouncer.ts`） |
| 确认回应表情符号 / 确认回应范围 | `messages.ackReaction` / `ackReactionScope` | `ack-reactions-Cg_RffIJ.mjs: createAckReactionHandle / shouldAckReaction`（导入者：`runtime-channel-CrVnS_ku.mjs` = 框架给插件的 SDK reply pipeline 通道面；及 Telegram 处理器） | 需插件经框架 SDK reply pipeline 发送 **且**通道具备 reaction 能力 —— 本插件两者皆无 |

### 🚫 结构性不可实现

`messages.ackReaction` / `ackReactionScope`（确认回应表情）：**微信消息本身没有 reaction 这个动作**。
vendor 侧只有 `/Msg/SendEmoji`（`src/send/msg.ts:653`，参数 `{Md5, TotalLen}`）—— 那是**发一条表情消息**，
不是给某条消息贴回应。因此即便插件改代码也无从实现。

## 三、空转的共同原因（一条就够）

上述 5 项的消费点**全部**落在框架的**入站入口层**（`buildChannelInboundEventContext` /
`runChannelInboundEvent` / 框架自带的通道处理器）。那一层只服务"插件把入站交给框架"的通道。
本插件不走那条路，框架因此**拿不到** `InboundEventKind` / `InboundHistory` /
`SessionTranscriptContext` / `WasMentioned` 这些字段（插件 `src/` 对这四个符号 **0 命中**，已复核）。

## 四、要让空转项生效的代价（= 为什么不做）

唯一办法是把入站改走框架入站管线（ChannelPlugin 实现 inbound 契约，由
`buildChannelInboundEventContext` 构造 ctx）。那不是"适配配置"，是**换入站架构**：

1. 必须接受框架的 `sessionKey` / `ChatType` / history 约定。而 `src/session-key.ts:1-2` 的注释
   记录的正是一次漂移事故（群 sessionKey 曾写成 6 段含 accountId ⇒ 出站路由失败）；现在的群
   sessionKey **故意不含 accountId**，靠三层补丁做多账号隔离（队列键 `${sessionKey}|${accountId}`、
   去重键并入 accountId、心流预算按 accountId 分桶）。
2. 框架将接管去重/debounce/会话，与本插件的 `SeenTracker`+DB 双层去重、per-sender debouncer **重复把关**。
3. 生产通道挂的是在用的真号，任何结构性变更都需要停机窗口（窗口内入站消息**永久丢失**）。

而换来的 5 项里，本插件**都有更强的自研等价物**：

| 空转字段 | 框架给的 | 本插件已有 | 净值 |
|---|---|---|---|
| `mentionPatterns` | 全局/渠道级正则 + 校验 | 7 条正则 + 昵称匹配 + 引用触发，**且 per-account**（`src/inbound/parser/mention.ts`、`triggers.ts`） | **负**（会丢账号维度） |
| `unmentionedInbound` | `room_event` 静默语义 | 心流自决是否插话（`src/inbound/heartflow.ts`） | **负**——`room_event` 会压掉心流的自动回复，与需求相反 |
| `historyLimit` | 一个扁平数字 | `groupContextWindow` + 图片上限 + 引用短路 + embedding/LLM 语境过滤（`src/dispatch/dispatcher.ts:331+`） | **负** |
| `inbound.debounceMs` | 渠道级窗口 | 500ms per-sender 合并键（含 accountId）+ msgType bypass（`src/inbound/debouncer.ts`） | **负** |

## 五、结论

1. **不要为了 Communications 改插件。** 生效的那 4 组**已经在生效**（改了就是重复实现）；
   空转的 5 项要么换来更弱的东西、要么与心流需求相反；`ackReaction` 微信根本做不到。
2. **"界面旋钮看着能用其实不能用"是上游问题**（框架把不适用第三方通道的字段一并渲染了），
   应在插件文档标注 + 必要时给上游提 issue，而不是改插件去迎合 UI。
3. **值得动手的只有框架独有能力**（本插件没有对应物）：入站 hooks（`hooks` 段）、
   bot-pair loop guard（`execution-DF3a_BT9.mjs: recordChannelBotPairLoopAndCheckSuppression`）、
   session-init conflict retry（`lifecycle-Dg2jg0Jv.mjs: runWithSessionInitConflictRetry`）。
   做法是**单点照抄语义自研**，仍不是接 Communications。
4. **中间路（可做但现在不做）**：框架是从**本插件传入的 `ctx`** 里读 `WasMentioned` /
   `InboundEventKind` 的，所以理论上在 `ctxPayload` 补 2–3 个字段即可点亮框架的"静默回复策略"，
   无需换架构。但实测价值≈0（默认未提及即 optional，已正确；填 `room_event` 反而有害）⇒ 暂不做。

## 六、复现方法（怎么自己复核任一字段）

```bash
cd /usr/local/lib/node_modules/openclaw/dist
# 1) 找某配置键的全部消费点（⚠️ 必须 command grep：本机 grep 是 ugrep 包装，递归会静默漏匹配）
command grep -rn "groupChat?\.historyLimit" --include=*.mjs .
# 2) 看调用点是否落在本插件路径：从 dispatch-DNGUu9Pl.mjs（缓冲分派器实现）
#    向上追 provider-dispatcher-*，向下追 dispatch-from-config-* / get-reply-*
# 3) 判断插件是否喂了那些 ctx 字段（0 命中 = 框架拿不到）
cd /root/dev/wechatpadpro-openclaw
command grep -rn "InboundEventKind\|InboundHistory\|SessionTranscriptContext\|WasMentioned" src/
```

> 注：`package-update-activation-recovery.mjs`（66MB 的打包体）里含 dist 全量副本，
> 统计命中数时要排除，否则数字会虚高。
