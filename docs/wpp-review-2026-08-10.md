# WPP 插件多维度完整审阅报告 (v1.3.17)

- **日期**: 2026-08-10
- **范围**: 107 src .ts / 15178 行 / 60 测试文件 632 测试全绿 / 5 维度 fan-out agents + 逐项 grep 验证
- **方法**: 5 agents (正确性/安全/性能/架构/测试) → 每 finding 亲自 grep 到 file:line 验证 (防 false positive) → prod DB 真数据裁决争议项
- **结论**: 无"生产已现" P0 事故; **3 个 P1 级"直接抵消核心特性"缺陷 + 3 个 P1 安全洞 + 多个 P1 正确性/测试缺口**。核心短板 = 空 ctx 工具链 + outbound 引用定位 + 媒体下载无大小上限。

---

## 一、总览

| 维度 | P0 | P1 | P2 | P3 |
|---|---|---|---|---|
| 正确性 | 0 | 3 | 3 | 3 |
| 安全 | 0 | 3 | 3 | 3 |
| 性能/健壮性 | 0 | 4 | 3 | 5 |
| 架构一致性 | 0 | 3 | 4 | 3 |
| 测试质量 | 0 | 7 | 7 | 3 |
| **合计** | **0** | **20** | **20** | **17** |

(测试质量维度的 P1-1/P1-3 与安全/正确性有交叉计, 均已去重; 上方为独立 finding 数)

**正面项**:
- 三处 version 同步 (constants.ts / package.json / openclaw.plugin.json = 1.3.17)
- logger 统一 (formatErr 保 stack, src/ 无裸 console.*, 0 process.exit)
- 无 SQL 注入 (全参数化) / 无命令注入 (spawn shell:false) / 无灾难正则 (safeMatch 4096 截断)
- 凭证不打日志 (authcode 掩码 / toJSON 排除 / config_json 不含 secret)
- 632 测试中 ~55% 是真实行为测试, 测试隔离良好

---

## 二、P1 — 高优先 (top priority)

### P1-核心1 [架构+正确性] 空 ctx 工具入库 account_id="" → DB 孤儿行 (自破 v1.3.16 立项价值)

- **证据**: `src/dispatch/agent-tools/msg-meta.ts:8` `const ctx = { baseUrl:"", tokenKey:"", accountId:"" }` → `src/send/msg.ts:69` `account_id: ctx.accountId` = `""`
- **机制**: 14 个 meta 文件 (158 工具) 全用空 ctx; 发送走 `src/api/client.ts:102-121 resolveCallCtx` 兜底取 "default" 账号真实凭证 (**实际能发**), 但入库走 msg.ts:69 **原始空 ctx** → 落库 `account_id=""`
- **影响**: AI 用 13 个 send* 工具发送成功的消息入库 `account_id=""`, `getMessages`/`getMessageByMsgIdOrNewId` 全按 account_id 过滤 → 这些行任何查询都找不到 → 引用/上下文/统计全失效。老板 v1.3.16 "以便引用 bot 消息" 被自我破坏。
- **修法**: agent-tools 层统一注入真 ctx (仿 `send-message.ts:80-89 msgApiFor` 从 registry 构造); 删 resolveCallCtx 兜底, 让"工具必须持真凭证"成为硬约束。

### P1-核心2 [正确性+架构] getMessageByMsgIdOrNewId 硬编码 `direction='inbound'` → 引用 bot 自己发的消息查不到

- **证据**: `src/storage/db/mysql.ts:371` `... AND direction = 'inbound'`
- **影响**: 老板引用 bot 上一条**回复** (direction=outbound) 触发时: dispatcher `resolveReferencedMessage` (dispatcher.ts:216-237) 查不到 → v1.3.14 "引用即指定" 静默降级; quote-reply.ts:150 DB 补全 refermsg 也拿不到原文。handler.ts:355 有 `getMessageById` 兜底 (无 direction 过滤) 部分绕过, dispatcher/quote-reply 没有。
- **修法**: 按调用语义拆分 — dedup 用 inbound-only, 引用解析用全方向 (加可选 direction 参数)。

### P1-核心3 [正确性] outbound 发送成功判据只看 `r.Code`, 不查 `Data.BaseResponse.ret`

- **证据**: `src/dispatch/outbound.ts:106,127,143,166,181` 全部 `if (r.Code !== 0 && r.Code !== 200)` 即判成功; 而同库 `quote-reply.ts:220-221` 明确 "判据陷阱: Code=0 只是 HTTP 200, 真正成功看 Data.BaseResponse.ret===0"; `media-enrich.ts:295` 也查 baseRet
- **影响**: vendor 返 `Code=0 + ret=-2` (实测 SendCDNFile 场景) 时 outbound 误报成功 → 不重试 + persist 假记录。与 quoteReply 判据不一致。
- **修法**: 统一判据 `Code===0 && BaseResponse.ret===0` (参考 quote-reply)。

### P1-安全1 [安全] readLocalMedia 路径穿越可读任意文件 (含 OSS 凭证)

- **证据**: `src/api-client.ts:250-261` `abs.startsWith(root)` 前缀检查, 无 `path.resolve` 归一化 → `/root/.openclaw/media/../../../etc/passwd` 前缀命中但读到 `/etc/passwd`; `/root/.openclaw/shared-media/../credentials/oss-credentials.json` 可读 OSS accessKey (media-enrich.ts:18-20 引用该文件)
- **触发**: AI 被 prompt 注入 → sendMessage(type=image) content=构造路径 → base64 外带
- **修法**: reject `..` + `path.resolve` + `path.relative` 包含校验 + root 带尾斜杠精确匹配

### P1-安全2 [安全] 所有 fetch 无 host 白名单 → SSRF

- **证据**: `src/api-client.ts:221` / `src/send/msg.ts:206` (sendFile) / `src/dispatch/outbound.ts:31` (视频缩略图) / `src/inbound/media-enrich.ts:623` — 全无 host 校验, 可打 `169.254.169.254` (云元数据)/`127.0.0.1:8062` (本地 vendor)/内网
- **最重**: sendFile 下载内网响应后**当文件卡片发给用户** = 直接外带
- **修法**: 白名单 host (OSS bucket / vendor CDN) + 屏蔽私网/loopback/link-local/metadata

### P1-安全3 [安全+配置] webhookSecretEnv 是死配置, HMAC 验签永远 OFF

- **证据**: `accounts/default.json` 设 `webhookSecretEnv:"WECHATPRO_WEBHOOK_SECRET"`, 但 `src/config.ts` / `src/config-helpers.ts` **从不解析该 env** (grep 0 命中) → `cfg.webhookSecret` 恒 `""` → `webhook-receiver.ts:103-117` 验签分支死代码
- **影响**: 公网可达的 webhook 无验签, 可伪造 vendor payload 注入消息触发 AI (链上 P1-安全1/2)
- **修法**: 两处 loader 补 `raw.webhookSecret = process.env[raw.webhookSecretEnv] ?? ""`

---

## 三、P1 — 正确性

### F2 [正确性] sendImage 先 persist 后判 Code — v1.1.17 同款 bug 漏网

- **证据**: `src/dispatch/outbound.ts:124-127` `await persistOutbound(...)` 在 `if (r.Code!==0)` **之前**; sendVoice/sendVideo 已修成先判后写 (outbound.ts:142-144,165-167 带 "P1-f" 注释)
- **影响**: 图片发送失败仍落假 outbound 行 (msg_id=null) → 污染上下文/引用查询

### F6 [正确性] webhook + WS 入站裸 JSON.parse, 16+ 位大整数丢精度

- **证据**: `src/webhook-receiver.ts:122` + `src/ws-client.ts:135` 裸 `JSON.parse`; 出站 api/client.ts 有 `stringifyLargeInts` 保护但入站两条链路没有
- **影响**: vendor 若在入站 body 发数字型 new_msg_id (16 位), 精度丢失 → DB 存错 id → 引用/去重找不到 (silent killer)
- **修法**: 入站两处接 `parseJsonText` (stringifyLargeInts + JSON.parse)

### F9 [正确性] embedding 快路径被 llmEnabled 门禁卡死

- **证据**: `src/dispatch/dispatcher.ts:307` `llmEnabled = ... && !!resolveMinimaxApiKey()` → `:310 if (llmEnabled && needsLlm)` → `:320 else if (embedEnabled)` embedding 分支嵌在 llmEnabled 条件内
- **影响**: 只配 BAILIAN 不配 MINIMAX 时 embedding 永不走, topic 消息被 v1.3.15 保守降级丢弃

---

## 四、P1 — 性能/健壮性

### F1 [性能] 文件下载无大小 cap, 整文件驻内存 + writeFileSync

- **证据**: `src/inbound/media-enrich.ts:563-589` `Buffer.from(await resp.arrayBuffer())` + `fs.writeFileSync` — 无 Content-Length 检查
- **影响**: 大文件 (zip/exe) 一次性进内存 + 同步写盘, 并发 OOM + 事件循环卡顿

### F4 [性能] sendFile 下载无 cap + base64 双倍内存

- **证据**: `src/send/msg.ts:206-212` fetch 无 cap → Buffer → base64 → vendor POST body
- **影响**: AI 发大文件 URL → 整文件 2x 内存 + 大请求体, 可 OOM

### F5 [性能] 视频缩略图下载整个视频文件只为抽一帧

- **证据**: `src/dispatch/outbound.ts:31-35` fetch 整个视频 (可数百 MB) 进内存 + 同步写盘 + ffmpeg, 无大小 cap
- **影响**: AI 发视频无缩略图时, 下载全片 (应流式/只取前几 MB)

### F2 [性能] 视频分片循环按"段数"而非"字节"封顶

- **证据**: `src/inbound/media-enrich.ts:964` `if (chunks.length > 200) break; // 防死循环 (200MB 上限)` — 注释说 200MB, 实际按段数; vendor 返更大块可超 200MB; `Buffer.concat` 再翻倍
- **修法**: concat 前查 `totalBytes > MAX`

---

## 五、P2 — 重点隐患

| # | 维度 | finding | 证据 |
|---|---|---|---|
| F3 | 正确性 | 引用定位 dispatcher:216 查 new_msg_id 列 vs handler:355 查 msg_id 列 — **prod DB 实测两列同值 (v1.3.7 后) → 被中和**, 仅 pre-v1.3.7 旧消息 new_msg_id 空列时路径 miss | mysql.ts:361-371 |
| F5 | 正确性 | quoteBot 触发器 + buildQuoteContext 只认 `<refermsg>` XML, v1 schema (app.reference) 引用不触发引用回复指令 | triggers.ts:148 / reply-helpers.ts:9 |
| F7 | 正确性 | deliver 的 ossImgUrl 是死数据 (QuoteReplyParams 无此字段), AI 媒体回复静默丢弃 | dispatcher.ts:721-738 |
| F8 | 正确性 | ts 毫秒→秒归一化只 webhook 顶层做了, v1/business-callback 没做 | parser.ts:92 vs 147 vs 252 |
| A3 | 架构 | 空 ctx 工具全打 "default" 账号 (多账号全错); authcode 用 config 而非活跃态 | api/client.ts:102-121 |
| B1 | 架构 | 双发送实现行为分叉: 文本 chunk (outbound 有 / msg 无), 图片下载方式不同, 视频缩略图不同 | outbound.ts vs msg.ts |
| C2 | 架构 | openclaw.plugin.json schema 缺 groupContextWindow/llmIntent*/embedIntent*/dmPairingEnabled 等字段 | :21-258 |
| D2 | 架构 | **sqlite adapter 是假的**: factory.ts:31 永远 createMysqlAdapter, mysql.ts:248 backendName="mariadb"; 配 sqlite 静默连 MySQL | factory.ts:31 |
| P2-6 | 测试 | readLocalMedia 穿越防护测试不全 (只测 /tmp 白名单外) | api.test.ts:283-285 |
| P2-7 | 测试 | buildGroupContextFromDb LLM/embedding 分支无集成测试 (测试环境无 MINIMAX key) | dispatcher-group-context.test.ts |
| F6 | 性能 | dispatchQueues 每会话无界堆积 (AI 慢时) | dispatcher.ts:620-622 |
| F7 | 性能 | embedCache Map 无 LRU/TTL, 向量 ~8KB/条 单调增长 | intent-embed.ts:87 |
| F10 | 性能 | 全无并发信号量 (ossutil/ffmpeg/STT 并发打爆) | grep 0 命中 |
| P1-3 | 测试 | sendMessage 6 类型 (file/link/card/location/miniprogram/emoji) 零测试 | send-message.test.ts:67-93 |
| P1-4 | 测试 | quoteReply 主流程 (DB 补全 refermsg/svrid/persist) 零测试 | quote-xml.test.ts |
| P1-6 | 测试 | webhook HTTP server (验签 401/10MB 413/去重) 零测试 | webhook-receiver.test.ts |

---

## 六、测试质量总评 + P1 假绿

- **~55% 真实行为测试** / ~10% 存在性 meta / ~15% 纯函数 leaf / ~15% mock 集成 / **~5% 完全假绿**
- **最大问题**: 核心链路 "webhook → 解析 → 媒体 enrich (真实下载) → 触发 → AI → quoteReply → 入库" **无任何真实 e2e** (e2e 全走 USE_MOCK 分支, mock server 恒返 Code:0)
- **P1-假绿1**: `tests/shouldquote-text-only.test.ts:13` + `tests/shouldquote-all-msgtypes.test.ts:15` 定义**本地 stub** `shouldQuoteFn`, 18 个测试测副本不测真实代码 (dispatcher.ts:724 `const shouldQuote = true` 硬编码) → 改真实逻辑永不失败
- **P1-假绿2**: `tests/inbound.test.ts:364-391` `assert.ok(true)` 自认 "主要验证 handler 不抛"; `:436-465` FakeDbForEnrich 从未 wire 进 adapter factory
- **P1-假绿3**: `tests/pending-enrich.test.ts:107-114` 注释称"有 pending 等待"实际 clearPendingEnrichs 后测无 pending; `tests/api-client-mock.test.ts:32-45` "500 触发 retry" 实际恒返 200
- **P1-5**: `enrichImageMessageFromV1 / enrichVideoMessageFromV1 / enrichVoiceMessageFromV1 / enrichFileMessageViaMcp` **grep tests/ 0 命中** — 8/9、8/10 生产事故核心路径无回归保护

---

## 七、优先级修复建议

### 第一批 (v1.3.18, 1-2h, 直接救核心特性)
1. **空 ctx 工具注入真 ctx** (P1-核心1): agent-tools 层 msgApiFor 化, account_id 不再 ""; 删 resolveCallCtx 兜底
2. **引用定位 direction 参数化** (P1-核心2): getMessageByMsgIdOrNewId 加可选 direction, 引用解析用全方向
3. **outbound 判据统一** (P1-核心3 + F2): sendImage 先判 Code 再 persist + 全 send 加 BaseResponse.ret 检查

### 第二批 (v1.3.19, 安全加固, 1-2h)
4. readLocalMedia path.resolve + `..` 拒绝 (P1-安全1)
5. fetch host 白名单 + 屏蔽私网 (P1-安全2)
6. webhookSecretEnv 注入修复 (P1-安全3)

### 第三批 (v1.3.20, 健壮性, 1-2h)
7. 媒体下载统一 Content-Length + 字节 cap (F1/F4/F5) + writeFile 异步化
8. 视频分片按字节封顶 (F2)
9. 入站 JSON.parse → parseJsonText (F6)
10. embedding 门禁解耦 (F9)

### 第四批 (测试补强 + 架构专项, v1.4)
11. 删 2 个 shouldquote 假绿文件, 接真实 dispatcher 决策
12. 补 quoteReply 主流程 + enrich v1 成功路径 + sendMessage 6 类型 + webhook HTTP 测试
13. 双发送实现统一 (outbound 收敛为媒体解析纯函数 + makeWppMsg 统一收口)
14. sqlite 假 adapter 决策: 要么删 schema 声明, 要么实现

---

## 八、关键文件索引

- 空 ctx 工具: `src/dispatch/agent-tools/*-meta.ts:8` + `src/api/client.ts:102-121` + `src/send/msg.ts:69`
- 引用定位: `src/storage/db/mysql.ts:371` + `src/dispatch/dispatcher.ts:208-260` + `src/send/quote-reply.ts:150`
- 发送判据: `src/dispatch/outbound.ts:106-181` + `src/send/quote-reply.ts:220`
- 媒体下载: `src/inbound/media-enrich.ts:563-589,924-966` + `src/send/msg.ts:206-212` + `src/dispatch/outbound.ts:31-35`
- 安全: `src/api-client.ts:250-261` (路径穿越) + `src/webhook-receiver.ts:122` (JSON.parse) + `src/config.ts` (secretEnv)
