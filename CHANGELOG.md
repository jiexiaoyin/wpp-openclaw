# Changelog

WeChatPadPro OpenClaw Plugin 版本变更记录.

格式: 基于 [Keep a Changelog](https://keepachangelog.com/), 版本号 [SemVer 2.0](https://semver.org/).

## [docs] API 使用文档完善 (2026-08-21)
- **WPP-API-REFERENCE.md 全量升级**: 254 → **313 端点** (swagger 全量)
- **三源合并生成**: swagger 定义 + `send/*.ts` 源码实测调用 (299 端点) + `api-notes.json` 探索笔记 (26 端点)
- **新增 `scripts/api-notes.json`**: 人工维护的探索经验 (可用性/坑/示例/实测日期)
- **`gen-api-reference.py` 升级**: 从源码提取实测调用 + notes 合并, 重新生成不丢人工经验
- 覆盖开发中探索出的坑: SendApp 群发勿用 / Msg/Quote ret=-2 / DownloadImg 64KB / CDN 图片 / DownloadFileBinary / DownloadVideo 分片 / GetQR Code:1 等

## [v1.3.74]
- 2026-08-20 (审阅核实修复 + 性能/测试/僵尸优化)
- **P2-5 api-coverage 固定 swagger 快照**: tests/fixtures/vendor-swagger-paths.json (313 paths), vendor 不可达不再 t.skip 假绿, 用本地快照真校验
- **P3-6 旧日志标签清理**: 39 处纯版本标签 [WPP v1.2.0] → [WPP v1.3.74]; 功能标记 (V1-SCHEMA-ENRICH 等) 保留
- **P3-7 xiaowei-meta 注释更新**: 与 v1.3.71 起实现一致 (工具已进 AGENT_TOOLS_META, 执行前检查 xiaoweiEnabled)
- **性能诊断**: 回复延迟 = 双通道去重 ~1.5s + debounce 1.5s + AI 生成 (多次模型调用) 5-18s; debounce 可调优
- **僵尸进程防护**: wpp-test-zombie-watcher.mjs + node-zombie-sweep.sh 扩展 (扫 tsx 测试僵尸, cron 9:15)
- **测试**: 895/895 全绿 (计数 916↔895 波动为 tsx runner 特性)
- **版本**: 1.3.73 → 1.3.74

## [v1.3.73]
- 2026-08-20 (转账静默 — 老板测收转账发现)
- **转账消息 (msg_type=49, app.category=payment_notice) 触发 AI 回复修复**: isRedPacketMessage 扩展识别 payment_notice/transfer + description 含"转账/收款" → 转账也静默入库不触发 AI (同红包)
- **测试**: 916/916 全绿 (v1.1.7-special-msg 加转账识别断言)
- **版本**: 1.3.72 → 1.3.73

## [v1.3.72]
- 2026-08-20 (红包/系统通知静默 — 老板实测"收红包/领红包都触发 AI")
- **红包消息不触发 AI 修复**: handler.ts dispatch 循环开头拦 isRedPacketMessage (原 continue 只在 relay 循环, dispatch 仍触发)
- **系统通知 (msg_type=10000, 含红包领取/转账/安全提醒) 静默**: dispatch 循环拦 10000
- **测试**: 915/915 全绿 (inbound.test 加 2 测试)
- **版本**: 1.3.71 → 1.3.72

## [v1.3.71]
- 2026-08-20 (小微命令开关 — 老板拍板)
- **/xiaowei on|off|status 命令**: FILEHELPER_COMMANDS 注册表 (自动进 /help); config.ts setAccountFlag 通用开关写回; types.ts 加 xiaoweiEnabled
- **xiaowei 工具执行前检查 xiaoweiEnabled**: 默认关闭抛"未启用"; 朋友圈用白名单机制不加开关 (老板拍板)
- **测试**: 912/912 全绿
- **版本**: 1.3.70 → 1.3.71

## [v1.3.70]
- 2026-08-20 (图片 enrich 修复 — 老板实测发图)
- **/Tools/DownloadImg 新 vendor 参数适配**: snake_case (msg_id/to_wxid/data_len) + section 必填; isV1SchemaImage 提取 image.data_len; 旧字段 msgId/toWxid → INVALID_ARGUMENT
- **测试**: 911/911 全绿
- **版本**: 1.3.69 → 1.3.70

## [v1.3.69]
- 2026-08-20 (小微预开发 — 老板拍板预开发不启用)
- **XiaoWei 20 端点全覆盖**: src/send/xiaowei.ts (Chat会话/SSE Events/History记忆/Invites邀请/RedDots红点/Cards卡片/Permission/A2A/Suggestions) + xiaowei-meta.ts (默认不 import = 禁用) + WPP_VENDOR_ENDPOINTS.xiaoWei
- **测试**: 912/912 全绿
- **版本**: 1.3.68 → 1.3.69

## [v1.3.68]
- 2026-08-20 (发布包架构变更 — 老板拍板)
- **发布包移除旧 vendor tar** (20260809, 12M→1020K): 新 vendor 通过 docker pull wechatpadpro/wechatpadprobusiness:v2026.08.18.1 + 官方 docker-deploy
- **文档重构**: vendor/README (Docker 部署) + FACE-LOGIN.md (人脸认证+iPad扫码) + 8075docker-deploy.zip 进发布包; README/GETTING_STARTED/DEPLOY/USAGE 全部改新端口/313 端点/authcode 走 X-Access-Token
- **版本**: 1.3.67 → 1.3.68

## [v1.3.67]
- 2026-08-20 (新 vendor 新增 API 接入 — 老板全选优先级)
- **37 新 API 适配**: P0 9 (群发/发文件/收藏圈/通讯录/好友权限) + P1 7 (公众号3/视频号4) + P2 10 (视频播放4/结构化卡片/红包2/小程序OAuth3) + P2B 11 (Login6/Search-AI2/ActiveTasks/Label/SayHello-Modelv3)
- **QWContact 路径修复**: /QWContact/QWContact/QWAddContact 路径去重 + 参数对齐 username/v1
- **测试 swagger 指向新容器 18062** (旧 8062 退役)
- **版本**: 1.3.66 → 1.3.67

## [v1.3.66]
- 2026-08-20 (SayHello 对齐 + 版本常量同步)
- **/SayHello/Modelv1+Modelv2 传参对齐**: 旧错传 scene/v1 与 v1/v2 → 新 swagger url/verifyContent 与 toUserName/content/scene
- **PLUGIN_VERSION 硬编码同步**: core/constants.ts (gateway-compat 测试断言 + 日志版本)
- **测试**: 889/889 全绿
- **版本**: 1.3.65 → 1.3.66

## [v1.3.65]
- 2026-08-20 (Favor favId 类型修复 — 新 vendor 严格)
- **/Favor/Del+GetFavItem favId string→number**: 新旧 swagger 均 integer, 新 vendor 报 cannot unmarshal string into int32
- **测试**: 889/889 全绿
- **版本**: 1.3.64 → 1.3.65

## [v1.3.64]
- 2026-08-20 (新 vendor 兼容适配)
- **/User/GetContractProfile GET→POST**: 新 vendor GET 404, POST Code=0; 删除废弃 get() 方法
- **测试**: 889/889 全绿
- **版本**: 1.3.63 → 1.3.64

## [v1.3.63]
- 2026-08-14 (多维度审阅修复 — 6 P1 + 8 P2 全清, 876/876 全绿)
- **P1-1 [正确性] ACK 拦截正则 0x08 退格字节修复**: dispatcher.ts ACK_TEMPLATE_RE 的 `)\b` 被转义成字面 0x08 → 正则恒 false → 14:50 P0-fix 拦截半边生产失效。改 `\b` + 导出常量供测试 import 真值 (根除手抄副本)
- **P1-2 [正确性] chunker 巨型代码块硬 cap**: chunkLongParagraph 代码块内推迟切分无上限 → 2000 行代码块单 chunk 56KB 超 vendor 限。加 `limit*2` 硬 cap, 超则强制切 (不闭合围栏也封顶)
- **P1-3 [正确性] outbound dedupe key 误吞**: content[:30] 前缀作 key → 同 peer 5 分钟内不同回复 (前 30 字同) 被误吞。改完整内容 sha1 hash key
- **P1-4 [并发] _outboundDedup Map 无界泄漏**: 只写不删 → 加写时清扫 (size>1024 扫过期)
- **P1-5 [崩溃] ensureAgentWorkspace bindId 残留**: 与 registerAccountInOpenclaw 对齐去掉 915-928 两处 bindId/maxId (曾致 gateway status=78 崩)
- **P1-6 [运维] unregister agents.list 误删共享 agent**: 排除 wpp-wechat/main + 检查剩余 bindings 引用才删
- **P2-1 [chunker] 代码块内空行拆断围栏**: 切段前扫围栏跳过块内空行
- **P2-2 [chunker] hardSplitLine 切断 emoji 代理对**: codePointAt 对齐切分点
- **P2-3 [relay] 单行接龙 title 里 "N. " 误判条目**: 从首个 `1. ` 处切起 (title 前缀弃置)
- **P2-4 [并发] embedCache 无界**: 加 2000 容量上限, 写时删最旧
- **P2-5/6/7 [测试] 假绿改真测**: chunker 测试加长到 >limit 触发真切分; dedupe 测试 import 生产 ACK_TEMPLATE_RE + dedupKeyFor 真值 (不再手抄/fake 重写)
- (第二波 — 2026-08-14 完整修复, 老板"继续完整修复"拍板)
- **P1 [架构] shared webhook 生命周期**: webhook-receiver 加 removePath; account-context stop 改 removePath 摘自己 path (不再 stop 共享 server, 防单账号移除波及其它账号); shutdown 统一停 + 置空 sharedWebhookServer (防重启复用已停 server 不 start → webhook 永久失效)
- **P1 [安全] friendcircle guard 绕过修复**: messagesRaw/publishVideoViaItem/setBackgroundImage 补 assertFriendCirclePublishAllowed (原漏网); publishCircleRaw 从 agent-tools 移除 (AI 不该有原始 XML 发布能力)
- **P2 [安全] readLocalMedia symlink 逃逸**: realpath 解析后再做 allowedRoots 包含校验 (原 path.resolve 纯词法, readFile 跟随 symlink 可读外部); workspace 根收窄到 workspace/media (原含 agent 转录/.env)
- **P2 [安全] mysql**: getContacts/getChatrooms LIMIT clamp (1-1000); pool 加 queueLimit (防耗尽无限等待)
- **P2 [并发] relayTriggerAt 清理**: 写时 size>1000 扫过期
- **P3 [安全]**: media-enrich md5 文件名净化 (sanitizeFilenamePart 只允许 hex); vendor-mcp-client 日志脱敏 (args/payload 只记 keys); handler.ts payload 摘要去内容; ACK_TEMPLATE_RE 收窄为完整 `[...]` 块匹配 (防正文散落 delivered 误伤)
- **webhook token** (老板拍板): webhookPathToken 账号字段插入 path → /wechatpadpro/<token>/webhook; deriveWebhookPaths 纯函数; nginx token 前缀放行 + 其余 403
- **测试**: 889/889 全绿 (876 + 新增 readLocalMedia 5 / removePath / friendcircle guard 4 / P1-7 path 3)
- **版本**: 1.3.62 → 1.3.63 (package.json + openclaw.plugin.json + core/constants.ts); 统一 v1.3.65 日志串为 v1.3.63

## [v1.3.62]
- 2026-08-13 (OPENCLAW-GUIDED-SETUP — 让 OpenClaw 能驱动插件引导配置)
- **插件加顶层 `configUiHints`** (openclaw.plugin.json + src/index.ts): tokenKey/authcode (sensitive) / apiBaseUrl / wsUrl / allowFrom / groupPolicy / groupAllowFrom / agent / webhookPort
  - OpenClaw `configure --section plugins` 现在能引导本插件配置 (写 plugins.entries.wechatpadpro.config)
- **config.ts 读引导兜底**: `readGuidedPluginConfig` 读 openclaw.json plugins.entries.wechatpadpro.config; `mergeGuidedConfig` 字段级 merge (default 账号, 空值填充, 文件已有值保留)
- **测试**: 新增 guided config 测试 (读引导 + merge 逻辑: allowFrom 逗号串→数组 / webhookPort 数字); 827/827 串行全绿; tsc 0 错
- **注意**: 这是"单账号 default 兜底"; 多账号 (每账号独立 agent) 仍走 CLI `npm run setup add <id>`

## [v1.3.61]
- 2026-08-13 (WEBHOOK-SHARED-PORT + P2-FIX — 多账号 webhook 单端口 + P2 收尾)
- **webhook 共享端口 (贴合 vendor 设计)**: vendor 按 authcode 区分账号 (Webhook/* 接口 URL query 带 authcode), 回调 URL path 含 accountId → **单端口 + path 区分**, 不再每账号独立端口
  - `webhook-receiver.ts` 加 `addPath()` (动态注册 path, 幂等, start 前后均可)
  - `index.ts` 加全局共享 webhook server (首个账号创建, 后续复用 + addPath; 只 attach 给创建账号防重复 stop)
  - `setup.ts` suggestNextWebhookPort 固定 4398 (不再递增)
  - 文档更新 (GETTING_STARTED/USAGE)
- **P2-1 BigInt**: setup-wizard.ts 5 处 JSON 写加 `stringifyLargeInts` (防未来大整数字段丢精度)
- **P2-2 c8 覆盖率**: 加 `c8` devDep + `npm run coverage` (总覆盖率 77.78%, 工具类 90-100%)
- **测试**: 826/826 串行全绿; tsc 0 错

## [v1.3.60]
- 2026-08-13 (MCP-MULTIACCOUNT — MCP 多账号适配)
- **MCP client 重构为 per-account 连接**: token 从账号 `config.authcodeEnv` 解析 (每账号独立 authcode env), 连接 Map key=accountId
  - `getMcpToken(accountId?)` / `connectMcpClient(accountId?)` / `callMcpTool(name, args, accountId?)` / `listMcpTools(accountId?)`
  - 单账号 (default) 行为不变 (WECHATPRO_AUTHCODE)
  - mcp-meta 传当前账号 id; resolveFileViaMcp / enrichFileMessageViaMcp 透传 accountId
- **修复**: 之前 MCP 全局单例用 default 的 authcode → 非 default 账号 MCP 工具查错账号数据
- **测试**: 新增 getMcpToken 按账号 authcodeEnv 解析 (tests/agent-tools-mcp.test.ts); 826/826 串行全绿; tsc 0 错

## [v1.3.59]
- 2026-08-13 (FULL-FIX — 完整审阅 P0/P1/P2 全量修复 + 补关键测试)
- **P0-1 [正确性]**: persistOutboundMsg 判据加 `BaseResponse.ret` 检查 (Code=0+ret≠0 不入库, 防幽灵 outbound 记录)
- **P0-2 [安全]**: silk-encoder 本地路径读加 readLocalMedia 三重校验 (防 AI 诱导读任意 .silk/媒体文件外带)
- **P0-3 [测试]**: agent-tools-mcp 测试隔离 env (不真连 vendor); vendor-mcp-client setTimeout clearTimeout (防 timer 泄漏 → 测试非确定性)
- **P1**: 两个 Map 泄漏修复 (pendingReplies/sessionChatInfo 写时阈值清理); MCP 只读工具受 `mcpEnabled` 门控; release/ 重出到 v1.3.59
- **P2**: JSON 响应体字节 cap (API_JSON_MAX_BYTES 30MB, 防媒体端点 OOM); resolveCallCtx 缺凭证 warn (防跨账号静默回落)
- **补测试**: MCP readMcp 成功/isError + mcpEnabled 门控; mp3→silk 成功路径 (真 ffmpeg+silk encoder, Type=4); agent-tools 账号感知 (accountContext.run 下选账号); 接龙节流恢复
- **测试**: 825/825 全绿 (串行稳定); tsc dev+release 0 错

## [v1.3.58]
- 2026-08-13 (MCP-READONLY — vendor MCP 只读能力整合给 AI)
- **新增 mcp-meta.ts**: 7 个 MCP 只读工具给 AI (account_status/get_contact/get_group/get_recent_messages/list_contacts/list_groups/search)
  - 复用 vendor-mcp-client (Bearer authcode + 超时 + 失败降级)
  - AI 可直接查账号状态/联系人/群/最近消息/微信搜索 (search 是 MCP 独有)
- **写工具暂缓**: vendor MCP 6 写工具需 2026-07-28 协议 + elicitation 确认流, 当前 SDK 1.30 打不通 (记录待 vendor 出参考客户端)
- **测试**: 新增 tests/agent-tools-mcp.test.ts (3 用例: 注册/降级/无凭证安全); 全量测试

## [v1.3.57]
- 2026-08-13 (DELIVERY-FIX — 交付前审阅 P0/P1/P2 全量修复)
- **P0-1 [安全] SSRF**: resolve-media.ts + silk-encoder.ts 裸 fetch → `safeFetchWithCap` (host 白名单 + 字节 cap + 超时), 防 AI 诱导抓内网/云元数据外带
- **P0-2 [正确性] 接龙门禁**: 接龙强制触发前检查 `via!=="blocked"` (黑名单群/自回环绕过)
- **P1-1**: `normalizeSendResp` 复用 isSendOk 判据 (file/link 等 5 类防假成功)
- **P1-2**: `sendVoice`/`sendVideo` 用 `extractOutboundMsgIds` (拿 newMsgId/createTime, 与 text/image 对齐)
- **P2-1**: 接龙节流 key 并入 accountId (防多账号同群互相节流)
- **P2-2**: 引用昵称缓存 key 并入 acct (防跨账号昵称串号)
- **P2-3**: quoteReply 成功判据接受 Code=200
- **P2-4**: handler 引用媒体查询加 `direction:"any"` (引用 bot outbound 消息可查)
- **P2-5**: agent-tools 报错信息含真实账号 (20 个 meta)
- **P2-6**: ensureAgentWorkspace agents.list 去重 + setup.ts checkAgentExistsInOpenclaw 用 OPENCLAW_ROOT
- **P2-7**: 测试写真实 accounts/ 的竞态修复 (beforeEach 清残留)
- **relay title fallback**: parseRelayText 无 `<title>` 标签时用 `#接龙 xxx` 首行作 title (否则不同接龙 title 全空 → 节流 key 相同互相节流)
- **测试**: 新增节流/黑名单绕过/不同标题测试; 817/817 全绿; tsc 0 错
- **MCP 调研**: vendor MCP 13 工具 (7 只读 + 6 写), 写工具需 `mcp:write` + **confirmation elicitation** (当前 SDK 不支持自动确认, 待设计确认流)

## [v1.3.56]
- 2026-08-13 (MULTI-ACCOUNT — 启用多账号, 一 authcode = 一 agent = 一账号)
- **配置引导完整化**:
  - `add`: 每账号独立 agent (默认 `wpp-<id>`), webhookPort 自动分配 (4398 起跳已用), 写后自动登记 openclaw.json
  - 新增 `modify <id>`: 交互式编辑 (agent/白名单/端口/env名/群策略); 改 agent 自动同步 binding + 建新 agent workspace
  - `remove <id> --clean`: 连带删 agent workspace + openclaw.json 登记/binding (仅删 json 用不带 --clean)
- **openclaw.json 登记 (setup-wizard.ts 新增)**: `registerAccountInOpenclaw` / `unregisterAccountFromOpenclaw` (幂等)
  - channels.wechatpadpro.accounts.<id> + bindings route `{channel:"wechatpadpro", accountId:"<id>"}` (精确匹配)
- **ensureAgentWorkspace binding 修复**: `channel:"last", accountId:"*"` (死配置) → `channel:"wechatpadpro", accountId:<id>` (per-account 精确路由, 幂等)
- **运行时账号透传**:
  - `api-client.ts makeCtx`: accountId 透传真实 id (非 "default")
  - `media-oss.ts uploadMediaToOss`: 加 accountId 参数 (OSS 路径按账号分桶, 防多账号互相覆盖)
  - `index.ts outbound`: 缺 accountId 用当前 dispatch 账号 (ALS) 兜底
  - `dispatcher.ts`: dispatch 队列键并入 accountId (防跨账号同群串行阻塞)
- **agent-tools 账号感知**: 新增 `src/dispatch/account-context.ts` (AsyncLocalStorage);
  - dispatchOne 用 accountContext.run(msg.accountId) 包裹 AI 回复生成
  - 21 个 agent-tools meta 的 getXxxApi() 从 `get("default")` → `get(getCurrentAccountId() ?? "default")`
- **测试**: 新增 tests/setup-multiaccount.test.ts (13 用例: 读/改/登记/注销/幂等/binding 格式/ALS 穿透/并发隔离); 814/814 全绿; tsc 0 错

## [v1.3.55]
- 2026-08-13 (RELEASE-GENERIC — 分享版可被接收方用自己的 OpenClaw 部署)
- **deploy 脚本通用化**: `OPENCLAW_ROOT` (默认 $HOME/.openclaw) / `GATEWAY_SERVICE` (默认 openclaw-gateway) / `BACKUP_ROOT` (默认 /data) 全 env 可覆盖.
  - `deploy-swap.sh`: openclaw.json 不存在则 fail 并提示; gateway 非 systemd 则跳过重启 + journalctl verify, 提示手动重启; GATEWAY_ENV 不存在跳过 env 注入
  - `deploy.sh`: OPENCLAW_ROOT 可覆盖探测/手动部署提示
- **setup-wizard.ts**: openclawRoot / backupDir 支持 `OPENCLAW_ROOT` / `BACKUP_ROOT` env (接收方非 root 环境)
- **build-release.sh**: 发布包收进 `deploy.sh` + `deploy-swap.sh` (通用化后) + `db/schema.sql` (补漏拷, 防接收方 schema.sql not found warning)
- **release-docs/GETTING_STARTED.md**: 加"用自己的 OpenClaw 部署"三种环境表 (systemd/docker/非root) + 手动接入步骤
- **测试**: 801/801 全绿; tsc 0 错

## [v1.3.54]
- 2026-08-12 (RELAY-TRIGGER — 接龙消息触发 AI 鼓励, 华为群)
- **根因 (老板反馈"接龙一直没 LLM 介入")**: 真实 vendor 接龙推送是 **type=49 (app, category=app_message)**, 但 handler 只判断 `msgType===53` (describeMsgType 映射的 chat-history) → relay 解析从未执行; 且 msgTypeTrigger 未配置 → 接龙消息不触发 dispatch → **AI 完全不介入**。v1.3.37 RELAY-PARSE 测试用的 53 是假设, 跟真实 vendor 数据不符 (集成 bug)。
- **修复**:
  - `relay.ts` 加 `isRelayMessage(m)`: type=53 (旧兼容) 或 type=49 && (content/title 含 "#接龙" 或 "接龙"+编号条目)
  - `handler.ts` Step 3: relay 解析条件 `msgType===53` → `isRelayMessage(m)` (默认 parseRelay 开)
  - `handler.ts` dispatch: 接龙消息**强制触发 AI** (即使没人 @) — 老板诉求"对华为群接龙进行鼓励"
  - **节流**: 同群同接龙标题 5 分钟内只触发一次 (vendor 每次有人接龙都推完整接龙, 全回会刷屏); 被 @ 消息不受节流影响
- **测试**: `isRelayMessage` 5 用例 (49+接龙 true / 53 true / 普通 app false / 文本 false / 无条目 false) + handler e2e (type=49 接龙强制 dispatch + content 解析成 [接龙] 前缀); 801/801 全绿; tsc 0 错

## [v1.3.53]
- 2026-08-12 (VOICE-DEGRADE — 语音转码失败降级发文件 + api-coverage 自动拉 swagger)
- **P3-1 VOICE-DEGRADE (老板 6-12 16:36 偏好)**: mp3 语音转 silk 失败 → 降级为文件消息 (不再报错)。
  - `send/msg.ts sendVoice`: 转码失败 → `sendFileViaAppFromUrl` 发文件 (sendFile 逻辑抽成闭包复用)
  - `dispatch/outbound.ts sendVoice`: 转码失败 → 下载 voice URL → sendFileViaApp 发文件 → 入库; 文件降级也失败才整体失败
  - 绝不给 `/Msg/SendVoice` 传 mp3 (vendor 只收 silk); 用户拿到可播放的音频文件, 不是啥都拿不到
  - 新增 `tests/send-voice-degrade.test.ts` (2 用例: mp3 降级发文件 + silk 仍透传)
- **P2-1 api-coverage 自动拉 swagger**: `/tmp/swagger-latest.json` 缺失时自动从 vendor (127.0.0.1:8062) 拉取落盘; 拉不到才 t.skip (环境性跳过, 不再硬 fail 3 个)
- **测试**: 795 全跑 792 pass + 3 skip (swagger 缺失时); tsc 0 错

## [v1.3.52]
- 2026-08-12 (SILK-ONLY — 语音只接受 silk, mp3 强制转码 + main agent 会话纪律文档化)
- **语音只接受 silk (v1.3.52 SILK-ONLY)**: vendor `/Msg/SendVoice` 只收 silk (Type=4)。
  - `send/msg.ts sendVoice` 唯一收口: silk 输入 (data:audio/silk/.silk) 直接透传 Type=4; **mp3/其它强制转码** (silk-encoder), 不再有 Type=2 MP3 直传路径 (8-12 老板反馈"频繁尝试 mp3 格式"根因).
  - `outbound.ts sendVoice` 去掉"转码失败降级 raw mp3" — 现在转码失败直接失败 (降级=必被 vendor 拒收).
  - `silk-encoder.ts encodeMp3ToSilk` 加 silk 透传分支 (输入已是 silk 不再 ffmpeg 重编码).
- **测试修复**: 5 个 v1.3.47 FILENAME 假红测试 (坏 mock: 源码 dynamic import 无法被 `wppChannelPlugin.dispatchSendMessage` 属性拦截) → 抽 `inferFileNameForMedia` 纯函数 + 直接单测.
- **版本同步**: constants.ts / package.json / openclaw.plugin.json = 1.3.52 (修 gateway-compat 测试).
- **main agent WPP 会话纪律 (文档+流程)**: main/wpp-wechat 两份 workspace AGENTS.md 加会话归属铁律 (WPP 会话只归 wpp-wechat; main 禁止直接发微信/创建 `agent:main:wechatpadpro:*` 会话).
- **测试**: 793 全跑 790 pass (3 个 api-coverage 需联网 swagger, 环境性失败); tsc 0 错.

## [v1.3.42]
- 2026-08-11 (COMMENT-REPLYCOMMNETID — comment replyCommnetId 类型 bug 修复 + 工具描述修正)
- **P0 bug 修复**: `comment()` replyCommnetId 默认 `""` → `0`. vendor Go 端 int32 字段传空字符串 unmarshal 报错
  (`json: cannot unmarshal string into Go struct field CommentParam.replyCommnetId of type int32`), 实测确认.
- **工具描述修正**: commentFriendCircle "commentType: 1=文字, 2=表情" → "1=点赞, 2=文本评论" (对齐 vendor 语义: 1点赞 2文本 3消息 4with 5陌生人点赞)
- **防误调**: 描述警示勿用 likeFinderPost 点赞朋友圈 (那是视频号 Finder 工具, 接口完全不同)
- **测试**: tests/friendcircle-comment-replycommnetid.test.ts (3 用例); 全部 739 测试 pass (3 个 api-coverage 需联网 swagger, 环境性失败)

## [v1.3.41]
- 2026-08-11 (FRIENDCIRCLE-GUARD — 朋友圈发布控制)
- **friendCirclePublishEnabled 默认 false**: 防止任何人发朋友圈; admin 白名单 (AllowFrom 优先)
- **agent-tools 移除 3 发布工具** (publishFriendCircle/publishImageCircle/publishVideoCircle), 防 AI 误调
- **坑**: adminUsers 原只含机器人自己, 启用后老板发不了必须补 q139198824
- **测试**: tests/friendcircle-guard.test.ts (guard 注入 getCfg 测试)

## [v1.3.40]
- 2026-08-11 (FILEHELPER-COMMANDS — filehelper 命令注册表 + 白名单增删)
- **命令注册表**: FILEHELPER_COMMANDS 集中定义 {name,desc,example,handler}, /help 自动遍历生成 (新增命令自动兼容)
- **6 命令**: /genpair /pairs /adduser /deluser /addgroup /delgroup + /help
- **config.ts 新增**: removeAllowFrom + removeGroupAllowFrom (同 append 原子写范式)
- **测试**: tests/filehelper-commands.test.ts (3 用例) + inbound filehelper 命令测试; 731/731 全绿

## [v1.3.39]
- 2026-08-11 (FILEHELPER — filehelper 特殊会话命令处理)
- **只处理命令, 非命令仍过滤** (老板明确): parser 放行 filehelper+`/` 开头, handler 拦截命令不进 AI
- **peerId 修正**: filehelper 会话 peerId=filehelper (原用 senderId 无法识别)
- **命令**: /genpair 生成配对码 + /pairs 查看 (回发 filehelper)
- **732/732 全绿**

## [v1.3.38]
- 2026-08-11 (GEWE-BORROW — 借鉴 gewe 设计)
- **pending-reply 路由 Map**: src/dispatch/pending-reply.ts (触发记录 msgId→群路由, AI 回复防误发 DM, 跨账号 fallback)
- **attachments 数组兼容**: send-message.ts resolveMediaFromAttachments (att.media/path/url 优先)
- **评估确认**: chunker 已有 (chunkMarkdown), 多账号已完善 (AccountRegistry)
- **731/731 全绿**

## [v1.3.37]
- 2026-08-11 (RELAY-PARSE — 接龙解析增强)
- **单行接龙** (无换行) + **条目内换行** (非 N. 行合并上一条)
- **保守不猜昵称** (老板指正: 昵称可改删, 整段保留让 AI 理解)
- **715/715 全绿**

## [v1.3.36]
- 2026-08-11 (WPP-ORIG-OSS — wpp 原本文件适配)
- **media-oss.ts 适配 buildOssKey** (漏适配, 原 wpp/v1 旧格式)
- **199 个 wpp 原本文件按 LastModified 归档** 到 wpp/default/{type}/{date}
- **712/712 全绿**

## [v1.3.35]
- 2026-08-11 (OSS-STRUCTURE — OSS 结构统一)
- **OSS 结构**: `wpp/{account}/{type}/{date}/{file}` (buildOssKey helper)
- **gewe 1120 文件迁移** 到 wpp/default + 647 文件按 gewe 消息时间补日期归档
- **DB 路径更新**: 29 条 gewe 引用 → wpp/default
- **712/712 全绿**

## [v1.3.34]
- 2026-08-11 (CONTACTS-TABLES — 三表同步 + gewe 消息迁移)
- **三表同步**: wpp_contacts(20) + wpp_chatrooms(8) + wpp_chatroom_members(86) + sync-contacts.ts
- **gewe 聊天记录 6025 条全量迁移** 到 wpp_messages (msg_type 映射 + direction 推断)
- **wpp-identity 改查表** (本地秒级)
- **712/712 全绿**

## [v1.3.33]
- 2026-08-11 (GROUP-MENTION-REPLY — 群聊回复 @ 被回复人)
- **buildGroupMentionPrefix**: 群聊引用回复加 @昵称 (gewe 范式)
- **704/704 全绿**

## [v1.3.32]
- 2026-08-11 (NO-REPLY-FIX — NO_REPLY 最终修复)
- **群聊上下文提示加"必须回复禁 NO_REPLY"** (core silentReplyPromptMode 无法改, 改 prompt 文案)
- **686/686 全绿**

## [v1.3.31]
- 2026-08-11 (REPLY-ALWAYS — 群@一律回复)
- **classifyGroupIntent 改"有文字一律 topic"** (纯@才 no-op)
- **707/707 全绿**

## [v1.3.30]
- 2026-08-11 (SETUP-DIAGNOSE — 配置引导完善)
- **setup add 补 8 字段** (llmIntent/embedIntent/groupContext细节) + **diagnose 命令**
- **GETTING_STARTED 18 字段字典**
- **707/707 全绿**

## [v1.3.29]
- 2026-08-11 (PUBLISH-VIDEO — 视频朋友圈发布)
- **publishVideo + publishVideoCircle 工具** (UploadVideo→publishItem→Messages video)
- **704/704 全绿**

## [v1.3.28]
- 2026-08-11 (PUBLISH-IMAGES — 图片朋友圈发布)
- **publishImages + publishImageCircle 工具** (UploadImage→publishItem→Messages images)
- **702/702 全绿**

## [v1.3.27]
- 2026-08-10 (AUDIT-FIXES — 三项修复)
- **BigInt 序列化** (stringifyLargeInts 移 util/bigint.ts) + **safe-fetch 3 AI 域名白名单** + **media-enrich 拆 6 子模块**
- **698/698 全绿**

## [v1.3.26]
- 2026-08-10 (LISTACCOUNTIDS-SYNC — 同步契约修复)
- **listAccountIds async→sync** (OpenClaw health 同步调用 + spread 展开; v1.1.10 漏掉的第 2 个函数)
- **681/681 全绿**

## [v1.3.25]
- 2026-08-10 (SWAGGER-254 — 适配最新 vendor 接口, 老板拍板)
- **背景**: vendor swagger 236 → 254 (新增 18 接口); 老板审阅: 除 Admin 3 + /User/GetAllOnline, 其余全需适配
- **新增 send wrapper (17)**: FriendCircle 5 (UploadVideo/UploadImage/UploadImages/MessagesRaw/SetBackgroundImage) + Search 5 (Capabilities/Gateway/Query/Service/{name}/Services) + TenPay 5 (Collectmoney/ConfirmPreTransferApi/GeneratePayQCode/GetRedPacketListApi/WXCreateRedPacketApi) + Tools 2 (DownloadFileBinary/DownloadVoiceBinary)
- **新增 agent-tools (17)**: uploadCircleVideo/uploadCircleImage/uploadCircleImages/publishCircleRaw/setCircleBackgroundImage + searchCapabilities/SearchServices/searchGateway/searchQuery/searchService + collectMoney/confirmPreTransfer/generatePayQCode/getRedPacketList/createRedPacket + downloadFileBinary/downloadVoiceBinary
- **注册 WPP_VENDOR_ENDPOINTS**: 231→250 (补 19, 含 SendApp 仅登记; Admin 3 + GetAllOnline 保持排除)
- **测试**: api.test 总数 238→255; api-coverage 指向 swagger-latest.json (254 paths)
- **672/672 全绿**; 图片/视频朋友圈新接口就绪待测

## [v1.3.24]
- 2026-08-10 (FRIENDCIRCLE-UPLOAD-FIX — 朋友圈 Upload 工具语义修正)
- **老板质疑**: "/FriendCircle/Upload 从命名看像是上传才对" — 实测确认正确
- **证据**: swagger summary 误写"下载CDN视频", 实际传 base64 报 "朋友圈图片上传失败" + 返回 StartPos/TotalLen/Type (分片上传进度), Type:2=图片
- **修复**: friendcircle-meta downloadCircleMedia → **uploadCircleMedia** (key + base64, 上传语义); send/friendcircle upload 参数 url→base64; 测试更新
- **朋友圈媒体结论**: 图片 URL 可访问 (HTTP 200); 视频 (shzjwxsns.video.qq.com 腾讯CDN) 需微信登录态, 纯 URL 400, 无下载接口 — 待问 vendor
- **679/679 全绿**

## [v1.3.23]
- 2026-08-10 (VENDOR-TRANSCRIPT — 语音转写优先用 vendor 自带, 老板拍板)
- **问题**: 老板在 WS 看到语音消息带 `voice.transcript` + `transcription_provider: wechat_official` — vendor 已转写
- **根因**: 插件 enrichVoiceMessageFromV1 强制调 SiliconFlow STT, 不检查 vendor transcript → 重复转写 (费 token + 慢)
- **修复**: enrichVoiceMessageFromV1 加可选 vendorTranscript 参数; 有则直接返回 filename=transcript (不下载不STT); handler 透传 raw.voice.transcript
- **测试**: media-enrich.test.ts +2 (有/无 vendor transcript)
- **679/679 全绿**; 实测: vendor transcript 直接生效

## [v1.3.22]
- 2026-08-10 (SELF-MEDIA-OSS — 自己发的媒体消息传 OSS + 入库, 老板拍板)
- **老板需求**: "自己发的消息即使不进入 session, 也要正常进入数据库, 便于聊天记录查找; 媒体文件要正常上传 OSS" (参考 gewe downloadAndUploadToOss)
- **新 src/dispatch/media-oss.ts**: uploadMediaToOss(buffer, type, ext, credentialsPath?) — OSS 上传 (ossutil + ~/.openclaw/credentials/oss-credentials.json), key `wpp/v1/<type>/<md5>.<ext>`; 失败返回 null 降级不阻塞发送
- **outbound.ts**: sendImage/sendVoice/sendVideo 发送前取 base64 → 上传 OSS → persistOutbound 入库 content 用 **OSS 公网 URL** (替代源 URL, 便于查聊天记录/引用)
- **parser.ts**: 放行 outgoing 图片 (kind=image/msgType=3, 拿真实 server ID) — 其余 outgoing 仍过滤; WppInboundMessage 加 direction; enrich 用 msg.direction 入库
- **测试**: outbound-persist.test.ts +2 (uploadMediaToOss 无凭证降级) + parser-business-cb +3 (outgoing 图/文本/incoming 图)
- **677/677 全绿**; 实测: 发图入库 content = `https://openclaw-a.oss-cn-hangzhou.aliyuncs.com/wpp/v1/images/<md5>.jpg` ✅

## [v1.3.21]
- 2026-08-10 (REVOKE-FIX — 撤回能力修复, 老板实测驱动)
- **问题**: 老板实测"发消息到群再撤回" — 插件 revokeMsg 返回 ok:true 但消息没撤 (ret=0 不真撤)
- **根因 1 (NewMsgId 解析)**: vendor SendTxt 响应 `Data.List[0].NewMsgId`, 插件 sendText 用 `d.msgId/d.newMsgId` → 恒 undefined → 撤回拿不到 ID
- **根因 2 (NewMsgId 类型)**: RevokeMsgParamDoc 全 int64 — vendor Go 拒绝 string (Code=-8 `cannot unmarshal string into ... uint64`), 必须传 number
- **根因 3 (CreateTime)**: 必须用**消息自己的 server time** (List[0].Createtime), 不能用 now! 实测 now → vendor ret=0 但不真撤; server time → 真撤 + 推送 type=10002 撤回事件
- **修复**: 新 extractOutboundMsgIds 解析 List[0].NewMsgId/ClientMsgid/Createtime; sendText 返回 newMsgId+createTime; revokeMsg 加可选 createTime 透传 (msg.revoke/api-client.revokeMsg/types.ts); sendMessage 透传 createTime; agent-tools revokeMsg 工具加 createTime 参数
- **测试**: tests/outbound-persist.test.ts +4 (extractOutboundMsgIds List[0]/顶层/空 + persistOutboundMsg 入库 newMsgId); **672/672 全绿**
- **验证**: 插件真实链路 sendMessage 发 → revokeMsg(createTime=server) → vendor 推送 10002 撤回事件 ✅

## [v1.3.20]
- 2026-08-10 (SWAGGER-GAPS-P1P3 — 补齐 swagger 有业务价值的未接 AI 工具, 老板拍板)
- **P1 Group 群管理 3**: facingCreateChatRoom (创建面对面群, 对齐 swagger number 经纬度) / getGroupListCompat (GET 兼容路由群列表) / scanIntoGroupEnterprise (扫码进群企业)
- **P2 FriendCircle 2 + TenPay 4**: syncFriendCircleSns (查询评论转发ID) / downloadCircleMedia (下载朋友圈CDN媒体, wrapper upload 对齐 swagger key+url) / openRedPacket / queryRedPacketDetail / receiveRedPacket / getEncryptInfo (红包4件套)
- **P3 OfficialAccounts 6 + Finder 6**: likeOfficialAccountArticle / preVerifyOfficialAccountJsapi / getOfficialAccountA8Key / authorizeOfficialAccount / requestOfficialAccountQrAuthorize / confirmOfficialAccountQrAuthorize; decryptFinderComment / getFinderMsgSessionId / searchFinderList / getFinderTopicList / getFinderCommentList / getFinderCommentDetail
- **规范**: 全部走 lazy-evaluate ctx (v1.3.18 模式) + typebox schema + vendor 字段对齐 (PascalCase)
- **测试**: 新 tests/agent-tools-gaps.test.ts +21 (MockAgent 验证正确端点+参数); api.test 函数数不变 (send wrapper 未增, 只加 meta)
- **668/668 测试全绿**; AGENT_TOOLS_META 158→179

## [v1.3.19]
- 2026-08-10 (UNIFY-SEND + MODULAR — 收口层重构, 老板拍板)
- **Step 1 endpoint 索引**: 新 `docs/ENDPOINT-INDEX.md` (390 行, 236 endpoint → send/<tag>.ts + agent-tools/<tag>-meta.ts 映射, 含入库类型列 + 覆盖标记 + 有意移除清单); 生成脚本 `scripts/gen-endpoint-index.py` (读 swagger 可重新生成)
- **Step 3 misc-meta 拆分**: 7 个小 tag (favorites/label/voice/sayhello/translate/customized/qwcontact) 从 misc-meta.ts 拆成独立文件, misc-meta.ts 降级兼容 barrel; agent-tools 21 tag 全部独立对齐 swagger
- **Step 2 双实现收口**: 
  - api-client.ts 降级**薄 adapter** — Msg/Group/Friend/Webhook 方法委托 send/<tag>.ts (makeWppMsg/Group/Friend/Webhook)
  - send/msg.ts 增强: 新 sendImage (URL/base64→UploadImg), sendVoice/sendVideo URL→base64 对齐, dispatch 加 persist 参数
  - **persist:false 防双入库** — apiClient 委托不入库, outbound.ts 的 persistOutbound 负责 (agent-tools 默认 persist:true 收口入库)
  - resolveImageToBase64/readLocalMedia 移到 src/api/resolve-media.ts (消除 msg↔api-client 循环依赖), api-client re-export 兼容测试
- **测试**: 新 tests/unify-send.test.ts +5 (委托端点/行为/persist 防双入库); api.test.ts 函数总数 236→237 (sendImage)
- **647/647 测试全绿**; 备份待部署后记录

## [v1.3.18]
- 2026-08-10 (FULL-FIX — 完整修复 openclaw 独立审计 20 项, 报告 /root/audit-reports/2026-08/wechatpadpro-openclaw/v1.3.18-full-fix-2026-08-10.md)
- **P0-B-1**: 测试污染防护 — dispatcher-group-context beforeEach unset MINIMAX_API_KEY/BAILIAN_EMBEDDING_API_KEY
- **P1-核心1**: agent-tools 13 meta 文件空 ctx 根治 — lazy-evaluate getXxxApi (从 registry 拿真 ctx), 入库 account_id 不再 ""
- **P1-核心2**: getMessageByMsgIdOrNewId 加 direction 参数 (默认 inbound, 引用解析传 "any") — 引用 bot outbound 回复可定位
- **P1-核心3**: outbound 发送判据统一 isSendOk (Code + Data.BaseResponse.ret 双重判据) — 5 处 send + sendImage 先判后 persist 修假记录
- **P1-安全1**: readLocalMedia 三重防御 (拒绝 `..` + path.resolve 归一化 + 精确包含校验) 防路径穿越
- **P1-安全2**: 新 src/util/safe-fetch.ts (host 白名单 + 字节 cap), 5 处改 safeFetchWithCap (50MB/100MB)
- **P1-安全3 + B-8**: webhookSecretEnv 真接入 config.ts/config-helpers.ts — HMAC 验签不再死配
- **F6**: webhook-receiver + ws-client 改 parseJsonText — 16+ 位大整数防丢精度
- **F1/F4/F5**: 媒体下载字节 cap; **F2**: 视频分片 totalBytes > 200MB 封顶 (原按段数 200 段只防 ~50MB)
- **P2-B-3**: openclaw.plugin.json schema 补 10 字段 (33→43); **P2-B-6**: config.json hot-reload (watchGlobalConfig)
- **P2-D-1**: setup-wizard prod 误跑防护; **P3-B-7**: 删 src/dead-code 3 文件
- **测试**: 删 2 个假绿 (shouldquote-text-only + inbound.test.ts:364 assert.ok(true)); 新 v1.3.18-core-correctness.test.ts (9) + inbound-media-enrich-v1.test.ts (8); pending-enrich 真测化
- **642/642 测试全绿** (干净环境); tsc 0 错
- 备份: /data/wpp-fullfix-v1.3.18-20260810-151517/

## [v1.3.17]
- 2026-08-10 (MESSAGE-UNIFY — 统一 sendMessage 发送适配)
- **老板拍板**: "让发送各种类型消息都能完美适配 message 方式, 以便以后网关各种调用"
- **新 src/dispatch/send-message.ts**: `sendMessage({accountId, toWxid, type, content, ...})` 统一入口, 路由 10 类型:
  - text/image/video/voice → outbound.ts (api-client + persistOutbound, 处理 chunk/base64/thumb)
  - file/link/card/location/miniprogram/emoji → makeWppMsg (registry 真实 ctx + dispatch 收口入库)
  - `normalizeSendResp` 统一返回 {ok, msgId(string), error}; msgId 统一 String() 归一化
- **channel**: wppChannelPlugin.sendMessage(params) 暴露给网关 (动态 import, 零启动开销)
- **agent-tools**: 新 `sendMessage` 工具 (AI 可用统一入口; 从 registry 拿真实 ctx, 不走模块级空 ctx → 真正可发送, **本次仅 sendMessage 单工具修, 其它 13 个 send\* 工具 (finder/friend/friendcircle/group/login/misc/msg/officialaccounts/search/tenpay/tools/user/webhook/wxapp 域) 仍空 ctx, v1.3.18 B-2 根治**)
- **测试**: 新 tests/send-message.test.ts +7 (normalizeSendResp / text/image/video/voice 路由 / 未知type / 账号不存在)
- **632/632 测试全绿** (干净环境: unset MINIMAX_API_KEY BAILIAN_EMBEDDING_API_KEY 验证; 污染环境下 v1.3.15 测试 fail 1/632 — v1.3.18 B-1 修)

## [v1.3.16]
- 2026-08-10 (OUTBOUND-PERSIST — 任意渠道发送消息入库)
- **老板拍板**: "机器人回复、通过api发送、message发送等任意渠道发送到微信的消息, 都应该入库, 因为我又可能需要引用这些消息"
- **缺口**: (1) quoteReply (AI 引用回复主路径 sendAiReply 有引用时) 直接调 vendor 未入库; (2) agent-tools msg 域 14 个 send 工具走 makeWppMsg 未入库; (3) sendFile (内部走 api-client sendFileViaApp) 未入库
- **msg.ts**: 新 `persistOutboundMsg(ctx, {toWxid,msgType,content,resp})` 统一入库 (Code≠0 失败不入库); dispatch 统一收口 `outboundMetaFor` 端点→msgType+content 映射 (SendTxt/CDNImg/UploadImg/CDNVideo/Video/ShareVideo/Voice/CDNFile/Emoji/ShareCard/ShareLink/ShareLocation/SendXCX); sendFile 成功后单独入库
- **quote-reply.ts**: 引用回复成功后 `persistQuoteReply` 入库 (msgType="quote")
- **安全**: agent-tools 空 ctx 工具发送失败 (Code=-1) → persistOutboundMsg 跳过, 不会误入库; outbound.ts (api-client) 与 makeWppMsg 不同实现, 不重复入库
- **测试**: 新 tests/outbound-persist.test.ts +7 (端点映射 / 成功入库 / 失败不入库 / 群 peer_kind / 缺 msgId 仍入库)
- **625/625 测试全绿**

## [v1.3.15]
- 2026-08-10 (GROUP-CONTEXT-NO-FORCE — 群聊不强拉上下文, 智能判断按需参考)
- **老板拍板**: "回到之前不指定引用的触发情况。优先带@机器人的触发消息本身内容, 可根据需要智能判断是否参考上下文的内容, 而不是强制拉上下文内容"
- **根因**: buildGroupContextFromDb 两条"强制拉"路径 — (1) LLM 判断失败(null) → 降级注入全部; (2) topic 意图 + 无 LLM key → msgs 保持全量。AI 被无关上下文带偏
- **dispatcher.ts**: (1) LLM decision null → 保守降级: media 意图兜底只注入媒体 / topic 意图不注入; (2) topic + 无 LLM/embedding key → 不注入; 加 embedSelected 标志区分"embedding 已选好"与"LLM 失败"
- **触发消息本身内容** 始终在 Body 第一位 (buildCtxPayload body=msg.content), 上下文是智能判断后的补充
- **测试**: dispatcher-group-context +1 (topic 不强拉); 改造 4 个旧测试用 media 意图保留群内媒体/@指定/图片≤3/群间隔离语义; pending-enrich beforeTs 改 media 触发
- **618/618 测试全绿**

## [v1.3.14]
- 2026-08-10 (QUOTE-FORCE-CONTEXT — 群聊引用消息 = 明确指定上下文)
- **老板拍板**: "群聊状态下, 触发机器人的消息中使用了引用消息, 就表示指定了对应的消息加入上下文, 没必要再去看其它的上下文"
- **根因** (老板实测 "AI 依然去找其它的图"): v1.3.5 resolveReferencedMessage 把被引用消息 prepend 进 msgs 后, 后续 embedding/LLM filter 可能把它**再过滤掉** → AI 看不到被引用消息, 反而注入其它图
- **dispatcher.ts**: buildGroupContextFromDb 开头先 resolveReferencedMessage → 查到即短路, 只走新 buildReferencedContextLines (只注入被引用 1 条, 跳过窗口查询 + embedding/LLM); 被引用消息含 [文件] → 仍引导 document-extract
- **测试**: dispatcher-group-context.test.ts +2 (app.reference 引用 → 只注入被引用; reply_context 引用 → 只注入被引用); FakeDb 补 getMessageByMsgIdOrNewId 匹配
- **617/617 测试全绿**

## [v1.3.13]
- 2026-08-10 (FILE-SEND — 文件发送正确链路, 方案 C)
- **问题** (老板实测): SendCDNFile Content 各种格式 (mediaId/file_no/aeskey/XML) 全 Ret=-2 (vendor 未实现); SendApp type=6 可发可打开但有"未审核应用"标签
- **api-client.ts**: 新 `sendFileViaApp` — UploadFile 上传 → ShareLink type=6 完整文件 XML (content dataType + appattach attachid)
- **msg.ts**: 新 `sendFile(toWxid, fileUrl, fileName)` — 下载 OSS → sendFileViaApp (返回 WppApiResponse)
- **agent-tools**: 新 `sendFile` 工具 (推荐); sendCDNFile 保留 (转发, vendor Ret=-2)
- **types.ts**: WppApiClient 加 sendFileViaApp
- **测试**: api.test.ts 函数总数 235→236 (+sendFile)
- **615/615 测试全绿**

## [v1.3.12]
- 2026-08-10 (LOCATION-FIX — 分享位置坐标语义修正)
- **问题** (老板实测): 分享位置定位卡片缩略图与实际位置不一致
- **根因**: ShareLocation X/Y 语义 — X=纬度, Y=经度 (对齐 gewe buildLocationPayload x=lat,y=lng)
- **msg.ts**: shareLocation 参数改名 latitude/longitude + 注释明确语义 + Poiname 支持 + Scale=16
- **实测**: 天安门 X=39.9(纬度), Y=116.4(经度) → 显示正确 (老板确认"现在对了")
- **615/615 测试全绿**

## [v1.3.11]
- 2026-08-10 (VIDEO-CHUNK — 视频分片下载修复)
- **bug**: DownloadVideo 返回 Data.data.buffer (分片), 但 enrichVideoMessageFromV1 读 Data.Video → miss, 视频无 OSS URL
- **media-enrich.ts**: enrichVideoMessageFromV1 改为**分片循环**拉全视频 (section.start_pos 递增到 totalLen)
  - 读 Data.data.buffer + totalLen; 防死循环上限 200 段; 兼容 Data.Video 字段
- **实测**: 21050 视频 (4.7MB, msg_id=1020959037) 下载凭证正确
- **615/615 测试全绿**

## [v1.3.10]
- 2026-08-10 (BASE64-FIX — resolveImageToBase64 纯 base64 误判本地路径修复)
- **bug**: 缩略图 base64 (含 / 字符) 被 resolveImageToBase64 误判为本地路径 (case 4 在 case 5 前)
- **api-client.ts**: 纯 base64 判断 (长度≥16 + 字符集 + %4==0) 提前于本地路径判断
- **实测**: 视频发送到群成功 (msgId=848527519) + 缩略图自动生成 (197KB base64)
- **615/615 测试全绿**

## [v1.3.9]
- 2026-08-10 (VIDEO-THUMB — 发视频自动生成缩略图, 老板拍板)
- **需求** (老板): 微信端发视频必须带缩略图才显示 → AI 发视频时自动生成
- **outbound.ts**: 新 `generateVideoThumbnailBase64(urlOrPath)` — ffmpeg 抽首帧 → JPEG base64 (失败返回 null 不阻塞)
  - sendVideo: thumbUrl 缺省时自动抽帧生成 → ImageBase64 (apiClient.sendVideo resolveImageToBase64 对纯 base64 透传)
- **实测**: ffmpeg 6.1 抽帧成功 (5.7KB 视频 → 3.9KB 缩略图)
- **615/615 测试全绿**

## [v1.3.8]
- 2026-08-10 (VIDEO-DOWNLOAD — 适配新版视频 video.download_context)
- **问题** (老板测视频): 新版视频 content 无 <videomsg> XML, 旧 enrich 条件不匹配 → 视频无 OSS URL
- **media-enrich.ts**: 新 `isV1SchemaVideo(raw)` + `enrichVideoMessageFromV1(ctx, videoCtx)`
  - video.download_context { msg_id, data_len, section, to_wxid } → /Tools/DownloadVideo (authcode query + TokenKey header) → base64 → OSS
- **handler.ts**: 视频 enrich 2 级路径: DownloadVideo (v1.3.8) → <videomsg> XML 兜底
- **615/615 测试全绿** (无新测试, 逻辑同图片/语音模式)

## [v1.3.7]
- 2026-08-10 (NEW-MSG-ID-COLUMN — 修复 v1 消息 new_msg_id 未入库)
- **根因** (老板问"媒体/文件入库时是否带唯一字段"): parseV1Message 的 `newMsgId` 硬编码空 → DB new_msg_id 列为空, 引用定位只能靠 msg_id 列兜底
- **parser.ts**: parseV1Message 提取 `msg.new_msg_id`/`msg.svr_id` (snake_case) → newMsgId 入库 (不再硬编码空)
  - DB new_msg_id 列现在正确填充 → 引用定位更精确 (app.reference.new_msg_id 匹配 new_msg_id 列而非 msg_id 列)
- **测试**: parser-business-cb.test.ts +2 (v1 new_msg_id 提取 / 无 new_msg_id 不崩)
- **615/615 测试全绿**

## [v1.3.6]
- 2026-08-10 (QUOTE-APP-REFERENCE — 引用消息定位修复, 被引用信息在 app.reference)
- **根因** (彻底定位, 参考 gewe): 新版 vendor 引用消息的**被引用信息在 app.reference** (category=quote), 不在 reply_context!
  - 实测: app.reference.new_msg_id 精确匹配 DB msg_id 列 → 被引用图
- **quote.ts**: 新 `extractReferencedFromApp(raw)` — 解析 app.category=quote + app.reference (new_msg_id/svr_id/msg_type)
- **dispatcher.ts**: resolveReferencedMessage 首选 app.reference (new_msg_id/svr_id 查 DB) → 优先注入被引用消息
- **handler.ts**: 引用处理首选 app.reference → content 注入被引用媒体 URL
- **测试**: quote-xml.test.ts +2 (extractReferencedFromApp)
- **613/613 测试全绿**

## [v1.3.5]
- 2026-08-10 (QUOTE-REPLY-CONTEXT — 引用消息修复, 被引用旧图优先注入)
- **问题** (老板实测): 引用 10 条之前的旧图, AI 看的是 embedding 选的最近图, 没看到被引用图
- **根因**: 新版 vendor 引用走 `raw_payload.reply_context`, 插件只认 content `<refermsg>` XML → 引用解析缺失; 被引用旧图窗口外 embedding 选不到
- **quote.ts**: 新 `extractReferencedFromReplyContext(raw)` — 解析 reply_context (msg_id/svr_id/quote_content/msg_type)
- **dispatcher.ts**: `resolveReferencedMessage(msg)` — 多种方式定位被引用消息 (svr_id/new_msg_id/local_id 匹配 DB) → 查到优先注入 AI 上下文 (即使窗口外)
- **handler.ts**: 引用处理补 reply_context 路径 (旧 `<refermsg>` + 新 `reply_context` 双支持) → content 注入被引用媒体 URL
- **测试**: quote-xml.test.ts +2 (extractReferencedFromReplyContext)
- **611/611 测试全绿**

## [v1.3.4]
- 2026-08-10 (GROUP-MEDIA-PRIORITY — 群聊上下文群内最近媒体优先, 老板拍板)
- **问题** (老板新要求): 最新媒体文件权重最高, 不限本人发的; 没明确指定时只看最近 10 条
- **dispatcher.ts**: buildGroupContextFromDb 查询从"触发人最近 window 条"改"**群内最近 window 条 (不限发送人)**"
  - 去掉 fromWxid 过滤 + 去掉 @指定额外查 (群内查询已含所有人)
  - 媒体全保留 (v1.3.3 已有) + embedding 只筛文本
  - 上下文注入带发送人 (from_wxid)
- **测试**: dispatcher-group-context "按人查" 改 "群内查" (含 bob 的上下文)
- **609/609 测试全绿**

## [v1.3.3]
- 2026-08-10 (EMBED-MEDIA-PRIORITY — embedding 快路径媒体优先, 修复文件被挤掉)
- **问题** (老板实测): 群聊发图+文件+"看看", embedding 按相似度选 top-5, 文档.pdf 被图片/语音挤掉, AI 没看到文件
- **intent-embed.ts**: selectTopNByEmbedding 媒体候选 (文件/图片/语音/视频) **优先全部保留**, embedding 只对纯文本候选做相似度筛选
  - mediaIds 全保留 + 文本按相似度补足到 topN
- **测试**: intent-embed.test.ts +1 (媒体优先, 文件/图不被挤掉)
- **609/609 测试全绿**

## [v1.3.2]
- 2026-08-10 (EMBED-INTENT — embedding 快路径 + LLM 兜底混用, 老板拍板)
- **优化**: v1.3.1 纯 LLM 意图判断每次 @ 调模型 (1-2s); 混用让非命令意图走 embedding 快路径 (ms)
- **新 src/dispatch/intent-embed.ts**:
  - `embedTexts`: 阿里 dashscope text-embedding-v4 (OpenAI 兼容) 批量向量化
  - `cosineSimilarity`: 余弦相似度纯函数
  - `selectTopNByEmbedding`: 候选向量化 (缓存) + 触发向量 → 相似度 top-N (阈值 0.3)
  - `isCommandIntent`: 命令词 (删/发/转/帮) → 走 LLM (embedding 判断不了)
- **dispatcher.ts 混用流程**:
  - 规则预筛 (no-op 不调) → 命令类 → LLM → 非命令 → embedding 快路径
  - embedding 无相关/失败 → LLM 兜底 → 降级注入全部
  - embedIntentEnabled(默认true)/embedIntentTopN(5)/embedIntentThreshold(0.3) 配置
- **types.ts**: WppAccountConfig 加 embedIntent 配置
- **测试**: intent-embed.test.ts (相似度/命令类/选topN/降级)
- **608/608 测试全绿**

## [v1.3.1]
- 2026-08-10 (LLM-INTENT — 群聊上下文用 LLM 智能判断注入, 老板拍板)
- **问题** (老板观点): 群聊 @ 机器人应智能判断意图, 不是把最近 10 条全喂 AI
- **新 src/dispatch/intent-llm.ts**: MiniMax LLM 意图判断
  - `normalizeTriggerText`: 去@/去媒体标记/语音[转写]当文本 (语音当文本, 老板观点)
  - `summarizeContent`/`toIntentCandidate`: 候选压缩 (msg_id+类型+≤50字摘要)
  - `decideIntentWithLlm`: 调 MiniMax-M2.5 (temperature=0, 5s超时) → JSON {action:no-op|inject,relevant_ids}
  - `parseIntentResponse`: 剥围栏 + 校验; `needsLlm`: 纯@/≤4字不调 LLM (省)
  - 防注入: 触发文本 JSON.stringify 包裹 + system 声明数据非指令 + 只消费受限字段
- **dispatcher.ts**: buildGroupContextFromDb 集成
  - 规则预筛 (no-op 拦截) → LLM 判断注入哪些候选 → 失败降级注入全部
  - llmIntentEnabled(默认true)/llmIntentModel(默认M2.5)/llmIntentTimeoutMs 配置
  - 语音带[转写]当文本; 规则兜底 media/topic 过滤
- **types.ts**: WppAccountConfig 加 llmIntentEnabled/TimeoutMs/Model
- **测试**: intent-llm.test.ts (归一化/压缩/LLM调用/解析/预筛/语音当文本)
- **598/598 测试全绿**

## [v1.3.0]
- 2026-08-10 (GROUP-INTENT — 群聊触发消息智能意图判断, 按类型选择性注入, 老板拍板)
- **问题** (老板观点): 群聊 @ 机器人时, 把触发人最近 10 条非触发消息全部注入 AI, 不管用户意图 → 应智能判断
- **dispatcher.ts**:
  - 新 `classifyGroupIntent(content)`: 简单规则判断意图 (不用 LLM, 省模型调用)
    - no-op: 纯 @ / 极短 (≤4字, "你好"/"在吗") → 不注入上下文
    - media: 提到 文件/文档/图/图片/语音/视频/看这个/你看 等 → 只注入媒体消息
    - topic: 实质文本 → 注入最近文本 + 媒体
  - `buildGroupContextFromDb` 按意图: no-op 直接返回 null; media 过滤只留 `[图片]/[文件]/[语音]/[视频]` 消息
- **保留 v1.2.9**: 注入后含 [文件] → 文件读取引导
- **测试**: group-intent.test.ts (classifyGroupIntent 8 case: 纯@/短问候/文件/图片/语音/视频/话题)
- **588/588 测试全绿**

## [v1.2.9]
- 2026-08-10 (FILE-READ-GUIDE — 群聊上下文含文件时引导 AI 读取内容)
- **问题** (实测发现): 上下文注入文件 URL 后, AI 只调 image 看图, 不读文件 (xls/xlsx) — AI 不知道要读文件
- **dispatcher.ts**: `buildGroupContextFromDb` 注入后, 若上下文含 `[文件]` → 追加 `[系统提示-文件读取]` 引导
  - 明确告诉 AI: 用户@是为了处理文件, 用 document-extract/clawpdf 读 URL 内容
  - 禁止 find/ls 搜本地文件, 只用提供的 URL
- **测试**: 全量 580+ 全绿 (无新测试, 引导是纯文本注入)
- **580/580 测试全绿**

## [v1.2.8]
- 2026-08-10 (PENDING-ENRICH — 群聊发文件+@时等 enrich 完成, AI 能看到文件)
- **问题** (老板发现): 群聊发文件/图 + @机器人, AI 看不到文件。根因: 文件 enrich (DownloadFileBinary 下载大文件几秒) 慢 → 文件入库晚于 @ 触发消息 dispatch → buildGroupContextFromDb 查不到
- **handler.ts**:
  - 新 `pendingEnrichs` 追踪器 + `trackEnrich` (key=accountId:sender, 同 sender 串行)
  - `waitForPendingEnrich(accountId, sender, timeoutMs=10s)`: 触发 dispatch 前等同 sender enrich 完成 (超时降级)
  - 文件/图片/语音 enrich 包 trackEnrich
- **dispatcher.ts**:
  - `dispatchOne` 开头 `await waitForPendingEnrich` (触发前等)
  - `buildGroupContextFromDb` 查询加 `beforeTs: msg.ts` (排除触发消息自身, 避免空 @ 混入)
- **测试**: pending-enrich.test.ts (waitForPendingEnrich / beforeTs 排除触发)
- **580/580 测试全绿**

## [v1.2.7]
- 2026-08-10 (VOICE-DOWNLOAD-BINARY — 适配新版 vendor 语音 download_context)
- **背景**: 新版推送语音带 `voice.download_context` (endpoint DownloadVoiceBinary), content 无 <voicemsg> XML → 旧 STT 路径不匹配
- **media-enrich.ts**:
  - `isV1SchemaVoice` 提取 voice.download_context (msg_id/new_msg_id/client_msg_id/format/length/master_buf_id)
  - 新 `enrichVoiceMessageFromV1`: DownloadVoiceBinary → SILK 字节 → STT 转写 + OSS
- **handler.ts**: 语音 enrich 2 级路径:
  1. DownloadVoiceBinary (v1.2.7 首选)
  2. <voicemsg> XML → DownloadVoice (旧兜底)
- **实测**: 群聊语音 → DownloadVoiceBinary 4206 bytes SILK (#!SILK_V3) → STT "你好呀，我测试一下语音功能。" (2160ms)
- **测试**: file-download-binary.test.ts +2 (isV1SchemaVoice 提取)
- **579/579 测试全绿**

## [v1.2.6]
- 2026-08-10 (IMAGE-CDN-DOWNLOAD — 适配新版 vendor 图片 cdn_download_contexts, 完整大图)
- **背景**: 新版二进制推送带 `image.cdn_download_contexts` (file_aes_key + file_no + variant), 走 `/Tools/CdnDownloadImage` 拿**完整大图** (非旧 DownloadImg 64KB 截断)
- **media-enrich.ts**:
  - `isV1SchemaImage` 提取 `image.cdn_download_contexts` (优先 standard 变体) + md5
  - 新 `enrichImageMessageFromV1Cdn`: CdnDownloadImage → 完整 JPEG → OSS → 公网 URL
- **handler.ts**: v1 图片 enrich 2 级路径:
  1. CdnDownloadImage 完整大图 (v1.2.6 首选)
  2. DownloadImg 64KB 兜底 (旧路径)
- **实测**: 群聊图 → CdnDownloadImage HTTP 200 → 解码 256917 bytes **2160×3840 完整 JPEG** (之前 64KB 截断)
- **测试**: file-download-binary.test.ts +2 (isV1SchemaImage 提取 standard 变体)
- **577/577 测试全绿**

## [v1.2.5]
- 2026-08-10 (FILE-DOWNLOAD-BINARY — 适配新版 vendor DownloadFileBinary 完整文件下载)
- **背景**: 开发者提供新版二进制 (m4.1.12.29_p8.0.75.53), 新推送带 `file.download_context`, 新增 `/Tools/DownloadFileBinary` (完整下载, 返回原始字节流)
- **media-enrich.ts**:
  - `isV1SchemaFile` 提取 `file.download_context` (attach_id/user_name/data_len/endpoint)
  - 新 `enrichFileMessageFromV1Binary`: 调 DownloadFileBinary → 原始字节 → OSS → 公网 URL
    - **authcode 必须走 query** (header 报"缺少授权码", 实测)
    - TokenKey 走 header; body 含 section {start_pos, data_len}
    - 30s 超时 + 失败降级 (返回 error 不抛)
- **handler.ts**: v1 文件 enrich 3 级路径 (新优先):
  1. DownloadFileBinary 完整下载 (v1.2.5)
  2. MCP 兜底 (v1.2.0)
  3. 确定性回复 (禁 AI 猜路径)
- **实测**: 私聊发 pdf (入学入托.pdf, 129583 bytes) → DownloadFileBinary HTTP 200 完整下载 PDF 1 page
- **测试**: file-download-binary.test.ts (isV1SchemaFile 提取 / 缺 attach_id 报错)
- **573/573 测试全绿**

## [v1.2.4]
- 2026-08-10 (GROUP-CONTEXT-DB — 群聊上下文删内存缓冲, 触发时 DB 按人查, 老板拍板)
- **群聊上下文重构** (老板 3 轮拍板):
  - **删内存缓冲** (groupContextWindow Map + recordGroupContext 全删) → 所有消息已全量落 DB (enrichBatch), 触发时从 DB 查
  - **DB 按人查**: 触发时查 `wpp_messages` (peer_id=群ID + from_wxid=触发人) 最近 `GROUP_CONTEXT_WINDOW=10` 条注入
  - **@指定除外**: 触发消息 @ 别人 (extractAtUserList 除 bot) → 也查对应人
  - **图片 ≤3 张直接 MediaUrls 看图** (已实证主模型能看图), 超过丢最旧
  - **groupContextEnabled 开关** (默认 false, 显式 true 才注入群聊上下文)
- **DB 加 from_wxid 列** + idx_sender 索引 (群聊按人查历史):
  - schema.sql / saveMessage / getMessages(fromWxid 过滤) / rowToMessage / MessageRecord
  - applyMigrations: ensureColumn 幂等加列 + 旧行 raw_payload.sender_id 回填 (部署自动迁移)
- **不用视觉理解模型** (老板拍板): 删 vision.ts, 主模型能看图无需先理解
- **硬编码审查**: src/ 生产代码无昵称/wxid/群ID硬编码; 测试 @接晓银 中立化为 @bot
- **新测试**: dispatcher-group-context 重写 (DB 按人查 / @指定 / 图片≤3 / 开关 / 群间隔离)
- **572/572 测试全绿**

## [v1.2.3]
- 2026-08-10 (PAIRING — DM 配对码自助开白名单, 老板拍板从旧版 wechatpadpromax 移植, **强调不能与多账号冲突**)
- **src/pairing-store.ts** (新): per-account 配对码存储
  - 码 8 位 (字母表去 I/O/0/1) + TTL 1h + 一次性消耗 (unlink)
  - **per-account 文件隔离**: `~/.openclaw/credentials/wechatpadpro-pairing-<accountId>.json` → 多账号不串
  - `extractPairCode` 严格 `/pair <8位码>` 前缀 (老板拍板, 不误触发)
- **DM 兑换**: 用户私聊 `/pair <码>` → redeem 成功 → wxid 写进该账号 allowFrom (零重启生效)
  - `src/config.ts` `appendAllowFrom`: readFile round-trip 全字段 + 原子写 + invalidateConfigCache (绕开 60s LRU cache)
  - `src/index.ts` `handlePairingAttempt`: redeem → appendAllowFrom → **立即同步运行时** (registry.updateConfig + runtimeTriggerCtxs, 不等 fs.watch debounce)
  - `src/inbound/handler.ts` `onPairingAttempt` 回调拦截 (blocked DM + /pair)
- **默认关闭**: 需 accounts/<id>.json 显式 `"dmPairingEnabled": true` (老板拍板); 运行时可热切
- **⚠️ 顺带修复隐藏 bug** (handler.ts): `opts.allowFrom ?? triggerCtx.allowFrom` 对启动时已有白名单的账号永远走 opts 快照 → **配对/热重载写 allowFrom 到不了 shouldTrigger**。改为只认 live 的 triggerCtx (配对零重启生效前提)
- **CLI**: `npm run setup pair <accountId>` 生成配对码 (menu 加第 8 项)
- **多账号防冲突 7 道防线**: 配对文件不进 accounts/ (listAccountIds 会当账号注册) / allowFrom 写用 findPluginRoot()/accounts 与 watcher 同目录 / 绕开 LRU cache / redeem 校验 accountId / 只写对应账号 json / 写后立即同步 runtime / 配对消息落库 + dedup 防重放
- **新测试 4 文件 +20 case**: pairing-store (8) / pairing-handler (8) / pairing-allow-from (4) / hot-reload 回归 (2)
- **566/566 测试全绿** (546 + 20)

## [v1.2.2]
- 2026-08-09 (GROUP-CONTEXT-WINDOW — 群聊非 @ 消息进 AI 上下文, 老板拍板 "只保留最近 10 条会话进 session")
- **src/dispatch/dispatcher.ts**:
  - 新 `recordGroupContext(msg)`: in-memory 环形缓冲, 每 session 只保留最近 `GROUP_CONTEXT_WINDOW=10` 条非触发群消息 (shift 丢弃最旧)
  - `buildInjectedGroupContext`: 触发时把缓冲构造成 `[系统提示-群聊上下文]` 块, 只前置进 Body (不 mutate msg.content, 不污染 RawBody)
  - `buildCtxPayload` 加 `injectedContext` 参数 → 群聊先发图再 @ 场景, AI 通过 MediaUrls 多模态看到图
  - 新增 `buildSessionKeyForMsg` helper, dispatch 3 处 (入队/执行/缓冲) sessionKey 一致
  - 删 v1.2.2-dev `recordOnly` 死代码 (之前方案直接 recordInboundSession → 转录无界膨胀; 改内存缓冲天然有界 ≤10)
- **src/inbound/handler.ts**: `onRecordMediaOnly` (仅媒体) → `onRecordGroupContext` (全部未触发群消息, 含文本/媒体)
- **src/index.ts**: 接线 `onRecordGroupContext → recordGroupContext`
- **src/core/constants.ts**: `GROUP_CONTEXT_WINDOW = 10`; PLUGIN_VERSION → 1.2.2
- **为什么不直接 recordInboundSession?** 转录是 framework 托管 (SQLite index + trajectory + 压缩 checkpoint), 插件侧修剪会脱同步 → 内存缓冲 + 触发时一次性注入, 天然有界
- **新测试** `tests/dispatcher-group-context.test.ts` (5 case): 图片+@ 场景 / 窗口上限 / 注入即消费 / DM 不缓冲 / 群间隔离
- **544/544 测试全绿** (539 + 5)

## [v1.2.1]
- 2026-08-09 (SWAGGER-ALIGNMENT + FULLFIX — 老板 3 项: 完整多维度审阅修复 + swagger 全 API 对齐)
- **P1 并发修复**:
  - dispatcher.ts 队列容错 (每 job try/catch, 防单 dispatch 抛错丢同 session 消息)
  - index.ts inboundHandler 按 accountId 复用 (防并发 start 双 handler → 去重失效)
  - webhook-receiver buildDedupeKey 加 content hash (无 id 消息不塌缩 noid 误丢)
- **P1 契约修复** (AI 工具字段对齐 swagger PascalCase):
  - api-client revokeMsg → {ClientMsgId, NewMsgId, CreateTime, ToUserName}
  - msg.ts sendCDNImg/sendCDNVideo → {Content, ToWxid}
  - msg.ts shareCard/shareLocation/shareVideo/shareLink → PascalCase + appmsg XML
  - tools.ts cdnDownloadImage → {fileAesKey, fileNo}; downloadFile → {appID, attachId, userName}
  - label.ts add → {LabelName}; updateList → {LabelID, ToWxids}
  - group.ts getMemberDetail → 只 {QID}
  - friend.ts upload → {currentPhoneNo, opcode, phoneNo}; lbsFind → {opCode}
  - finder.ts getCommentDetail/targetUserPage → swagger 字段
  - user.ts updateProfile → PascalCase; wxapp addWxAppRecord → {username}; customized → {Username}
  - officialaccounts getMpHistory → {url, wxid}
- **P1 安全修复**:
  - index.ts authcode 日志掩码 (maskSecret)
  - api-client resolveImageToBase64: 30s 超时 + 15MB cap + 本地路径白名单 + URL 脱敏
  - constants DEFAULT_WEBHOOK_HOST 0.0.0.0 → 127.0.0.1
- **P1 测试 CI**: ws-smart-backoff 仓库外绝对路径 → 相对路径 + skip; watcher 脚本拷入 scripts/
- **P2 代码质量**: MCP client 超时/重连关闭/多 block 解析/改名 resolveFileViaMcp; 删 3 死模块; as any 消除; 38 处旧 log tag → v1.2.0; OSS 抽 ossUploadBuffer; accounts example mcpEnabled 统一 false
- **文档**: 8 份对齐 v1.2.0 (539 tests / 49 文件 / 159 tools / 49 CHANGELOG) + MCP 段
- **539/539 测试全绿**
- 备份 `/data/wpp-swagger-alignment-20260809-1830/` + `/data/wpp-fullfix-v120-20260809-1800/`

## [v1.2.0]
- 2026-08-09 (VENDOR-MCP — 集成 vendor MCP 增强文件下载, 老板发现 vendor 提供 MCP 端点)
- **src/vendor-mcp-client.ts** (新): MCP 客户端封装 (SDK StreamableHTTPClientTransport)
  - 鉴权: Authorization Bearer <WECHATPRO_AUTHCODE> (实测, 非 TokenKey)
  - 工具: connectMcpClient / callMcpTool / listMcpTools / disconnectMcpClient (全 try/catch, 失败返 null 不卡主)
  - 只调 7 只读工具, 不碰写 (mcp_write_enabled=false 老板已确认)
- **src/inbound/media-enrich.ts**: 新增 `enrichFileMessageViaMcp(localId, filename)`
  - MCP wechat_get_recent_messages → 找 CDN URL → 下载 → OSS → 公网 URL → AI 读到文件
- **src/inbound/handler.ts**: v1 schema 文件 fallback 双路径
  - mcpEnabled !== false + local_id 存在 → 先 MCP 尝试; MCP 失败 → 原确定性回复兜底 (禁 AI 猜路径)
- **src/types.ts**: WppAccountConfig.mcpEnabled (默认 true, 生产 default.json 暂设 false 避免白耗)
- **src/index.ts**: startAccountById 传 mcpEnabled; shutdown 断 MCP 连接
- **accounts/default.json.example**: 加 mcpEnabled 字段
- **538/538 测试全绿** (up from 534, +4 vendor-mcp-client)
- **已知限制**: vendor MCP `wechat_get_recent_messages` 返 `mcp_realtime_forbidden` (需 vendor 套餐开通 realtime)
  - realtime 未开通时生产 mcpEnabled=false 避免白耗 5s; vendor 开通后改 true 即用
- 备份 `/data/wpp-v120-mcp-20260809-1730/`

## [v1.1.59]
- 2026-08-09 14:30 (FILE-DETERMINISTIC-REPLY — 文件消息确定性回复, 绕过 AI)
- **背景**: 4 通道实测确认 v1 schema 文件无任何下载路径 (webhook//Msg/Sync/WS/DB 全只有文件名+local_id)
  - 老板: "这些文件暂时无法下载, 收到文件消息时给我临时方案, 确保 AI 回复不出问题"
- **src/dispatch/dispatcher.ts**:
  - 新增 `buildFileAutoReply()` 纯函数: 检测 content 含 `[文件]` + `[系统提示-文件限制]` 标记 → 构造固定回复文本
  - dispatchOne 在 recordInboundSession 之后、AI 生成之前拦截文件消息 → sendText 固定回复 → return
  - 完全绕过 AI: ① 文件内容读不了 AI 无价值 ② minimax rate_limit 风险 (journal 实测 2067) ③ 固定模板 100% 不出错
- **保留**: handler.ts NO-PATH-GUESS 注入 (AI 上下文仍有文件名+限制说明, 未来恢复 AI 用)
- **tests/media-enrich.test.ts**: +5 case 覆盖 buildFileAutoReply (检测/非文件/图片/undefined/无标记)
- **534/534 测试全绿** (up from 529, +5)
- **行为变化**: 文件消息 AI 不再参与, 直接回 "收到「文件名」📎 但我当前无法读取文件内容..." — 稳定、快、省 token
- 备份 `/data/wpp-v1159-file-deterministic-reply-20260809-1430/`

## [v1.1.58]
- 2026-08-09 14:15 (NO-PATH-GUESS — 修复 AI 误读旧文件导致内容串台)
- **根因调查** (老板 12:15 报告: AI 读到"银行明细"但文件名是"入学入托"):
  - AI 收到 v1 schema 文件消息 → `find /root/.openclaw /tmp -name "*.pdf"` → 找到 **7/24 旧文件 /tmp/doc.pdf**
  - AI `cp /tmp/doc.pdf workspace/doc.pdf` → 误读旧银行明细 → 告诉老板"文件名是入学入托, 内容却是货款转账, 是不是发错了"
  - 真相: 老板发的文件 **从未被下载** (vendor v1 schema 只推送文件名元数据), AI 读的是历史旧文件
- **修复**:
  - 删除误导旧文件 `/tmp/doc.pdf` + `/root/.openclaw/workspace/wpp-wechat/doc.pdf`
  - handler.ts v1 file fallback 注入 content 明确指令: **禁止 AI find/ls 搜索 *.pdf、猜测路径、读取系统现有文件**
  - 只让 AI 基于文件名回复用户, 并诚实说明"当前平台无法读取文件内容"
- **测试**: 16/16 media-enrich tests 全绿 (isV1SchemaFile 覆盖不变)
- **document-extract 已启用** (openclaw.json plugins.allow 加 "document-extract"): AI pdf 工具现在能读 PDF (clawpdf 引擎实测提取成功)
- **未触碰**: dispatcher shouldQuote=true, quote-xml.ts, BaseResponse.ret
- 备份 `/data/wpp-v1158-no-path-guess-20260809-1415/`
- **vendor 硬限制**: v1 schema 文件无下载 API (20+ 参数组合 /Tools/DownloadFile 全 ret=-2), 根治需联系 knowhub.cloud 客服或恢复 v0 schema 客户端

## [v1.1.57]
- 2026-08-09 13:35 (V0-FILE-COMPAT — 文件 v0 路径加宽 + v1 schema fallback)
- **src/inbound/handler.ts**: 文件 enrich 路径加宽
  - 旧: `msgType === 6 + content.includes("<appmsg")` (v0 schema 客户端原始 file XML)
  - 新: `(msgType === 6 || (msgType === 49 && content 含 <appmsg> + <type>6</type> 或 <type>8</type>))`
  - 覆盖 v0 schema 客户端通过 appmsg (type=49) 推送的文件
- **src/inbound/handler.ts**: 新增 v1 schema 文件 fallback (msgType=49 + raw.app.category=file)
  - 实测 13:10 老板发 PDF 走 v1 schema (kind=app, app.category=file, content="入学入托1725761240358.pdf")
  - v1 schema 无 aeskey/attachId/appID, /Tools/DownloadFile 20+ 参数组合全 ret=-2
  - 决策: 只注入 filename + ext 到 content, 提示 AI "vendor v1 schema 暂不支持下载"
  - 避免 AI 误以为"上传失败"
- **src/inbound/media-enrich.ts**: 新增 `isV1SchemaFile()` 检测器 (kind=app + app.category=file)
- **tests/media-enrich.test.ts**: +6 case 覆盖 isV1SchemaFile (boss 实测 PDF msgId=1200608731982267299 + 各种 edge case)
- **529/529 测试全绿** (up from 516, +13 v1 schema detection case)
- **未触碰**: dispatcher `shouldQuote = true`, quote-xml.ts, BaseResponse.ret 判据
- **关键发现 (debug)**: WPP vendor 内部有文件 download 机制,把文件下到 `/root/.openclaw/workspace/wpp-wechat/doc.pdf` (固定文件名,10792 bytes 真实 PDF)
  - 12:15:18 vendor 内部下载成功 → AI 用 `pdf` 工具失败 (PDF extraction plugin 未启用)
  - 12:15:29 AI 实际看到 PDF 内容(走 model 内置 fallback)
  - **风险**: 固定 doc.pdf 文件名, 多次文件覆盖丢失
- **vendor 限制**: /Tools/DownloadFile 公开 API 在 v1 schema 下不可用 (20+ 参数组合全 ret=-2)
- 备份 `/data/wpp-v1157-file-fallback-20260809-1310/`
- 老板 12:25 提供 **deepseek API key** `sk-60357bc32d1342fb97e4682802098525` 作为兜底

## [v1.1.56]
- 2026-08-09 12:50 (V1-SCHEMA-ENRICH — 私聊/群聊图片 AI 重新识别)
- **src/inbound/media-enrich.ts**: 新增 `enrichImageMessageFromV1()` + `isV1SchemaImage()` helper
  - v1 schema (vendor 8/9 ~09:00 切换推送格式) content 改为"收到一张图片" 总结文字,不再推 `<img>` XML
  - 新函数用 `/Tools/DownloadImg` + `local_id` 拿首 64KB JPEG (vendor 硬限, 多次调用 MD5 一致)
  - 仍走 ossutil → 公网 URL → AI 多模态识别 (大图部分截断但多数场景够用)
- **src/inbound/handler.ts**: 图片 enrich 分双路径 — v0 schema (content 含 `<img>`) 走原 `enrichImageMessage`,v1 schema 走新 `enrichImageMessageFromV1`
- **src/dispatch/dispatcher.ts**: ctx payload 新增 `MediaUrls/MediaPaths/MediaTypes` 数组字段 (gewe v3.1.0 范式)
  - 从 msg.content 提取 `[图片]/[视频]/[语音]/[文件] URL` → 数组
  - framework 走结构化多模态识别,不再依赖 Body 文本里的 URL 标记
- **tests/media-enrich.test.ts**: 7 个新 case 覆盖 isV1SchemaImage (私聊/群聊/缺字段/null/string 等)
- **版本同步**: package.json + openclaw.plugin.json + src/core/constants.ts:PLUGIN_VERSION 三处 → 1.1.56
- **523/523 测试全绿** (up from 516, +7 v1 schema detection case)
- **未触碰**: dispatcher `shouldQuote = true` (v1.1.50 状态保留), quote-xml.ts (v1.1.55), BaseResponse.ret 判据 (v1.1.52)
- **vendor 已知限制**: /Tools/DownloadImg 单次硬限 64KB (实测 4 次连调 MD5 完全相同, sectionStart/dataLen/sectionLen/compressType 均无效)
- 备份 `/data/wpp-v1156-v1-image-enrich-20260809-1250/`, revert 用 `cp $BK/src/* /root/dev/wechatpadpro-openclaw/src/`

## [v1.1.55]
- 2026-08-09 12:10 (QUOTE-TITLE-FIX — 引用回复 client 端终于能显示 AI 回复文字)
- **src/send/quote-xml.ts**: 引用回复 XML 重写 — **title=AI 回复文字** (gewe 工作基线), des 同填作 fallback, refermsg 简化 svrid+fromusr
  - 根因: appmsg type=57 客户端主气泡读 `<title>` 字段, `<des>` 在 type=57 被吞
  - v1.1.28 误改: title=displayname + des=AI → 客户端只显示 refermsg 预览
  - v1.1.55 修复: title=AI 回复 (gewe src/send/quote.ts:31 范式) → 客户端主气泡显示 AI 回复 + 引用块渲染
- **src/send/quote-reply.ts**: log tag 改为 v1.1.55, 注释更新 (vendor /Msg/Quote ret=-2 永久不可用, 走 ShareLink+gewe 范式)
- **tests/quote-xml.test.ts**: 7 个 case 全更新匹配 v1.1.55 结构 (title=AI, 极简 refermsg, 无 displayname/content/createtime)
- **核心类型**: `QuoteSource` 字段保留向后兼容 (displayname/chatusr/content/createtime/innerType), 但 v1.1.55 仅用 svrid + fromusr
- **版本同步**: package.json + openclaw.plugin.json + src/core/constants.ts:PLUGIN_VERSION 三处 → 1.1.55
- **未触碰**: dispatcher.ts `shouldQuote = true` (v1.1.50 调试状态保留), /Msg/Quote 接口 (vendor ret=-2), BaseResponse.ret 判据修复 (v1.1.52)
- **13 XML variant 实测**: msgId 848526155-179 已发老板手机, 验证 type=57 + title=AI 回复的 client 渲染
- 备份 `/data/wpp-quote-title-fix-20260809-1210/`, revert 用 `cp $BK/src/send/quote-xml.ts /root/dev/wechatpadpro-openclaw/src/send/quote-xml.ts`

## [v1.1.50]
- 2026-08-09 11:00 (QUOTE-ALL-MSG-TYPES-REOPEN — 接总立拍板引用回复全面放开 ⚠️ 调试模式)
- **src/dispatch/dispatcher.ts**: `shouldQuote = true` (去掉 msgType===1 限制), 全部 msgType (文本/图片/语音/视频/表情) 都走 quoteReply
- 老板实测验证：refermsg XML 字段完整、displayname/title 正常、AI reply 可被引用
- **wpp-wechat/AGENTS.md**: 引用回复纪律重启（段 165-183 替换为新规则），禁止"引用回复已废弃"话术
- ⚠️ 调试模式，备份 v1.1.49 dispatcher.js 可一键 revert: `/data/wpp-quote-reopen-20260809-1054*/dispatcher.js.v1.1.49`

## [v1.1.49]
- 2026-08-09 10:50 (QUOTE-TEXT-ONLY-REOPEN — 接总立拍板放开文本 msgType 引用回复)
- **src/dispatch/dispatcher.ts**: `shouldQuote = msg.msgType === 1`（只放开文本）, 图片/语音/视频引用仍走 sendText
- 老板 10:53 立刻要求再放开全部 msgType（v1.1.50）

## [v1.1.48]
- 2026-08-09 10:30 (SESSIONKEY-FIX + PEERID-FIX 部署)
- **P0-FIX src/session-key.ts**: `buildSessionKey` 群聊去掉 accountId 段 (5 段), DM 保留 (6 段) — 对齐 framework `parseSessionDeliveryRoute` SSOT (实测 `SESSION_DELIVERY_PEER_KINDS.has("default") === false`)
- **P1-FIX src/inbound/handler.ts**: enrich 前用 `accountRegistry.get(accountId).selfWxid` 判断私聊方向, `fromWxid === selfWxid` → peerId 改为 toWxid (修老板自己发私聊 → peer_id 错位成自己 wxid bug)
- **副作用**: 老板 10:31 同意修 MEMORY.md "四段原则"过期段（decision 2026-08-09 + 标注过期段）
- 494 tests pass, deploy ✅

## [v1.1.47]
- 2026-08-09 10:13 (BUILD-DEDUPE-KEY FIX — `??` 空字符串陷阱)
- **src/webhook-receiver.ts:241**: buildDedupeKey 改 `?? ` 为三元显式判断, 修 newMsgId="" 时 fallback 失败
- 491 tests pass, deploy ✅, e2e 验证入库 id=20366-20369

## [v1.1.36] ~~QUOTE-DISABLED（已撤销）~~
- 2026-08-09 00:05 (QUOTE-DISABLED — 接总立拍板放弃引用回复)
- **撤销于 2026-08-09 11:06**：老板拍板 v1.1.50 重新放开引用回复（见上 v1.1.50 段）
- 撤销根因：实测 v1.1.50 引用块发送者 displayname/title 正常，不再有"显示群名/图片不能展示"问题
- **src/dispatch/dispatcher.ts**: ~~`shouldQuote` 恒为 false~~ → **v1.1.50 已改 `shouldQuote = true`**
- ~~AI 回复一律走普通文本 (sendText)~~ → **v1.1.50 起回复内容走 quoteReply 工具**
- 透传参数 msgId/newMsgId/fromWxid/originalContent 等全部置空 → **v1.1.50 起恢复**
- ~~**wpp-wechat AGENTS.md**: 引用回复纪律废弃~~ → **v1.1.50 起恢复引用回复纪律**
- **保留**: quoteReply/quote-xml/quote-svrid 代码不删（v1.1.50 已重新激活使用）

## [v1.1.35]
- 2026-08-08 23:36 (GROUP-GHOST-FIX + QUOTE-WXID-FIX 部署)

> 深度审阅 subagent 发现 P0-1 (group.ts ghost endpoint) + 老板 23:25 报告引用回复 P0
> 本次包含 2 个 P0 修复 + 1 个 P1 修复

### Fixed (P0-1: Group ghost endpoint — 深度审阅发现)
- **src/send/group.ts**: `operateInfo` 调 `/Group/OperateChatRoomInfo` (vendor 无此 path) → 拆为 3 独立端点
  - `setChatRoomName` → `/Group/SetChatRoomName` (QID+Content)
  - `setChatRoomAnnouncement` → `/Group/SetChatRoomAnnouncement` (QID+Content)
  - `setChatRoomRemarks` → `/Group/SetChatRoomRemarks` (QID+Content)
  - `operateInfo(chatroomId, content, actionType)` 保留兼容, actionType 三选一
- **src/send/group.ts**: `transferOwner` 调 `/Group/TransferGroupOwner` (vendor 无此 path) → `/Group/SendTransferGroupOwner` (vendor 实际端点)
- **src/dispatch/agent-tools/group-meta.ts**: 4 个工具 (transferChatRoomOwner/operateChatRoomInfo/setChatRoomAnnouncement/setChatRoomName/setChatRoomRemarks) 全部指向正确端点
- **根因**: vendor swagger 236 paths 无 OperateChatRoomInfo/TransferGroupOwner, 5 个群管理工具实际全挂 (404)

### Fixed (P0: 引用回复只显示 wxid/群 ID — 老板 23:25 报告)
- **src/send/quote-reply.ts**: 3 处根因
  1. `dbFromWxid = rec.peer_id` (群消息 peer_id=群 ID) → 从 raw_payload 提取 sender_id/fromUser/FromWxid
  2. displayname 缺失 → `rec.peer_name` 兑底
  3. content 带 `wxid_xxx:\n` 前缀 → `stripGroupContentPrefix()` 清洗
- **tests/quote-xml.test.ts**: 新增 stripGroupContentPrefix 5 case

### Fixed (P0 二次修复: 群测仍显示群 ID — 老板 23:41 群测发现)
- **根因深挖**: business callback 群消息 `FromUserName` = **群 ID** (非发送者!), DB 无 from_wxid 字段, raw_payload 无 sender_id, peer_name 全 NULL
  - 发送者 wxid 只在 content 首行前缀 `wxid_xxx:\n` (DB 实测 6 条群消息全一致)
- **修复**: 新增 `extractGroupSenderWxid(content)` — 从 content 前缀提取真实发送者 wxid
  - 提取顺序: 参数 fromWxid → raw_payload sender → **content 前缀 wxid** → (非群) peer_id
- **tests/quote-xml.test.ts**: 新增 extractGroupSenderWxid 5 case (含昵称开头不误判)
- **全量单测: 384/384 pass**

### Fixed (P1-2: sendMiniProgram 死代码调群发端点)
- **src/send/msg.ts**: 删除 `sendMiniProgram` — 调 `/Msg/SendApp` (vendor = 群发消息, body=ToIds+Content)
  - 正确链路: agent-tools sendMiniProgram → api.sendXCX (/Msg/SendXCX) ✅ 不受影响
  - buildAppMsgXml 保留 (有测试覆盖, XML 构造可复用)

### Tests
- api.test.ts 函数总数 233 → 235 (删 sendMiniProgram + 恢复 SetChatRoom* 3 独立)
- 全量单测: **383/383 pass**

## [v1.1.33]
- 2026-08-08 23:16 (P1/P2/P3 推进 + 深度审阅)

> 老板 23:01 "继续 P1/P2/P3" + 23:08 "深度多维度审阅, 完整修复优化"
> 完成 8 项: Tools 端点错配修复 / 测试卡死修复 (379/379) / hot-reload 全字段同步 / mention safeMatch / deploy.sh 验证 / API 覆盖率确认 (221/236 注册 / 181 dispatch = 76.7%)

### Fixed (Tools 端点错配 — P1[2])
- **/Tools/CdnDownloadVoice → /Tools/DownloadVoice** (`src/inbound/media-enrich.ts:405`)
  - vendor swagger 仅定义 /Tools/DownloadVoice (无 Cdn 前缀), 之前错调 Cdn 前缀 → vendor 404
- **/Tools/CdnDownloadVideo → /Tools/DownloadVideo** (`src/inbound/media-enrich.ts:371`)
  - 同上, vendor 仅定义 /Tools/DownloadVideo
- /Tools/CdnDownloadImage 保留 (vendor 有定义, 图片专用)

### Fixed (测试卡死 — P1[4])
- **e2e.test.ts**: 修复 DB 共享污染 (setBackend already initialized)
  - e2e-helper.ts: USE_MOCK 默认 true (除非 WPP_E2E_REAL=1), 避免 prod gateway 冲突
  - try/finally + resetAdapter 清理 DB backend singleton
  - webhookPort 0 (随机端口) 避免 4398 冲突
- **gateway-compat.test.ts**: after() 钩子 closeDb + resetAdapter + resetDefaultRegistry
- **config-helpers.test.ts**: 显式删 WECHATPRO_TOKEN_KEY env (测试环境有真 env)
- **package.json**: npm test 加 --test-force-exit (event loop 残留资源不阻塞退出)
- **结果: 379/379 全绿 (23.9s)**

### Fixed (mention safeMatch — P2[1])
- **src/inbound/parser/mention.ts**: matchAll → safeMatchAll (截断 4096 + 灾难 regex 检测)
  - 防恶意构造字符串触发 ReDoS (gewe v3.1.0 A1 教训: (a+)+$ 1000 字符 hang 119s)
- **tests/inbound.test.ts**: 新增 2 个 ReDoS 防御测试 (100KB 输入 500ms 内完成)

### Added (hot-reload 全字段同步测试 — P1[5])
- **tests/hot-reload.test.ts test 7**: 验证 triggerConfig 8 字段热更新
  - requireAtMention / groupPolicy / groupAllowFrom / keywordTrigger / msgTypeTrigger / quoteBotTrigger / blacklistGroups / chatroomDebug

### Verified (API 覆盖率 — P3)
- **221/236 = 93.6%** vendor 端点已注册 (WPP_VENDOR_ENDPOINTS 列表，去重 ShareLink 重复); 真实 dispatch 字符串覆盖 181/236 = 76.7% (其余 55 paths: Login×40 主动移除 + 15 others 非业务必需)
- 剩余 11 个均非业务必需: Admin 3 (DelayAuthKey/DeleteAuthKey/GenAuthKey) + Login 海外 3 (GetQRMac_oversea/GetQR_oversea/GetQRx_oversea) + QWContact 1 (QWAddContact) + Wxapp 4

### Verified (deploy.sh dry-run — P2[3])
- **19 PASS / 0 FAIL / 0 WARN**
- forensic: 0 处 process.exit / 0 处明文 password / 1 处 informational console.log

### DEV.md 更新
- §0.6 待办 8 项全部完成, 更新为 v1.1.32 部署待拍板 + P3 剩余项


> 老板 21:38 / 21:42 / 22:56 三次决定图片引用能力:
> 1. 21:38 → 仅文本引用 (msgType===1)
> 2. 21:42 → "暂时放弃图片引用能力"
> 3. 22:56 → "图片回复能力暂时先保留。还需要继续测试"
> 复合公式 `msgType===1 || content.includes("<refermsg")` 既符合老板 22:56 决定, 又保留图片引用能力可观测性

### Fixed (PLUGIN_VERSION 一致性)
- **版本号 v1.1.27 → v1.1.32** (3 文件同步)
  - `src/core/constants.ts` (PLUGIN_VERSION)
  - `package.json` (version)
  - `openclaw.plugin.json` (version)
  - 原因: deploy 端实际功能已到 v1.1.28+ (引用 XML 全字段 + 复合 shouldQuote + ossutil retry), 但 version 字符串停留在 v1.1.27 (22:32 部署时)

### Fixed (shouldQuote 复合公式)
- **公式 `msgType===1 || content.includes("<refermsg")`**
  - 文本消息 (msgType===1) → 必引用
  - 任何含 `<refermsg>` 标签的消息 (msgType=1/3/43/34/6 等) → 走引用回复
  - 不含 refermsg 的图片/视频/语音/文件 → 走普通文本回复
  - 行为: 老板手动引用过的图 (wpp_svrid_mapping 命中) 可正常引用, 未引用过的图走普通文本 (vendor svrid 不可用)

## [v1.1.32]
- 2026-08-08 22:56 (PLUGIN_VERSION 一致性 + 老板新决定)

## [v1.1.31]
- 2026-08-08 21:30 (老板撤销 v1.1.28 NO-QUOTE-IMG)

### Fixed (图片引用恢复)
- `shouldQuote = msgType===1 || msgType===3`
- 老板原话 21:30: "图片我还是希望可以被引用回复"

## [v1.1.30]
- 2026-08-08 21:19 (GEWE-PARITY + 老板分析 gewe 引用)

### Fixed (仿 gewe send/quote.js + handler.ts)
- **src/send/quote-xml.ts** 极简结构 (仿 gewe) — 注: 后被 v1.1.28 修复覆盖为全字段
- **src/send/quote-reply.ts** svrid 来源改 inbound NewMsgId
- **src/inbound/handler.ts** QUOTE 消息 push 原图 OSS URL 到 AI 多模态上下文
  - 仿 gewe handler.ts:170-194 quoteDetails.mediaUrl 注入
- **src/dispatch/dispatcher.ts** 删除 v1.1.26-IMG-ECHO
  - 老板 21:27 实测: "发了单独的图片, 结果你把图片又发给我了" → 删 IMG-ECHO
- **AI 多模态识别图能力 (P0 验证通过)**
  - 老板测试: "你识别到被引用到图片了" ✅

## [v1.1.29]
- 2026-08-08 21:10 (enrich 顺序 + ossutil retry)

### Fixed (DB 不存 OSS URL bug)
- `src/inbound/media-enrich.ts`: ossutil 加 60s timeout + 3 次 retry + 指数 backoff
  - 老板 20:59:15 那张图 ossutil 临时失败 (code=null signal=SIGKILL) → AI 看不到 URL
  - fix: 失败时 warn + retry, 3 次仍失败抛错 (handler 兜底 DB save)
- `src/inbound/handler.ts`: 改 onFlush 顺序 — 先 enrich 再 enrichBatch
  - 之前: enrichBatch (DB save 原始 m.content) → enrich (内存修改 m.content)
  - 之后: enrich 先 (DB 落 enrich 后的 content) → enrichBatch

## [v1.1.28]
- 2026-08-08 22:34 (BUGFIX 引用 XML 全字段)

> 老板实测: 引用回复发送成功 (Code=0), 但 vendor WPP 渲染异常
> 根因: v1.1.30 仿 gewe 极简结构 (type=57 + 仅 svrid) 在 vendor WPP 上:
>   - type=57 可能被 vendor 识别为"合并转发"而非引用
>   - refermsg 只有 svrid → vendor 无法渲染引用块 (无 fromusr/displayname 等)
>   - 缺 <des> 字段 → 客户端可能不显示正文

### Fixed (引用 XML 全字段)
- **src/send/quote-xml.ts**: 加 <des> + refermsg 6 字段
  - type (1=文本 / 3=图片 / 43=视频 / 49=文件)
  - fromusr (被引用人 wxid)
  - chatusr (会话 wxid)
  - displayname (被引用人昵称)
  - content (被引用消息原文)
  - createtime (被引用消息时间)
- **src/send/quote-reply.ts**: 从 DB 补全 refermsg 全字段
  - 新增 `opts: { innerType: 49 | 57 }` (默认 57 gewe 兼容, 失败回退 49 vendor WPP 标准)
- **src/dispatch/dispatcher.ts**: replyTo 类型扩展透传 6 字段
  - fromWxid / chatroomId / fromNickname / originalContent / createtime / innerType
- **tests/quote-xml.test.ts**: 7/7 case 更新适配新结构


老板之前部署的版本, 因 manifest 缺 id 爆网关 status=78, 已撤回 (`/data/wechatpadpro-removed-20260804-104900/`).
完整 v0.1.0 PoC 后由 v1.0.0 (Phase G 完工) + v1.0.1 (audit 修复) 取代.

## [v1.1.27]
- 2026-08-08 (P0→P2 完整推进 + 老板反馈 5 项修复)

> 本次会话完成 14 项: 老板反馈紧急修复(群session/Excel下载/图片视频文件引用)+ Tier A 配置 + Tier B 核心消息 + 8 项 P0→P2 字段名/安全/能力补齐

### Fixed (老板反馈紧急 5 项)
- **群聊按 groupId 创建 session** (`src/inbound/parser.ts:180-189`)
  - 之前: 仅靠 senderId/recipientId 后缀 @chatroom 判别群 → 部分 vendor payload 漏判 → peerId = senderId → session 按人拆, 群上下文串台
  - fix: 优先级 conversation_id > recipient_id > sender_id + is_group === true 显式判别
- **Excel/PDF/Word 等办公文件下载** (`src/inbound/media-enrich.ts` enrichFileMessage + parser/content.ts msgType=6)
  - msgType=6 映射 + parseFileXml (fileno/attachfileid 兼容) + /Tools/DownloadFile → OSS → 公网 URL
  - 失败 fallback: 在 content 标注文件名 + 大小, AI 知道有文件但无法下载
- **图片/视频/语音引用能力** (`src/inbound/handler.ts:127`)
  - 之前 v1.1.30 只匹配 `[图片]` URL → 视频/文件/语音引用都拿不到原资源
  - fix: 匹配 `[图片|视频|语音|文件]` 任一标签 + 提取第一个 URL 注入
- **视频 enrich 下载** (`enrichVideoMessage` + msgType=43)
  - videomsg XML → /Tools/CdnDownloadVideo → OSS
- **语音 enrich 下载** (`enrichVoiceMessage` + msgType=34)
  - voicemsg XML → /Tools/CdnDownloadVoice → OSS

### Fixed (Tier A 配置 3 项)
- **版本号同步**: openclaw.plugin.json 1.1.23 → 1.1.26
- **CHANGELOG 补 v1.1.16~v1.1.26 共 11 个版本条目** (19 → 30 条目)
- **清 .ossutil_checkpoint 部署残留**: 移至 /data/wpp-ossutil-checkpoint-<ts>/

### Fixed (Tier B 核心消息 6 项)
- **sendVoice 改 Base64 + Type:2 + VoiceTime×1000** (P0-F 残余)
- **sendVideo 改 Base64 + ImageBase64 + PlayLength** (P0-F 残余)
- **queryWithTimeout 静默返 [] → throw QueryTimeoutError** (P1-e)
  - 新增 QueryTimeoutError class + opts.onTimeout 兜底开关
- **补 wpp_messages.create_time BIGINT 列** (撤回语义准确)
- **S3Storage put/get 加 30s/60s timeout** (P1-d 防 endpoint 挂死队列积压)
- **shutdown flush debouncer** (P1-b 停机不再丢 buffered 消息)
  - AccountContext.attachInboundFlush + stop() 顺序: clearRetryTimers → flush → ws.stop → webhook.stop

### Fixed (P0 契约合规 2 项)
- **P0-1 Group 字段名批量改** (`send/group.ts` + `dispatch/agent-tools/group-meta.ts`)
  - chatroomId/wxidList/wxid → ChatRoomName/ToWxids/QID/ToUserName/Enable
  - 21 个端点 1:1 对齐 swagger definitions (ChatRoomName/ToWxids/QID/Content/Enable/NewOwnerUserName 等)
  - 移除 setName/setAnnouncement/setRemarks 重复方法 (合并到 operateInfo QID+Content), agent-tools meta 保留 deprecated 别名
- **P0-2 MMTLS 监控 SOP** (`scripts/mm-health-check.mjs`)
  - 监控 4 项: vendor 容器运行 + MMTLS outbound TCP + openclaw 进程 + journal fatal + webhook 触达
  - 部署 cron: `*/5 * * * * bash scripts/mm-health-check.mjs >> /var/log/wpp-health.log 2>&1`

### Fixed (P1 字段名 3 项)
- **P1-1 Search 字段名**: keyword → query (vendor 是 query, 之前 18/18 静默失效)
- **P1-2 Friend/FriendCircle 字段名**: wxid/remark/operation/snsId/firstPageMd5 → toWxid/remarks/val/CommentId(typo)/fristpagemd5(typo)
- **P1-3 Finder/TenPay/Voice/Translate 字段名**: 通用名 → vendor 字段 (Username/Id/Money/Name/Remark/text/source_lang/target_lang 等)

### Fixed (P1 安全 1 项)
- **P1-4 ReDoS 防护** (`src/core/safe-regex.ts` + parser/content.ts + parser/quote.ts)
  - isCatastrophicRegex 检测嵌套量词/灾难 alternation
  - safeMatch/safeMatchAll 截断输入 4096 字符 (gewe v3.1.0 实测 hang 119s)
  - 10 个单元测试覆盖 (gewe 教训)

### Added (P2 能力 2 项)
- **P2-1 silk encoder + STT pipeline** (`src/storage/silk.ts` + `src/storage/stt.ts`)
  - 从 gewe v3.1.6 fork: silk decode (native binary) + SiliconFlow SenseVoiceSmall STT
  - 60s 单次 timeout + 3 次指数退避重试
  - 语音消息进来: download → decode → WAV → STT → 转写文字注入 content (`[转写] text`)
- **P2-2 OSS 目录规范化**: gewe/images/ → wpp/images/ (4 个子目录全部统一, 防与 gewe plugin 误覆盖)

### Tests
- 新增 `tests/safe-regex.test.ts` (10 case)
- 修复 `tests/api.test.ts` 函数总数断言 235→233 (Group 字段名改 -2 函数)
- tsc --noEmit 0 错
- 关键测试 53/53 全绿 (inbound/parser/quote/dispatcher/agent-tools/api/db/safe-regex)

## [v1.1.26]
- 2026-08-08 (post-deploy hotfix: 串行 + 图片引用 + 老板主号加固)

> 说明: 此条目为代码注释实际标记,但 package.json version 字段后续未同步。CHANGELOG 真实反映 src/ 注释里的版本号。

### Added / Fixed
- **v1.1.26 CONCURRENCY-FIX** (2026-08-08 20:06 老板 "图片回复丢失"): per-session 串行队列
  - `src/dispatch/dispatcher.ts:183` 注释:per-session 串行化,防图片回复并发丢
- **v1.1.26-IMG-ECHO** (2026-08-08 20:xx): 图片引用缩略图达不到时,主动 sendImage 发原图
  - `src/dispatch/dispatcher.ts:301-305` 从 inbound content 提取 enrich 后 OSS URL,主动 echo
  - **被 v1.1.30 删除**(GEWE-PARITY 后不再需要)

### Known Issue
- package.json version = 1.1.26,但 src/ 注释已包含 v1.1.27~v1.1.32 多个 hotfix
  - 见下 "Post-v1.1.26 Hotfix" 段

## [v1.1.25]
- 2026-08-08 (SYNC-STATE 增量同步)

### Fixed
- **v1.1.25 SYNC-STATE** (2026-08-08 接总立): webhook sync_message 走增量 Synckey(防全量重放)
  - `src/index.ts:187` 调 `/Msg/Sync` 前先 `getSynckey(accountId)`,之后 `saveSynckey()`

## [v1.1.24]
- 2026-08-08 (QUOTE-DEFAULT + QUOTE-SVRID)

### Added
- **v1.1.24 QUOTE-DEFAULT** (2026-08-08 19:42 接总立): 参考 gewe 业务逻辑 — 回复必须引用被回复的消息
  - `src/dispatch/dispatcher.ts:152`
- **v1.1.24 QUOTE-SVRID** (2026-08-08 接总立): 捕获引用消息 svrid → 存映射表
  - `src/inbound/handler.ts:84-90` captureQuoteSvrid(m.content, m.accountId)

## [v1.1.23]
- 2026-08-08 (openclaw.plugin.json schema 补全)

> 注: 此条目推测,v1.1.23 是 openclaw.plugin.json 顶部记录的版本号(已漂移到1.1.23 时未记录)

### Added
- `openclaw.plugin.json` schema 加 v1.1.22 字段(具体字段需 git diff 复核)

## [v1.1.22]
- 2026-08-08 (QUOTE-CTX 语气强制)

### Changed
- **v1.1.22 QUOTE-CTX** (2026-08-08 19:17 接总立实测): 引用消息语境语气从"如果你想"改强制指令
  - `src/dispatch/dispatcher.ts:100`

## [v1.1.21]
- 2026-08-08 (QUOTE-FIX + SendCDNImg P1-2 修复)

### Fixed
- **v1.1.21 QUOTE-FIX** (2026-08-08 19:07/19:14 接总立): 引用消息注入结构化上下文
  - `src/dispatch/dispatcher.ts:94` + `src/dispatch/reply-helpers.ts:8` + `src/dispatch/agent-tools/msg-meta.ts:67`
- **v1.1.21 P1-2 SendCDNImg URL 失败** (2026-08-08): /Msg/SendCDNImg content=url 拉外网失败
  - 后续 v1.1.27 SENDIMG-FIX 完全修(改 base64)

## [v1.1.20]
- 2026-08-08 (IMAGE-ENRICH 图片下载 + OSS 上传)

### Added
- **v1.1.20 IMAGE-ENRICH** (2026-08-08 18:42 老板拍板,18:46 参考 gewe 模式)
  - `src/inbound/handler.ts:39-66`: msg_type=3 图片消息 → `/Tools/CdnDownloadImage` → ossutil cp → 公网 URL → 注入 content 末尾
  - 仿 gewe enrich.js 模式,AI 视觉模型可看到 URL 识别内容

## [v1.1.19]
- 2026-08-08 (DB-DEDUP + SQL 运算符优先级)

### Fixed
- **v1.1.19 DB-DEDUP** (2026-08-08 接总立方案 A): SeenTracker 内存态, gateway 重启即清空
  - 补 DB 兜底:内存去重通过但 DB 已有同消息时跳过
  - `src/inbound/handler.ts:204-211`
- **v1.1.19 SQL 运算符优先级 bug** (2026-08-08 18:38): 修复条件表达式
  - `src/storage/db/mysql.ts:317`

## [v1.1.18]
- 2026-08-08 (NICKNAME-MENTION + CFG-DISPATCH 401 根因)

### Fixed
- **v1.1.18 CFG-DISPATCH** (2026-08-08 18:05 老板 401 根因): 保存 OpenClaw 完整配置
  - `src/dispatch/dispatcher.ts:61-83` 注入 OpenClaw 完整 cfg,dispatcher 可访问
  - 根因: 之前 dispatcher 拿不到 OpenClaw 配置 → 401
- **v1.1.18 NICKNAME-MENTION** (2026-08-08): 注入昵称供群 @ 检测 (e.g. @接晓银)
  - `src/index.ts:106` 配置驱动 + DEFAULT_BOT_NICKNAME 兜底
  - `src/index.ts:608` 热重载同步昵称

## [v1.1.17]
- 2026-08-08 (FULL-FIX: 10 项 P0/P1 收口)

> 来源: P0 污染事件后(16:00:38)老板拍板的 10 项 full-fix。CHANGELOG 历史最高条目。

### Fixed (P0)
- **P0-A** `/Msg/SendTxt` 群 @ 字段名: `ats` (array) → `At` (逗号字符串) + 补 `Type: 1`
  - `src/api-client.ts:171-174`
- **P0-B** `/Msg/SendApp` 是群发端点不是发 XML:改 `/Msg/ShareLink` + `sendAppMessage` AI 工具移除
  - `src/api-client.ts:202-204` + `src/dispatch/agent-tools/msg-meta.ts:22` + `src/dispatch/handler-action.ts:44`
- **P0-E** `/Webhook/Set` 补 `enabled: true` (Go bool 零值 false → webhook 设了等于没设)
  - `src/api-client.ts:250-258` 加 enabled/retryCount/timeout/messageTypes
- **P0-G** SeenTracker 接入 handler,三通道去重
  - `src/inbound/handler.ts:185-211` 内存去重 + DB UNIQUE 兜底
  - `src/webhook-receiver.ts` SeenTracker class 已存在(v1.1.11 迁入),v1.1.17 才真正接线
- **P0-H/I** 大整数精度保护(`stringifyLargeInts`) + JSON 解析失败不再判 Code=0
  - `src/api-client.ts:60-67` + `src/api-client.ts:73-75`

### Fixed (P1)
- **P1-f** outbound persist 顺序: 先判 Code 再 persist(失败不留假记录)
  - `src/dispatch/outbound.ts:96,113`
- **P1-9** `/Msg/Revoke` 字段名错: ClientMsgId + NewMsgId + CreateTime + ToUserName
  - `src/api-client.ts:206-216` CreateTime = Math.floor(Date.now()/1000)
- **P1-g** 热重载同步全部门禁字段 (之前只同步 3 个)
  - `src/index.ts:596` 同步 keywordTrigger/msgTypeTrigger/quoteBotTrigger/blacklistGroups/chatroomDebug

### Fixed (其他)
- **FULL-FIX** groupPolicy 非法值 fail-fast: VALID_GROUP_POLICIES = ["open","disabled","allowlist","closed"]
  - `src/index.ts:88-92`
- **FULL-FIX** 红包消息 processRedPacket 后 return, 不继续 dispatch
  - `src/inbound/handler.ts:149-152`
- **FULL-FIX** DM allowFrom 白名单 fail-closed (allowFrom 空 → 拒绝)
  - `src/inbound/handler.ts:158` + `src/inbound/triggers.ts:64-70`

### Infra
- **FULL-FIX** P0-CRASHLOOP (2026-08-08 17:18): keep-alive promise 处理, 防 shutdown 卡死
  - `src/index.ts:498`

## [v1.1.16]
- 2026-08-08 (P0-FIX 老板主号污染事件)

### Fixed (P0)
- **P0-FIX 16:00:38 老板主号污染事件** (25+ 联系人 fan-out dispatch)
  - `src/index.ts:70-75`: 启动强制校验 `cfg.agent` 必填,禁止 `"main"` fallback
  - `src/dispatch/dispatcher.ts:179,238`: 改硬编码 `agentId: "main"` → 从 account state 读 `config.agent`
- **P0-FIX allowFrom 从 cfg 传**: DM 白名单从 accounts/<id>.json 读
  - `src/index.ts:119` + `src/inbound/handler.ts:44,158`
- **P0-FIX HOT-RELOAD 同步 allowFrom**: 防漏白名单改动后还在旧白名单
  - `src/index.ts:610`

## [v1.1.15]
- 2026-08-08 (complete-fix: P0/P1 修复 + P2 收口)

> 来源: /root/audit-reports/2026-08/wechatpadpro-openclaw/full-audit-v1.1.14-2026-08-08.md (8 维度完整审阅)

### Fixed (P0)
- **P0-1 agent tools 从未暴露 + 空 ctx 凭证** (审阅发现, 实测 `Failed to parse URL`)
  - `wppChannelPlugin` 加 `agentTools: AGENT_TOOLS` (162 工具) — 仿 gewe-multi-agent/src/index.ts:251 范式
  - `src/api/client.ts` 加 `resolveCallCtx()`: 空 baseUrl/tokenKey 时从 registry 拿 default 账号真实凭证
  - 之前: meta 构建期 ctx 全空 (`baseUrl: ""`), 即使暴露也必炸; 现在: execute 时动态解析
- **P1-1 新 client authcode 不注入 (POST+GET)** (审阅实测: GET 无 authcode → HTTP 400 Code=-1)
  - `postWppJson`: authcode 自动注入 body 顶层 (不再依赖 withAuthcode flag) + URL query 双保险
  - `getWppJson`: 新增 `withAuthcodeQuery()` 拼 `?authcode=` (仿老 api-client.ts)
  - 影响: 全部 236 endpoint + 162 agent tools 真实可调
- **P1-2 老 api-client 3 个 endpoint 名错 (实测 404 → 200)**
  - `/Msg/SendImg` → `/Msg/SendCDNImg` (body: Content/ToWxid)
  - `/Group/GetChatRoomMemberList` → `/Group/GetChatRoomMemberDetail` (body: QID)
  - `/User/GetProfile` → `/User/GetContractProfile` (authcode 在 query)
  - 影响: 生产 sendImage / getChatroomMemberList / getProfile 修复

### Fixed (P1)
- **P1-3 deploy src 陈旧 (v1.1.12) + 嵌套 src/src 垃圾目录**
  - 删除 `/root/.openclaw/extensions/wechatpadpro/src/src/` 嵌套 (错误复制产物)
  - 重新同步 dev src → deploy src (v1.1.14)

### Fixed (P2)
- **P2-1 e2e-mock 有真凭证环境污染真实 vendor** (5 tests)
  - `tests/e2e-mock.test.ts` 每个 test 加 `{ skip: !USE_MOCK }` — 真凭证环境静默 skip
- **P2-5 openclaw.plugin.json schema 缺 v1.1.12 新字段** (8 个)
  - 补: tokenKeyEnv / authcodeEnv / webhookSecretEnv / webhookPublicUrl / webhookPublicUrlEnv / autoSetWebhook / setWebhookRetries / agent
- **P2-4 CHANGELOG 补 v1.1.11~v1.1.14 条目** (见下)

### Tests
- tsc --noEmit 0 错
- 待跑: npm test (clean env 应 322+ pass / 1 fail describeAccount)

## [v1.1.14]
- 2026-08-08 (P1-FIX-RUNTIME channel runtime context 注入)

### Fixed
- **P1-FIX-RUNTIME channel runtime context 注入** (2026-08-08 13:51 老板拍板 A)
  - `src/index.ts gateway.startAccount` 接收 `ctx.channelRuntime` 后调 `setChannelRuntime(ctx.channelRuntime)`
  - 之前: v1.1.13 修了 inbound dispatcher 但 runtime 永远 NOOP_RUNTIME → AI reply 链路断裂
  - 范式: 仿 gewe-multi-agent/src/index.ts:82 `setGeweChannelRuntime(channelRuntime)`
  - 实测: 13:58:22 `gateway.startAccount: channel runtime injected (accountId=default)`

## [v1.1.13]
- 2026-08-08 (P0-FIX-INBOUND inbound dispatcher 接入)

### Fixed
- **P0-FIX-INBOUND inbound dispatcher 接入** (2026-08-08 13:35 老板拍板方案 A)
  - `src/index.ts`: handleWebhookPayload (compat, 不 dispatcher) → createWppInboundHandler + dispatchInboundToOpenClaw onDispatch
  - webhook-receiver + ws-client 都调 `inboundHandler.handle()`
  - 实测: 13:44-13:49 enrichBatch + inbound dispatch + dispatch session 完整 trace

## [v1.1.12]
- 2026-08-08 (autoSetWebhook + 多账号 webhook path)

### Added
- **autoSetWebhook** (2026-08-08 13:15 接总立 P1-2)
  - 启动自动 setWebhook, URL = `${webhookPublicUrl}${webhookPath}` (env: WECHATPRO_WEBHOOK_PUBLIC_URL)
  - 3 次 backoff (1s/3s/9s) + 5min 周期 retry 兜底 + SetWebhookMetrics 7 counter
- **多账号 webhook path**: `/wechatpadpro/{accountId}/webhook` 长前缀 (1Panel openresty ^~ 匹配)
- **wpp-cli.mjs**: 4 命令 (status/webhook-get/webhook-set/webhook-remove)
- accounts/default.json: selfWxid=q139198824, nickname=接晓银 (2026-08-08 13:39 老板纠错 WPP=主号)

## [v1.1.11]
- 2026-08-08 (P0-N1 authcode query 注入)

### Fixed
- **P0-N1 vendor 全部 endpoint 要求 authcode** (实测缺 → 400 "缺少授权码")
  - 老 api-client.ts call(): 自动注入 `?authcode=` query (query 优先, body 备援)
  - /Msg/Sync body 补 `{Scene: 0, Synckey: ""}` (空 body → 400 silent killer)

## [v1.1.10]
- 2026-08-08 (race condition fix)

### Fixed
- **P0-R1 startAccountById race condition** (2026-08-08 老板排查发现)
  - src/index.ts:65-68 idempotent 检查改为 `state.wsClient || state.webhookServer` 即 early-return
  - 根因: v1.1.10 P0-5 只在 wsClient 和 webhookServer 都 attached 才 return,
    但 wsClient 是 `await ws.start()` 之后才 attach (异步窗口期),
    第二次并发调用进来时 state.wsClient 还是 undefined → 跳过 early-return → 又 new 一个 WsClient.
    vendor 端观察到 用户连接数=2, openclaw journal 只有 1 个 ws connecting 日志.
  - 实测证据 (2026-08-08 11:19): openclaw journal `ws connecting` 只 1 次,
    但容器日志显示 用户连接数=1 → 2 (11:19:31).
  - 影响: 资源浪费 + vendor 端用户连接数叠加. 不影响消息接收 (onInboundMessage 幂等).
- **版本号同步**: PLUGIN_VERSION 1.1.8 → 1.1.10, package.json 1.1.9 → 1.1.10

## [v1.1.8]
- 2026-08-04 (FIX-S1 sync I/O async + FIX-S2 e2e mock mode)

### Fixed
- **P3-1 sync I/O 改 async** (FIX-S1)
  - src/config.ts 加 loadGlobalConfigAsync / loadAccountConfigAsync
  - 用 fs/promises.readFile 替代 readFileSync (不阻塞 event loop)
  - 复用 v1.0.4 LRU cache (第二次直接 cache hit)
  - 旧 sync 版本保留 (兼容 CLI / tests)
  - src/index.ts startAccountById 用 async 替换 sync
  - 测试: 3 个新 case (async 等价 / cache 复用 / path traversal 防御保留)
- **P3-2 e2e mock mode** (FIX-S2)
  - tests/e2e-mock.test.ts 新建 (6 case, 用 mock HTTP server 模拟 vendor)
  - WPP_E2E_MOCK=1 启本地 mock server (返 Code=0) — 不需真凭证即可跑
  - CI 用法: WPP_E2E_MOCK=1 npx tsx --test tests/*.test.ts

### Tests
- 295 → 304 (无 MOCK 295 pass + 9 skip; MOCK 300 pass + 4 skip)
- tsc 0 错, build 干净
- bash deploy.sh 19 PASS / 0 FAIL / 0 WARN

### Verified (Prod)
- 备份: /data/wechatpadpro-pre-v1.1.8-final-*.tar.gz (20 份 backup 累计)
- accounts/default.json 完整保留

### Debug 实战教训
- undici 6.x resp.body 是 ReadableStream, 没有 .json() / .text() 方法
- 改用 JSON.parse(await new Response(resp.body).text()) (standard Response 包装)
- 旧测试有 resp.statusCode 错 (standard Response 用 resp.status)

## [v1.1.6]
- 2026-08-04 (真实 S3 SDK 集成)

### Added (v1.1.3 S3/OSS 真集成)
- **`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` 装好** (13MB @aws-sdk 依赖, 老板 prod 跑 `npm install` per 铁律)
- `src/storage/media.ts` 用真 SDK: `PutObjectCommand` / `GetObjectCommand` / `getSignedUrl` / `HeadBucketCommand`
- `ping()` 加 `Promise.race` 3s timeout (防网络挂死)
- 自动检测 endpoint 末尾 `/` + path-style vs virtual-hosted URL
- 兼容 AWS S3 / MinIO / AliOSS / TXOSS / Cloudflare R2 (forcePathStyle option)

### Tests
- 287 → 286 (4 个老 S3Storage.put/sign 网络挂死测试改成 fake creds / fake fallback)
- tests/media-storage.test.ts 12 case
- 0 fail, 0 error, tsc 0 错
- `bash deploy.sh` 19 PASS / 0 FAIL / 0 WARN

### Verified (Prod)
- 备份: `/data/wechatpadpro-pre-v1.1.6-181412.tar.gz` (294KB, 17 份 backup 累计)
- node_modules: 92M (含 @aws-sdk 13MB)

## [v1.1.5]
- 2026-08-04 (v1.1.3 S3/OSS abstraction)

### Added
- `src/storage/media.ts` 新建 (270 LOC): MediaStorage 抽象接口 + 3 实现
  - `PassthroughStorage`: 直接返 vendor CDN URL (默认, 无副作用)
  - `S3Storage`: S3-compatible (SigV4 stub, v1.1.6 真实集成)
  - `CompositeStorage`: 优先 vendor CDN, 失败 fallback S3 (高可用)
- `createMediaStorage` factory (kind: passthrough | s3 | composite)

### Tests
- 15 媒体单元测试 (含 8 个新 S3Storage + 3 个 CompositeStorage + 4 个 factory)
- 287/283 全绿

## [v1.1.4]
- 2026-08-04 (v1.1.1 webhook full verify)

### Added (webhook 验签多算法)
- `src/core/signature.ts` 重构: `verifySignature(body, sig, secret, { algorithm })` 一站式, 默认 sha256, 支持 sha1/md5
- 自动检测 algorithm (从 signature 前缀 `sha256=`/`sha1=`/`md5=`)
- `signatureRequired()` 改 strict mode (永远 true, 业务决定)
- `verifyHmacSha256` 保留 (deprecated, 转发到 verifySignature)

### Tests
- 15 单元测试 (含 7 个 v1.1.4 新增: sha256/sha1/md5 算法 / 自动检测 / 错 secret / 缺 signature)

## [v1.1.3]
- 2026-08-04 (v1.1.8 E2E test scaffold)

### Added
- `tests/e2e.test.ts` 新建 (4 tests, skip-when-no-creds)
- 检查 3 个 env: WECHATPRO_DB_PASSWORD + WECHATPRO_TOKEN_KEY + WECHATPRO_AUTHCODE
- 4 测: MariaDB 连接 / vendor GetProfile / AccountRegistry.start() / plugin.start()
- 没凭证时: skip (不算 fail), 输出提示信息

### Tests
- 272 (268+4 skip) 全绿

## [v1.1.2]
- 2026-08-04 (v1.1.6 AI dispatcher + v1.1.7 特殊消息)

### Added
- `src/dispatch/dispatcher.ts` 重构: 接入 `WppChannelRuntime`
  - `session.recordInboundSession({ sessionKey, inbound })`
  - `reply.dispatchReplyWithBufferedBlockDispatcher({ sessionKey, inbound, onReply })`
- `setChannelRuntime(runtime)` / `getChannelRuntime()` 注入点 (NOOP 默认)
- `sendAiReply()` 调 vendor sendText 通过 registry
- `src/inbound/hongbao.ts` 新建: `isRedPacketMessage` + `extractRedPacketInfo` + `processRedPacket`
- `src/send/msg.ts` 加 `sendMiniProgram` (XML builder) + `sendAppFromXml` (low-level wrapper)
- `buildAppMsgXml` 公开 (含 type=2001 mini-program 格式 + XML escape)

### Tests
- `tests/dispatcher.test.ts` 8 case (含 NOOP runtime + 真 runtime 抛错 propagate + group session key)
- `tests/v1.1.7-special-msg.test.ts` 12 case (hongbao 检测 + mini-program XML escape)
- 268/268 全绿

## [v1.1.1]
- 2026-08-04 (v1.1.5 消息索引优化)

### Added
- `src/storage/db/mysql.ts` applyMigrations 加 2 复合索引:
  - `idx_account_peer_ts` (account_id, peer_id, ts) — 加速 "get history from this peer" 常见 case
  - `idx_account_msgtype_ts` (account_id, msg_type, ts) — 加速按消息类型查 (Phase D 4-way trigger)
- 之前 `idx_account_chat_ts` + `idx_account_ts` (v1.0.1)

### Tests
- `tests/db.test.ts` 加 2 测试 (3 复合索引齐 / 源码含 ensureIndex 调用)
- 248/248 全绿

## [v1.1.0]
- 2026-08-04 (Setup wizard, Phase WIZ-1~4)

### Added
- `scripts/setup.ts` 4 子命令 (list/add/validate/remove) + 交互式菜单
- `src/setup-wizard.ts` 核心逻辑 (testable, 不依赖 readline)
  - `listAccountsDetailed()`: 列账号 + 状态 (env 配/未配)
  - `validateAccount(id)`: 11 项检查 (accountId/file/JSON/enabled/env 5+1+1/webhook port/apiBaseUrl/webhookSecret/groupPolicy)
  - `writeAccountFile(input)`: 写 accounts/<id>.json (token/authcode 空, 走 env)
  - `removeAccountFile(id)`: 删 file
- `getAccountsDir()` (function, 不是 const) 读 env override (测试隔离)
- `package.json` 加 `setup` script: `tsx scripts/setup.ts`
- `USAGE.md` 加 §9 Setup Wizard (82 行)

### Tests
- `tests/setup-wizard.test.ts` 17 case (mock WPP_ACCOUNTS_DIR + tmpdir 隔离)
- 246/246 全绿

### Verified (Prod)
- 13 份 backup (6 dev tar + 7 prod deploy snapshot)
- 6 轮 real deploy (rollback-backup 模式) + 6 轮 rollback (SHA 字节级一致)

## [v1.0.2] - 2026-08-04 (完整 audit 修复, 8 维度)


### Fixed (8 维度 audit 修复)
- **P1 FIX-1**: Webhook body cap 10MB (`webhook-receiver.ts:36-58` 累计 size, 超 413 + `incRejectedBodySize`)
  - 加 `WEBHOOK_BODY_LIMIT_BYTES=10*1024*1024` 硬 cap 防 memory DoS
  - 测试: `bodyLimitBytes` 构造选项支持小数据测逻辑
- **P2 FIX-2**: Webhook timeout 30s (`req.setTimeout(REQUEST_TIMEOUT_MS)` + `incRejectedTimeout`)
  - 防 slow client DoS
- **P2 FIX-3**: WebhookMetrics 9 → 14 counters 集成 (port from `monitor/webhook.ts`)
  - 新增: `incRejectedBodySize`, `incRejectedTimeout`, `incRejectedSignature`, `incRejectedParse`
  - 文档更新: 9 → 11 (FEATURES.md 11 counters, 实际 14)
- **P2 FIX-4**: docs 数量同步 (README 12→14 tests, FEATURES 9→14 metrics, vendor paths 描述)
- **P3 FIX-5**: 删 `src/multi-agent-stub.ts` 死代码 (1 user = `dispatcher.ts:6`, 改直接 import `session-key.js`)
- **P3 FIX-6**: FEATURES.md vendor paths 描述 ("236 paths via 21 tag modules")
- **P3 FIX-7**: formatErr 统一 (10 文件, 替代 `(e as Error).message` 丢 stack)
  - `src/ws-client.ts`, `src/index.ts`, `src/dispatch/outbound.ts`, `src/dispatch/agent-tools/factory.ts`,
  - `src/api/client.ts`, `src/inbound/handler.ts`, `src/inbound/debouncer.ts`, `src/inbound/enrich.ts`,
  - `src/monitor/ws-client.ts`, `src/monitor/webhook.ts` (10 个文件)
  - return value 保留 `(e as Error).message` (5 处, 5 文件)

### Added
- 新 `tests/webhook-receiver.test.ts` (9 case, 测 14 counters + bodyLimit override + constants)
- `src/core/constants.ts:REQUEST_TIMEOUT_MS = 30_000` (新增, FIX-2)
- `src/monitor/metrics.ts:4 新 inc* helper` (新增, FIX-3)

### Changed
- `webhook-receiver.ts` constructor 加 6 参 `opts?: { bodyLimitBytes?: number }` (测试用, 默认 10MB)
- `WebHookMetrics` 重新组织, 11 → 14 helpers

### Tests
- 207 → **216** (+9: 9 webhook-receiver)
- 14 → **15** test files

### Verified (Prod)
- tsc 0 错, build 干净
- `bash deploy.sh` 19 PASS / 0 FAIL / 0 WARN
- 6 轮 real deploy (v1.0.2 `[WPP v1.0.2]` 加载成功, 6 plugins, 0 warning, 0 error)
- 6 轮 rollback (SHA 字节级一致, 5 plugins 恢复)

### Deferred (5 P3, 不修, 进 ROADMAP)
- P3-4 sync I/O: `readFileSync` 改 `readFile` async (config.ts + mysql.ts)
- P3-5 CI/CD: 加 GitHub Actions
- P3-6 ESLint config: `.eslintrc.json` + ignore `any` + require formatErr in catch

## [v1.0.1] - 2026-08-04 (Phase v1.0.1)

### Fixed (Audit 修复)
- **P1-1**: Webhook 验签 placeholder 实现 (新 `src/core/signature.ts` + `webhook-receiver.ts` 第 5 参 `secret`)
  - `verifyHmacSha256` HMAC-SHA256 + timingSafeEqual 完整实现
  - `signatureRequired` 决定是否需验签 (配了 secret 必需要 X-Signature header)
  - `extractSignatureHeader` 兼容 X-Signature / X-Hub-Signature-256 / X-WPP-Signature
  - vendor 暂未公开签名算法, 未来 vendor 公开后改 `signatureRequired` 强制全 verify
- **P2-1**: AccountRegistry 并发 start 锁 (inFlight Map 序列化 + `_doStart` 拆分)
  - 修复 race: 5 个并发 caller 收同 ctx, 失败后能重试
  - 测试覆盖: 5 并发同 ID, 5 并发不同 ID, 失败路径, 失败后恢复

### Changed
- 版本 `0.1.0` → `1.0.1` (package.json + openclaw.plugin.json + PLUGIN_VERSION)
- `deploy-dryrun.sh` → `deploy.sh` (canonical dry-run, header 升级)
- 新 `deploy-swap.sh` 真实 atomic 部署脚本 (7 步 + rollback 提示)
- `webhook-receiver.ts` 加可选 5 参 `secret`, 向后兼容
- `index.ts` startAccountById 传 `cfg.webhookSecret` 给 webhook 构造

### Tests
- 188 → 207 (+19): 15 signature + 4 concurrent
- 12 test files, ~2900 LOC

## [v1.0.0] - 2026-08-04 (Phase G 完工)

### Added
- **G1** AccountContext class (`src/accounts/account-context.ts`)
  - 单账号环境隔离: config + apiClient + 隔离 logger (4 件套 scoped)
  - 7 mutation 方法 (start/stop/attachWsClient/attachWebhookServer/setVendorAuth/stop)
  - toJSON 脱敏 (tokenKey/authcode/webhookSecret 不进 dump)
- **G2** AccountRegistry class (`src/accounts/account-registry.ts`)
  - 多账号 registry: start/get/has/list/size/stop/stopAll/toJSON
  - **G2-2**: 路由解析 resolve() 精确 + 大小写不敏感 + getOrThrow
  - **G2-3**: DB 持久化 via `upsertAccount / getAccounts / getAccount` (复用已有 `wpp_accounts` 表)
  - setAdapterForTest 测试钩子
- **G3** plugin entry 走 AccountRegistry class API
  - 删 `src/account-state.ts` 13 facade exports, 保留 2 (getDefaultAccountRegistry / resetDefaultRegistry)
  - 删 `src/outbound/index.ts` legacy thin wrapper
  - 改 dispatch/outbound.ts 6 函数 + inbound/index.ts 1 处用 registry.get 替代 getAccountState
  - index.ts sendText/sendImage 静态 import + registry 校验 + 错误信息含 known IDs
- **G3.5** OpenClaw v2026.7.1+ register(api) 契约对齐
  - 默认 export = `plugin` manifest with `register(api)`
  - `register` 调 `api.registerChannel({ plugin: wppChannelPlugin })`
  - wppChannelPlugin 保持 named export (channel 实现)
- **G6** 6 channel config helpers (`src/config-helpers.ts`)
  - listAccountIds / resolveAccount / defaultAccountId / isConfigured / unconfiguredReason / describeAccount
  - 仿 OpenClaw v2026.7.1+ config 字段
- **G7** 完整 channel 结构: meta + capabilities + gateway
  - meta: { id, label, selectionLabel, docsPath, blurb, aliases, quickstartAllowFrom }
  - capabilities: { chatTypes, media, reactions, threads, nativeCommands, blockStreaming }
  - gateway: { startAccount, stopAccount } — 委托 startAccountById / registry.stop

### Changed
- 内部代码全部走 `AccountRegistry` class API (替代 module-level Map singleton)
- `src/dispatch/outbound.ts` (主 outbound) + 删 `src/outbound/index.ts` (legacy)
- `src/multi-agent-stub.ts` re-exports 收敛到 3 (旧 facade 移除)
- 测试: 87 → 188 (+101 cases, 10 test files → 12)

### Verified (Prod)
- 4 轮 dry-run + 4 轮 real deploy + 4 轮 rollback (每次 SHA 字节级一致)
- 0 wechatpadpro 残留错误, 5 原 plugins 持续工作 (本项目/memory-core/memos/minimax/wecom)
- OpenClaw 6 plugins 加载成功: `本项目, memory-core, memos-cloud-openclaw-plugin, minimax, wechatpadpro, wecom`
- OpenClaw 实际调用 config helpers 11+ 次/10s (`loaded account config: default`)

## [v0.1.0] - 2026-08-04 (Phase A-F PoC)

### Added
- Phase A: core (logger/env/paths/constants + util/exec + util/id) ~600 LOC + 16 tests
- Phase B: storage/db (adapter pattern + UPSERT + queryWithTimeout) ~400 LOC + 12 tests
- Phase C: api (vendor HTTP client + 21 tag send 236 paths 1:1 覆盖) ~1500 LOC + 11 tests
- Phase D: inbound (parser + 4-way triggers + debouncer + relay + enrich + handler) ~700 LOC + 27 tests
- Phase E: monitor (metrics + webhook + ws-client) ~600 LOC + 8 tests
- Phase F: outbound + agentTools (87 AI-callable 工具 + 14 dedicated meta) ~1800 LOC + 9 tests
- 总: src 74 文件 7132 LOC, tests 7 文件 1436 LOC, 87 tests 全绿

## [历史]
- 2026-08-04 之前



> 老板 23:01 "继续 P1/P2/P3" + 23:08 "深度多维度审阅, 完整修复优化"
> 完成 8 项: Tools 端点错配修复 / 测试卡死修复 (379/379) / hot-reload 全字段同步 / mention safeMatch / deploy.sh 验证 / API 覆盖率确认 (221/236 注册 / 181 dispatch = 76.7%)

### Fixed (Tools 端点错配 — P1[2])
- **/Tools/CdnDownloadVoice → /Tools/DownloadVoice** (`src/inbound/media-enrich.ts:405`)
  - vendor swagger 仅定义 /Tools/DownloadVoice (无 Cdn 前缀), 之前错调 Cdn 前缀 → vendor 404
- **/Tools/CdnDownloadVideo → /Tools/DownloadVideo** (`src/inbound/media-enrich.ts:371`)
  - 同上, vendor 仅定义 /Tools/DownloadVideo
- /Tools/CdnDownloadImage 保留 (vendor 有定义, 图片专用)

### Fixed (测试卡死 — P1[4])
- **e2e.test.ts**: 修复 DB 共享污染 (setBackend already initialized)
  - e2e-helper.ts: USE_MOCK 默认 true (除非 WPP_E2E_REAL=1), 避免 prod gateway 冲突
  - try/finally + resetAdapter 清理 DB backend singleton
  - webhookPort 0 (随机端口) 避免 4398 冲突
- **gateway-compat.test.ts**: after() 钩子 closeDb + resetAdapter + resetDefaultRegistry
- **config-helpers.test.ts**: 显式删 WECHATPRO_TOKEN_KEY env (测试环境有真 env)
- **package.json**: npm test 加 --test-force-exit (event loop 残留资源不阻塞退出)
- **结果: 379/379 全绿 (23.9s)**

### Fixed (mention safeMatch — P2[1])
- **src/inbound/parser/mention.ts**: matchAll → safeMatchAll (截断 4096 + 灾难 regex 检测)
  - 防恶意构造字符串触发 ReDoS (gewe v3.1.0 A1 教训: (a+)+$ 1000 字符 hang 119s)
- **tests/inbound.test.ts**: 新增 2 个 ReDoS 防御测试 (100KB 输入 500ms 内完成)

### Added (hot-reload 全字段同步测试 — P1[5])
- **tests/hot-reload.test.ts test 7**: 验证 triggerConfig 8 字段热更新
  - requireAtMention / groupPolicy / groupAllowFrom / keywordTrigger / msgTypeTrigger / quoteBotTrigger / blacklistGroups / chatroomDebug

### Verified (API 覆盖率 — P3)
- **221/236 = 93.6%** vendor 端点已注册 (WPP_VENDOR_ENDPOINTS 列表，去重 ShareLink 重复); 真实 dispatch 字符串覆盖 181/236 = 76.7% (其余 55 paths: Login×40 主动移除 + 15 others 非业务必需)
- 剩余 11 个均非业务必需: Admin 3 (DelayAuthKey/DeleteAuthKey/GenAuthKey) + Login 海外 3 (GetQRMac_oversea/GetQR_oversea/GetQRx_oversea) + QWContact 1 (QWAddContact) + Wxapp 4

### Verified (deploy.sh dry-run — P2[3])
- **19 PASS / 0 FAIL / 0 WARN**
- forensic: 0 处 process.exit / 0 处明文 password / 1 处 informational console.log

### DEV.md 更新
- §0.6 待办 8 项全部完成, 更新为 v1.1.32 部署待拍板 + P3 剩余项


> 老板 21:38 / 21:42 / 22:56 三次决定图片引用能力:
> 1. 21:38 → 仅文本引用 (msgType===1)
> 2. 21:42 → "暂时放弃图片引用能力"
> 3. 22:56 → "图片回复能力暂时先保留。还需要继续测试"
> 复合公式 `msgType===1 || content.includes("<refermsg")` 既符合老板 22:56 决定, 又保留图片引用能力可观测性

### Fixed (PLUGIN_VERSION 一致性)
- **版本号 v1.1.27 → v1.1.32** (3 文件同步)
  - `src/core/constants.ts` (PLUGIN_VERSION)
  - `package.json` (version)
  - `openclaw.plugin.json` (version)
  - 原因: deploy 端实际功能已到 v1.1.28+ (引用 XML 全字段 + 复合 shouldQuote + ossutil retry), 但 version 字符串停留在 v1.1.27 (22:32 部署时)

### Fixed (shouldQuote 复合公式)
- **公式 `msgType===1 || content.includes("<refermsg")`**
  - 文本消息 (msgType===1) → 必引用
  - 任何含 `<refermsg>` 标签的消息 (msgType=1/3/43/34/6 等) → 走引用回复
  - 不含 refermsg 的图片/视频/语音/文件 → 走普通文本回复
  - 行为: 老板手动引用过的图 (wpp_svrid_mapping 命中) 可正常引用, 未引用过的图走普通文本 (vendor svrid 不可用)


### Fixed (图片引用恢复)
- `shouldQuote = msgType===1 || msgType===3`
- 老板原话 21:30: "图片我还是希望可以被引用回复"


### Fixed (仿 gewe send/quote.js + handler.ts)
- **src/send/quote-xml.ts** 极简结构 (仿 gewe) — 注: 后被 v1.1.28 修复覆盖为全字段
- **src/send/quote-reply.ts** svrid 来源改 inbound NewMsgId
- **src/inbound/handler.ts** QUOTE 消息 push 原图 OSS URL 到 AI 多模态上下文
  - 仿 gewe handler.ts:170-194 quoteDetails.mediaUrl 注入
- **src/dispatch/dispatcher.ts** 删除 v1.1.26-IMG-ECHO
  - 老板 21:27 实测: "发了单独的图片, 结果你把图片又发给我了" → 删 IMG-ECHO
- **AI 多模态识别图能力 (P0 验证通过)**
  - 老板测试: "你识别到被引用到图片了" ✅


### Fixed (DB 不存 OSS URL bug)
- `src/inbound/media-enrich.ts`: ossutil 加 60s timeout + 3 次 retry + 指数 backoff
  - 老板 20:59:15 那张图 ossutil 临时失败 (code=null signal=SIGKILL) → AI 看不到 URL
  - fix: 失败时 warn + retry, 3 次仍失败抛错 (handler 兜底 DB save)
- `src/inbound/handler.ts`: 改 onFlush 顺序 — 先 enrich 再 enrichBatch
  - 之前: enrichBatch (DB save 原始 m.content) → enrich (内存修改 m.content)
  - 之后: enrich 先 (DB 落 enrich 后的 content) → enrichBatch


> 老板实测: 引用回复发送成功 (Code=0), 但 vendor WPP 渲染异常
> 根因: v1.1.30 仿 gewe 极简结构 (type=57 + 仅 svrid) 在 vendor WPP 上:
>   - type=57 可能被 vendor 识别为"合并转发"而非引用
>   - refermsg 只有 svrid → vendor 无法渲染引用块 (无 fromusr/displayname 等)
>   - 缺 <des> 字段 → 客户端可能不显示正文

### Fixed (引用 XML 全字段)
- **src/send/quote-xml.ts**: 加 <des> + refermsg 6 字段
  - type (1=文本 / 3=图片 / 43=视频 / 49=文件)
  - fromusr (被引用人 wxid)
  - chatusr (会话 wxid)
  - displayname (被引用人昵称)
  - content (被引用消息原文)
  - createtime (被引用消息时间)
- **src/send/quote-reply.ts**: 从 DB 补全 refermsg 全字段
  - 新增 `opts: { innerType: 49 | 57 }` (默认 57 gewe 兼容, 失败回退 49 vendor WPP 标准)
- **src/dispatch/dispatcher.ts**: replyTo 类型扩展透传 6 字段
  - fromWxid / chatroomId / fromNickname / originalContent / createtime / innerType
- **tests/quote-xml.test.ts**: 7/7 case 更新适配新结构


老板之前部署的版本, 因 manifest 缺 id 爆网关 status=78, 已撤回 (`/data/wechatpadpro-removed-20260804-104900/`).
完整 v0.1.0 PoC 后由 v1.0.0 (Phase G 完工) + v1.0.1 (audit 修复) 取代.
