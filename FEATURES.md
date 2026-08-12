# Features (FEATURES.md)

WeChatPadPro OpenClaw Plugin **v1.2.0** 完整功能清单: 159 agent tools + 231 vendor endpoints (20 tag modules) + 6 channel config helpers + Prometheus metrics。

## 1. 159 Agent Tools (OpenClaw AI 可调用)

按 vendor tag 分组, 13 dedicated meta 文件 + 1 misc-meta (合并 7 小 tag)。

### 1.1 Message Domain (`msg-meta.ts`)
| Tool | Vendor Endpoint | 用途 |
|---|---|---|
| `send_text` | POST /Msg/SendTxt | 发送文本 (支持 @) |
| `send_image` | POST /Msg/SendImg | 发送图片 |
| `send_voice` | POST /Msg/SendVoice | 发送语音 |
| `send_video` | POST /Msg/SendVideo | 发送视频 |
| `send_app` | POST /Msg/ShareLink | 发送 APP 消息 (XML) |
| `quote_reply` | POST /Msg/ShareLink | 引用回复 (type=57) |
| `revoke_msg` | POST /Msg/Revoke | 撤回消息 |

### 1.2 Friend / Group / FriendCircle / Login / User / Tools 等 domain
每个 vendor tag 一个 dedicated meta 文件 (friend-meta / group-meta / friendcircle-meta / login-meta / user-meta / tools-meta ...), 共 **159 tools**。

完整工具清单可由 AI 调用时列出, 或 `agent-tools/index.ts` 查看。

### 1.3 misc-meta (合并 7 小 tag)
Admin / Finder / Search / Webhook / Wxapp / OfficialAccounts / TenPay 等小 tag 合并到 misc-meta。

## 2. 231 Vendor Paths 覆盖 (via 20 tag modules)

按 vendor swagger 分组, 每个 tag 1 个 module 在 `src/send/<tag>.ts`。SSOT: `src/send/index.ts` 的 `WPP_VENDOR_ENDPOINTS` (20 tag, 231 endpoint)。

| Tag | 端点数 |
|---|---:|
| Msg | 17 |
| Group | 21 |
| Friend | 12 |
| FriendCircle | 11 |
| Search | 18 |
| Webhook | 4 |
| Wxapp | 20 |
| OfficialAccounts | 12 |
| TenPay | 7 |
| Finder | 15 |
| Tools | 14 |
| User | 15 |
| Label | 5 |
| Favor | 4 |
| Voice / Translate / SayHello / QWContact | 10 |
| Login | 31 |
| Customized | ... |
| (其他 tag) | ... |

> 注: 具体端点数以 `WPP_VENDOR_ENDPOINTS` 为准 (审计发现 swagger 快照 236 与实现 231 有漂移, 以代码 SSOT 为真)。

## 3. 6 Channel Config Helpers (OpenClaw runtime)

| Helper | 用途 |
|---|---|
| `listAccountIds(cfg)` | 列所有 account ID (从 accounts/ 目录读) |
| `resolveAccount(cfg, accountId?)` | 解析账号 (从 accounts/<id>.json 读) |
| `defaultAccountId()` | 默认账号 ID (`"default"`) |
| `isConfigured(account)` | 是否配置 (tokenKey + apiBaseUrl + enabled, 支持 env var fallback) |
| `unconfiguredReason(account)` | 未配置原因 (供 OpenClaw 诊断显示) |
| `describeAccount(account)` | 账号描述 (供日志/UI) |

## 4. Inbound 4-way Trigger

| Trigger | 适用 |
|---|---|
| **@mention** | 群聊需 @bot (默认 enabled) |
| **keyword** | 命中关键词触发 (config 中 enabled 才生效) |
| **msgType** | 特定消息类型触发 (接龙 type=53 等) |
| **quoteBot** | 引用 bot 消息触发 |

其它规则: blacklist 短路, chatroomDebug 强制触发, groupPolicy 门禁 (open/disabled/allowlist/closed), DM allowFrom fail-closed。

> 注: `requireAtMention` 配置当前未在 `shouldTrigger` 内实现 (字段存在但未消费)。

## 5. 媒体处理 (v1.1.56+)

| 类型 | 处理 |
|---|---|
| 图片 v0 | content 含 `<img>` XML → `/Tools/CdnDownloadImage` 完整大图 → OSS |
| 图片 v1 | content="收到一张图片" → `/Tools/DownloadImg + local_id` → 64KB JPEG (vendor 硬限) → OSS |
| 语音 | `/Tools/DownloadVoice` → OSS + SiliconFlow STT 转写文字 |
| 视频 | `/Tools/DownloadVideo` → OSS |
| 文件 v0 | `<appmsg><type>6/8</type>` → `/Tools/DownloadFile` → OSS |
| 文件 v1 | 仅文件名元数据 (vendor 无下载 API) → 确定性回复 (v1.2.0 绕过 AI) |

AI 多模态通过 ctx `MediaUrls/MediaPaths/MediaTypes` 数组看到媒体 (gewe 范式)。

## 6. 引用回复 (v1.1.55 修复)

- appmsg type=57, **title = AI 回复文字** (客户端主气泡读 title, des 被吞)
- refermsg 极简: svrid + fromusr
- 全 msgType 引用 (v1.1.50 拍板放开)
- vendor /Msg/Quote 接口 ret=-2 不可用 → 走 /Msg/ShareLink + 自构造 XML

## 7. 文件确定性回复 (v1.2.0)

v1 schema 文件消息 (只有文件名, 无法下载内容) → **完全绕过 AI**, plugin 直接回固定模板:
"收到「文件名」📎 但我当前无法读取文件内容..." — 防 AI 误读系统旧文件 (v1.1.58 事故), 省 token, 100% 不出错。

## 7b. MCP 增强 (v1.2.0)

集成 vendor MCP 服务 (`127.0.0.1:8062/mcp`), 文件消息经 `wechat_get_recent_messages` (只读工具) 尝试拿完整 payload 里的 CDN URL → 下载 → OSS → AI 读到。

- **鉴权**: `Authorization: Bearer <WECHATPRO_AUTHCODE>` (实测, 非 TokenKey)
- **只调只读工具** (7 个), 不碰写 (mcp_write_enabled=false)
- **开关**: `accounts/<id>.json` 的 `mcpEnabled` (默认 false, 防 realtime 未开通时白耗 5s)
- **前置**: 需 vendor 套餐开通 **realtime** 权限 (否则 `wechat_get_recent_messages` 返 `mcp_realtime_forbidden`)
- 开通 realtime 后改 `mcpEnabled=true` 即生效 (代码已就绪, v1.2.0 已 deploy)

## 8. DB Schema (wpp_ 前缀表)

| 表 | 用途 |
|---|---|
| `wpp_messages` | 消息持久化 (inbound + outbound, UNIQUE 去重) |
| `wpp_svrid_mapping` | 引用 svrid 映射 (md5 → svrid) |
| `wpp_sync_state` | Synckey 增量游标持久化 |
| (其他) | 见 `db/schema.sql` |

## 9. 已识别未实现 (future work)

- **多账号 UI / 统一管理界面** (当前 CLI setup wizard)
- **v1 schema 文件内容下载** (vendor 无 API, 需联系 knowhub.cloud)
- **图片 >64KB 完整下载** (vendor /Tools/DownloadImg 硬限 64KB)
- **E2E 真凭证测试** (需老板给 WECHATPRO_DB_PASSWORD 真值 + 真扫码 authcode)
