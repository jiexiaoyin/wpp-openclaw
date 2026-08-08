# Usage Guide (USAGE.md)

> v1.1.15 (Phase G 全完工 + v1.1.15~v1.1.15 增量: setup wizard + E2E + S3 SDK + AI dispatcher + 特殊消息 + 多算法验签 + migrate)

WeChatPadPro OpenClaw Plugin v1.1.15 在 OpenClaw 框架下的使用指南 (162 agent tools + 配置 + 路由).

## 1. 加载到 OpenClaw

### 1.1 部署位置
```
/root/.openclaw/extensions/wechatpadpro/
├── dist/                    # tsc 编译产物
├── openclaw.plugin.json     # manifest
├── package.json             # 含 "openclaw.extensions" 字段
├── node_modules/            # 49M, 含 mysql2/typebox/undici/ws
├── config.json              # DB 配置
└── accounts/default.json    # 默认账号配置
```

### 1.2 OpenClaw 加载流程
1. Gateway 启动时扫 `extensions/<id>/package.json` 的 `openclaw.extensions` 字段
2. 加载 `dist/index.js` (default export = `plugin`)
3. 调 `plugin.register(api)`
4. `register` 调 `api.registerChannel({ plugin: wppChannelPlugin })`
5. OpenClaw 调 `wppChannelPlugin.config.{listAccountIds, resolveAccount, ...}` 查账号
6. OpenClaw 调 `wppChannelPlugin.gateway.startAccount(ctx)` 启动账号

## 2. 87 Agent Tools (AI 可调用)

按 OpenClaw domain 分组, 完整清单见 [FEATURES.md](./FEATURES.md).

### 2.1 Message Domain (msg-meta.ts)
- `wpp_send_text(accountId, toWxid, text, ats?)` — 发送文本
- `wpp_send_image(accountId, toWxid, imageUrl)` — 发送图片
- `wpp_send_voice(accountId, toWxid, voiceUrl, durationMs?)` — 发送语音
- `wpp_send_video(accountId, toWxid, videoUrl, thumbUrl?)` — 发送视频
- `wpp_send_app(accountId, toWxid, xml, appName?)` — 发送 APP 消息
- `wpp_revoke_msg(accountId, toWxid, msgId, newMsgId)` — 撤回消息

### 2.2 Friend Domain (friend-meta.ts)
- `wpp_get_contact_list(accountId)` — 获取联系人列表
- `wpp_search_friend(accountId, wxid)` — 搜索好友

### 2.3 Group Domain (group-meta.ts)
- `wpp_get_chatroom_info(accountId, chatroomId)` — 群信息
- `wpp_get_chatroom_member_list(accountId, chatroomId)` — 群成员

... (其它 11 个 domain 见 FEATURES.md)

## 3. Tool 调用示例 (AI 视角)

AI 在 OpenClaw runtime 调这些 tool, 例如:
```typescript
// AI 调 wpp_send_text 发消息
const result = await wppChannelPlugin.sendText("default", "wxid_xxx", "hello", ["wxid_yyy"]);
if (result.ok) {
  console.log("sent, msgId=" + result.msgId);
} else {
  console.error("failed: " + result.error);
}
```

## 4. Inbound 接收 (vendor → AI)

### 4.1 路径
- vendor 推送 webhook → `http://0.0.0.0:4398/wechatpadpro/webhook` (默认)
- 备援: `?token=<webhookSecret>` query token
- v1.1.15 P1-1: `X-Signature` HMAC 验签 (配了 `webhookSecret` 才启用)

### 4.2 流程
1. vendor POST → 我们的 `WechatpadproWebhookServer` 接收
2. 验签 + 验 path + body size check
3. JSON parse → `WppWebhookPayload`
4. `enrichAndSaveMessage` (DB 写入 + 派生字段)
5. `payloadToInboundMessage` → `WppInboundMessage`
6. `shouldTrigger` 4-way trigger (DM/keyword/msgType/quoteBot)
7. `WppInboundDebouncer` 1.5s 合并
8. `dispatchInboundToOpenClaw` → OpenClaw agent

## 5. 路由与会话

### 5.1 Session Key
由 `wppChannelPlugin.buildSessionKey({ agentId, accountId, peerKind, peerId })` 计算.

格式: `<agentId>:<accountId>:<peerKind>:<peerId>`
- `agentId` = "main" (default)
- `accountId` = "default" (B 方案单账号)
- `peerKind` = "direct" | "group" | "room"
- `peerId` = wxid 或 chatroomId

例: `main:default:direct:wxid_alice`

### 5.2 多账号路由
v1.1.15 + Phase G 后支持多账号:
- `accounts/alice.json` + `accounts/bob.json` 各 1 账号
- 配置文件 `WECHATPRO_ALICE_TOKEN_KEY` + `WECHATPRO_BOB_TOKEN_KEY`
- 各自 vendor 后台拿 token
- `AccountRegistry` 自动发现 (启动时扫 accounts/ 目录)

## 6. 关键配置项

### 6.1 config.json (全局)
```json
{
  "storage": {
    "saveHistory": true,
    "db": {
      "backend": "mariadb",
      "mariadb": {
        "host": "1Panel-mariadb-RlbK",
        "port": 3306,
        "user": "wechatpro",
        "passwordEnv": "WECHATPRO_DB_PASSWORD",
        "database": "wechatpro",
        "connectionLimit": 5
      }
    }
  }
}
```

### 6.2 accounts/default.json (账号)
```json
{
  "enabled": true,
  "tokenKeyEnv": "WECHATPRO_TOKEN_KEY",
  "authcodeEnv": "WECHATPRO_AUTHCODE",
  "apiBaseUrl": "https://wx.juhe.chat",
  "wsUrl": "wss://wx.juhe.chat/ws/sync",
  "webhookHost": "0.0.0.0",
  "webhookPort": 4398,
  "webhookPath": "/wechatpadpro/webhook",
  "webhookSecret": "",  // v1.1.15 P1-1: 配了则启用 signature 验签
  "allowFrom": [],
  "groupPolicy": "open",
  "groupAllowFrom": [],
  "selfWxid": "",
  "nickname": "益融小助理",
  "requireAtMention": true,
  "debounceMs": 1500
}
```

## 7. 监控

### 7.1 Prometheus metrics
- `GET http://127.0.0.1:4398/metrics` (如果启用)
- 9 个 counters: received, processed, rejected_path, rejected_secret, rejected_dedupe, ...

### 7.2 健康检查
- `GET http://127.0.0.1:4398/healthz` → "ok"

### 7.3 日志
- 全部走 `core/logger.ts` (仿 pino 接口, 4 级: INFO/WARN/ERROR/DEBUG)
- DEBUG 启用: `WPP_DEBUG=1` env
- 格式: `ISO-timestamp LEVEL [WPP v1.1.15] msg key=value key2=value2`

## 8. 老板的 OpenClaw 上下文

- **OpenClaw gateway**: `systemctl --user status openclaw-gateway`
- **vendor 文档**: `https://adminmax.knowhub.cloud/swagger` (vendor 后台, 需 token)
- **vendor 反代**: `https://wx.juhe.chat/api/...` (HTTP) + `wss://wx.juhe.chat/ws/sync` (WS)
- **本项目 共存**: 不冲突, 各自 236 paths (各自独立 paths)

## 9. Setup Wizard (v1.1.15 新增)

交互式 CLI 管理账号 (`npm run setup`).

### 9.1 子命令

```bash
npm run setup                       # 交互式菜单
npm run setup list                   # 列所有账号 + 状态
npm run setup add [accountId]        # 加新账号 (B 方案, 凭证走 env)
npm run setup validate [accountId]   # 校验账号配置 + env
npm run setup remove [accountId]     # 删账号 file
```

### 9.2 示例: 加新账号

```bash
$ npm run setup add alice

为新账号 'alice' 收集配置 (token/authcode 走 env var, 不落盘):

启用 (true/false) [true]: 
API base URL [https://wx.juhe.chat]: 
WebSocket URL [wss://wx.juhe.chat/ws/sync]: 
tokenKey env var 名称 [WECHATPRO_ALICE_TOKEN_KEY]: 
authcode env var 名称 [WECHATPRO_ALICE_AUTHCODE]: 
webhook host [0.0.0.0]: 
webhook port [4398]: 
webhook path [/wechatpadpro/webhook]: 
webhookSecret env var (留空=不验签): 
allowFrom 私聊白名单 (逗号分隔, 留空=全部): 
group 策略 (open/disabled/allowlist) [open]: 
nickname [alice]: 
群聊需 @ 才回复 (true/false) [true]: 
debounce 毫秒 [1500]: 

将写 accounts/alice.json:
{
  "enabled": true,
  "tokenKey": "",
  "tokenKeyEnv": "WECHATPRO_ALICE_TOKEN_KEY",
  ...
}

确认写入 (Y/n): y

✓ 账号 'alice' 已创建

下一步:
  1. 注入 env: export WECHATPRO_ALICE_TOKEN_KEY="<your_token_key>"
           export WECHATPRO_ALICE_AUTHCODE="<your_authcode>"
  2. 部署: bash deploy-swap.sh --force
  3. 验证: npm run setup validate alice
```

### 9.3 验证输出

```bash
$ npm run setup validate default
验证账号 'default':

  ✓ accountId 合法
  ✓ accounts file 存在 — /path/to/accounts/default.json
  ✓ JSON 解析
  ✓ enabled — true
  ✗ env WECHATPRO_TOKEN_KEY — 未设
  ⚠ env WECHATPRO_AUTHCODE — 未设 (扫码登录前可空)
  ✓ apiBaseUrl — https://wx.juhe.chat
  ✓ webhook port 4398 — 范围有效
  ⚠ webhookSecret (HMAC 验签) — 未配 (vendor 公开算法后启用)

结果: 5 pass, 2 warn, 1 fail
```

### 9.5 setup migrate (v1.1.15+)

```bash
# 从老 v0.1.0 config.json (单账号 inline) 迁到 v1.1 (accounts/<id>.json B 方案)
$ npm run setup migrate

目标 accountId (留空用 'default') [default]: alice
从 ./config.json 迁到 accounts/alice.json? (老 config.json 会备份) (Y/n): y

✓ 迁移完成:
  accountId:    alice
  老文件备份:   ./config.json.migrate-backup.1755000000000
  新文件:       ./accounts/alice.json
  tokenKeyEnv:  WECHATPRO_ALICE_TOKEN_KEY
  authcodeEnv:  WECHATPRO_ALICE_AUTHCODE
  webhookSecretEnv: WECHATPRO_ALICE_WEBHOOK_SECRET

下一步:
  1. 在 env 设真凭证: export WECHATPRO_ALICE_TOKEN_KEY="<token>"
                    export WECHATPRO_ALICE_AUTHCODE="<扫码 authcode>"
  2. 验证: npm run setup validate alice
  3. 部署: bash deploy-swap.sh --force
```

转换细节:
- `tokenKey` (明文) → `tokenKeyEnv` (env var 名) + `tokenKey=""` (清空)
- `authcode` (明文) → `authcodeEnv` (env var 名) + `authcode=""` (清空)
- `webhookSecret` (明文) → `webhookSecretEnv` (env var 名) + `webhookSecret=""` (清空, 空时不生成 env)
- 老 `config.json` 备份到 `config.json.migrate-backup.<ts>` (不删除, 老板手动检查)
- 已存在 `accounts/<id>.json` 时抛错 (防覆盖)

### 9.4 设计要点

- **accountId 安全**: `isValidAccountId` 正则 `^[a-zA-Z0-9_-]{1,64}$`, 防 path traversal
- **凭证隔离**: tokenKey/authcode 走 env var, accounts/<id>.json 永远不含明文
- **环境变量可覆盖**: `WPP_ACCOUNTS_DIR=...` 测试用 (默认 `cwd/accounts`)
- **0 依赖**: 用 node:readline (built-in), 不引入 inquirer/prompts
- **可测试**: 核心逻辑 (listAccountsDetailed/validateAccount/writeAccountFile) 在 `src/setup-wizard.ts` 纯函数, 测无 readline 依赖
