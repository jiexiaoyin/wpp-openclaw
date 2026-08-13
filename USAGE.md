# Usage Guide (USAGE.md)

> **当前部署版本: v1.3.54** (2026-08-13)
> **CHANGELOG**: 54 个版本条目,最新见 [CHANGELOG.md](./CHANGELOG.md)
> **快速开始**: 见 [GETTING_STARTED.md](./GETTING_STARTED.md)
> **老板铁律**(必读): 见 [DEV.md §10](./DEV.md#10-老板铁律项目铁律勿违反)

WeChatPadPro OpenClaw Plugin 在 OpenClaw 框架下的使用指南 (179+ agent tools + 配置 + 路由).

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

## 2. 179+ Agent Tools (AI 可调用)

完整清单见 [FEATURES.md](./FEATURES.md)。

核心工具 (Message Domain):
- `send_text(accountId, toWxid, text, ats?)` — 发送文本
- `send_image(accountId, toWxid, imageUrl)` — 发送图片
- `send_voice(accountId, toWxid, voiceUrl, durationMs?)` — 发送语音
- `send_video(accountId, toWxid, videoUrl, thumbUrl?)` — 发送视频
- `quote_reply(accountId, toWxid, content, msgId)` — 引用回复
- `revoke_msg(accountId, toWxid, msgId, newMsgId)` — 撤回消息

其余 150+ tools 覆盖 Friend/Group/Login/User/Tools/Wxapp/TenPay 等全部 vendor tag。

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
- vendor 推送 webhook → `http://127.0.0.1:4398/wechatpadpro/default/webhook` (默认, 仅本机监听)
- 业务回调 → `/wechatpadpro/default/webhook/business` (完整消息推送)
- `X-Signature` HMAC 验签 (配了 `webhookSecret` 才启用)

### 4.2 流程
1. vendor POST → 我们的 `WechatpadproWebhookServer` 接收
2. 验签 + 验 path + body size check (10MB cap)
3. JSON parse → `WppWebhookPayload`
4. media enrich (图片/语音/视频/文件下载 + OSS)
5. `payloadToAllInboundMessages` → `WppInboundMessage`
6. `shouldTrigger` 4-way trigger (DM/keyword/msgType/quoteBot)
7. `WppInboundDebouncer` 1.5s 合并
8. `dispatchInboundToOpenClaw` → OpenClaw agent

## 5. 路由与会话

### 5.1 Session Key
由 `wppChannelPlugin.buildSessionKey({ agentId, accountId, peerKind, peerId })` 计算, 对齐 framework parseSessionDeliveryRoute (v1.1.48)。

格式:
- **DM/direct**: `agent:<agentId>:<channelId>:<accountId>:direct:<peerId>` (6 段含 accountId)
- **group**: `agent:<agentId>:<channelId>:group:<peerId>` (5 段无 accountId)

例: `agent:wpp-wechat:wechatpadpro:default:direct:wxid_alice` / `agent:wpp-wechat:wechatpadpro:group:xxx@chatroom`

### 5.2 多账号路由
AccountRegistry 多账号支持:
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
  "webhookHost": "127.0.0.1",
  "webhookPort": 4398,
  "webhookPath": "/wechatpadpro/default/webhook",
  "webhookSecret": "",  // 配了则启用 signature 验签
  "allowFrom": ["q139198824", "jsnjzhou"],  // 私聊白名单 (老板主号等)
  "groupPolicy": "allowlist",
  "groupAllowFrom": ["xxx@chatroom"],
  "selfWxid": "wxid_eezdbu1ytws422",  // ⚠️ bot 自己 wxid (益融小助理), 不是老板号
  "nickname": "益融小助理",            // bot 昵称 (群 @ 中文匹配)
  "agent": "wpp-wechat",               // ⚠️ 必填且禁止 "main"
  "requireAtMention": true,
  "debounceMs": 1500
}
```

> ⚠️ **selfWxid 语义 (v1.3.52 审计教训)**: `selfWxid` 必须是 **bot 自己** 的 wxid (handler.ts 用 `fromWxid===selfWxid` 判 bot 自聊), 不是老板主号。当前 = 益融小助理 `wxid_eezdbu1ytws422`。
```

## 7. 监控

### 7.1 Prometheus metrics
- 14+ counters: received, processed, rejected_path, rejected_secret, rejected_dedupe, rejected_signature, rejected_body_size, rejected_timeout, ...

### 7.2 健康检查
- 通过 OpenClaw gateway 健康接口检查

### 7.3 日志
- 全部走 `core/logger.ts` (仿 pino 接口, 4 级: INFO/WARN/ERROR/DEBUG)
- DEBUG 启用: `WPP_DEBUG=1` env
- 格式: `ISO-timestamp LEVEL [WPP v1.3.54] msg key=value key2=value2`

## 8. 老板的 OpenClaw 上下文

- **OpenClaw gateway**: `systemctl --user status openclaw-gateway`
- **vendor 文档**: `https://adminmax.knowhub.cloud/swagger` (vendor 后台, 需 token)
- **vendor 反代**: `https://wx.juhe.chat/api/...` (HTTP) + `wss://wx.juhe.chat/ws/sync` (WS)
- **GeWe 插件共存**: 不冲突, 各自独立 endpoints

## 9. Setup Wizard

交互式 CLI 管理账号 (`npm run setup`).

### 9.1 子命令

```bash
npm run setup                       # 交互式菜单
npm run setup list                   # 列所有账号 + 状态
npm run setup add [accountId]        # 加新账号 (v1.3.56: 每账号独立 agent wpp-<id> + 共享 webhook 端口 + openclaw.json 登记)
npm run setup validate [accountId]   # 校验账号配置 + env
npm run setup modify [accountId]     # v1.3.56: 交互式编辑 (agent/白名单/端口/env名/群策略)
npm run setup remove [accountId] [--clean]  # 删账号 file (--clean 连带删 agent + binding)
npm run setup migrate [configPath]   # 迁移 v0.1.0 config.json → accounts/<id>.json
npm run setup pair [accountId]       # 生成 DM 配对码
```

**多账号 (一 authcode = 一 agent = 一账号, v1.3.56)**:
- `add wechatA` → 建 `accounts/wechatA.json` + agent `wpp-wechatA` + 自动登记 openclaw.json (`channels.wechatpadpro.accounts.wechatA` + binding `{channel:"wechatpadpro", accountId:"wechatA"}`)
- 所有账号共享 webhook 端口 (4398, v1.3.61 path 区分), 独立 env (`WECHATPRO_<ID>_TOKEN_KEY/AUTHCODE`)
- `remove <id> --clean` 连带清理 agent workspace + binding (防残留)

### 9.2 示例: 加新账号

```bash
$ npm run setup add alice

为新账号 'alice' 收集配置 (token/authcode 走 env var, 不落盘):

启用 (true/false) [true]: 
API base URL [https://wx.juhe.chat]: 
WebSocket URL [wss://wx.juhe.chat/ws/sync]: 
tokenKey env var 名称 [WECHATPRO_ALICE_TOKEN_KEY]: 
authcode env var 名称 [WECHATPRO_ALICE_AUTHCODE]: 
webhook host [127.0.0.1]: 
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

### 9.5 setup migrate

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
