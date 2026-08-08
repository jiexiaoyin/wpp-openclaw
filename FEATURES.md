# Features (FEATURES.md)

WeChatPadPro OpenClaw Plugin v1.1.15 完整功能清单 (162 agent tools + 236 vendor paths (via 21 tag modules) + 6 channel config helpers + 21 Prometheus metrics).

## 1. 87 Agent Tools (OpenClaw AI 可调用)

按 OpenClaw domain 分组, 14 dedicated meta 文件 + 1 misc-meta (合并 7 小 tag).

### 1.1 Message Domain (`msg-meta.ts`) — 6 tools
| Tool | Vendor Endpoint | 用途 |
|---|---|---|
| `send_text` | POST /Msg/SendTxt | 发送文本消息 (支持 @) |
| `send_image` | POST /Msg/SendImg | 发送图片 (vendor 先 /UploadImg 拿 imgUrl) |
| `send_voice` | POST /Msg/SendVoice | 发送语音 |
| `send_video` | POST /Msg/SendVideo | 发送视频 (thumbUrl 可选) |
| `send_app` | POST /Msg/SendApp | 发送 APP 消息 (XML) |
| `revoke_msg` | POST /Msg/Revoke | 撤回消息 (需 msgId + newMsgId) |

### 1.2 Friend Domain (`friend-meta.ts`) — 2 tools
| Tool | Vendor Endpoint | 用途 |
|---|---|---|
| `get_contact_list` | POST /Friend/GetContractList | 拉联系人列表 |
| `search_friend` | POST /Friend/Search | 按 wxid 搜索 |

### 1.3 Group Domain (`group-meta.ts`) — 2 tools
| Tool | Vendor Endpoint | 用途 |
|---|---|---|
| `get_chatroom_info` | POST /Group/GetChatRoomInfo | 群信息 (memberCount/owner) |
| `get_chatroom_member_list` | POST /Group/GetChatRoomMemberList | 群成员列表 |

### 1.4 FriendCircle Domain (`friendcircle-meta.ts`) — 1 tool
| Tool | Vendor Endpoint | 用途 |
|---|---|---|
| `get_friend_circle` | POST /FriendCircle/Get | 朋友圈 |

### 1.5 Login Domain (`login-meta.ts`) — 4 tools
| Tool | Vendor Endpoint | 用途 |
|---|---|---|
| `get_login_qr` | POST /Login/GetQR | 获取登录二维码 |
| `check_login` | POST /Login/CheckQR | 检查扫码状态 |
| `logout` | POST /Login/LogOut | 登出 |
| `heartbeat` | POST /Login/HeartBeat | 心跳保活 |

### 1.6 User Domain (`user-meta.ts`)
| Tool | Vendor Endpoint | 用途 |
|---|---|---|
| `get_profile` | POST /User/GetContractProfile | 当前用户 profile |

### 1.9 Tools Domain (`tools-meta.ts`) — 1 tool
| Tool | 用途 |
|---|---|
| `build_session_key` | 算 session key (供 AI 自组) |

### 1.10 misc-meta (合并 7 小 tag) — 50+ tools
Admin / Finder / Search / Webhook / Wxapp / OfficialAccounts / TenPay 等小 tag 合并到 misc-meta, 50+ tools (vendor 236 paths 全覆盖 via 21 tag modules).

## 2. 236 Vendor Paths 覆盖 (via 21 tag modules)

按 vendor swagger.json 21 tag 分组, 每个 tag 1 个 module 在 `src/send/<tag>.ts`:

| Tag | 端点数 | Phase |
|---|---|---|
| Login | 4 | C |
| Admin | 2 | C + F |
| User | 1 | C + F |
| Msg | 18 | C + F |
| Group | 12 | C + F |
| Friend | 5 | C + F |
| Chatroom | 3 | C + F |
| Contact | 3 | C + F |
| Search | 2 | C + F |
| Webhook | 3 | C + F |
| Moment | 2 | C + F |
| Label | 4 | C + F |
| Favorite | 3 | C + F |
| Sns | 2 | C + F |
| Wxapp | 5 | C + F |
| OfficialAccounts | 2 | C + F |
| Card | 3 | C + F |
| TenPay | 2 | C + F |
| Finder | 2 | C + F |
| Tools | 1 | C + F |
| System | 1 | C + F |

## 3. 6 Channel Config Helpers (OpenClaw runtime)

| Helper | 用途 |
|---|---|
| `listAccountIds(cfg)` | 列所有 account ID (从 accounts/ 目录读) |
| `resolveAccount(cfg, accountId?)` | 解析账号 (从 accounts/<id>.json 读) |
| `defaultAccountId()` | 默认账号 ID (`"default"`) |
| `isConfigured(account)` | 是否配置 (tokenKey + apiBaseUrl + enabled) |
| `unconfiguredReason(account)` | 未配置原因 (供 OpenClaw 诊断显示) |
| `describeAccount(account)` | 账号描述 (供日志/UI) |

## 4. Inbound 4-way Trigger

| Trigger | 适用 |
|---|---|
| **@mention** | 群聊需 @bot (默认 enabled, requireAtMention: true) |
| **keyword** | 命中关键词触发 (config 中 enabled 才生效) |
| **msgType** | 特定消息类型触发 (接龙 type=53 等) |
| **quoteBot** | 引用 bot 消息触发 |

其它规则: blacklist 短路, chatroomDebug 强制触发, requireAtMention + keyword disabled 时群不触发.

## 5. Debouncer

- 1.5s 默认合并窗口 (`debounceMs: 1500`)
- key = `${accountId}:${peerKind}:${peerId}:${fromWxid}` (per-账号 per-peer per-sender)
- **VOICE / SYSTEM / control command bypass** (直 flush 不合并)

## 6. 14 Prometheus Metrics (v1.1.15 +5)

| Metric | 用途 | v1.1.15 状态 |
|---|---|---|
| `webhook_received_total` | 收到 webhook 总数 | ✅ |
| `webhook_processed_total` | 成功处理总数 | ✅ |
| `webhook_rejected_path_total` | path 不匹配拒绝 | ✅ |
| `webhook_rejected_secret_total` | token 错拒绝 | ✅ |
| `webhook_rejected_dedupe_total` | dedupe 命中拒绝 | ✅ |
| `webhook_rejected_signature_total` | v1.1.15 P1-1: signature 验证失败 (placeholder) | ✅ |
| `webhook_rejected_body_size_total` | v1.1.15 P1-1: body 超 10MB 拒绝 | ✅ NEW |
| `webhook_rejected_timeout_total` | v1.1.15 P2-1: 请求 30s timeout | ✅ NEW |
| `webhook_rejected_parse_total` | JSON parse 失败 | ✅ |
| `webhook_rejected_policy_total` | 策略拒绝 | ✅ |
| `webhook_saved_db_total` | 消息持久化成功 | ✅ |
| `enrich_save_failed_total` | enrich 失败 | ✅ |
| `handler_onerror_total` | handler 错误 | ✅ |
| `dispatch_dispatch_total` | 派发成功 | ✅ |

## 7. DB Schema (7 表)

| 表 | 用途 |
|---|---|
| `accounts` | 账号元数据 + vendor 鉴权状态 (G2-3 持久化) |
| `messages` | 消息持久化 (inbound + outbound) |
| `contacts` | 联系人缓存 |
| `chatrooms` | 群信息缓存 |
| `session_state` | 会话状态 (debouncer / 触发器) |
| `api_calls` | vendor API 审计 |
| `accounts` (复用) | G2-3 持久化的账号元数据 |

完整 schema 见 `db/schema.sql`.

## 8. 老板铁律 (features 受其约束)

- 凭证单一来源 env var (tokenKey/authcode/webhookSecret 走 env)
- B 方案 (accounts/<id>.json 独立配置)
- 备份放 /data (deploy 前必做)
- 不动 /root/.openclaw/openclaw.json (部署时也不能改)

## 9. 已识别未实现 (future work)

- **Webhook 签名验证 full mode** (v1.1.15 placeholder, 等 vendor 公开算法后切 strict)
- **多账号 UI / setup wizard** (Phase H docs, 等 v1.1)
- **silk/STT 语音转文字 pipeline** (vendor 暂未公开)
- **S3/OSS 媒体存储** (vendor 暂未要求)
- **E2E 真凭证测试** (需老板给 WECHATPRO_DB_PASSWORD 真值)
