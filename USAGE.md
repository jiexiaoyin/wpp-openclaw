# 使用指南 (USAGE.md)

> **当前版本: v1.3.63** · 安装见 [GETTING_STARTED.md](./GETTING_STARTED.md) · 部署见 [DEPLOY.md](./DEPLOY.md)

WeChatPadPro OpenClaw Plugin 在 OpenClaw 框架下的使用指南: 加载、Agent Tools、消息收发、配置、多账号、验证与监控。

---

## 1. 加载到 OpenClaw

### 1.1 部署位置

```
$OPENCLAW_ROOT/extensions/wechatpadpro/
├── dist/                    # 编译产物
├── openclaw.plugin.json     # manifest
├── package.json             # 含 "openclaw.extensions" 字段
├── node_modules/            # 依赖 (mysql2/typebox/undici/ws 等)
├── config.json              # 全局配置 (DB)
└── accounts/default.json    # 默认账号配置
```

### 1.2 加载流程

1. Gateway 启动时扫 `extensions/<id>/package.json` 的 `openclaw.extensions` 字段
2. 加载 `dist/index.js` (default export = `plugin`)
3. 调 `plugin.register(api)`
4. `register` 调 `api.registerChannel({ plugin: wppChannelPlugin })`
5. OpenClaw 调 `wppChannelPlugin.config.{listAccountIds, resolveAccount, ...}` 查账号
6. OpenClaw 调 `wppChannelPlugin.gateway.startAccount(ctx)` 启动账号

---

## 2. Agent Tools (AI 可调用)

插件暴露 **179+ agent tools**, AI 在对话中可调用。核心工具 (Message Domain):

| 工具 | 作用 |
|---|---|
| `send_text(accountId, toWxid, text, ats?)` | 发文本 |
| `send_image(accountId, toWxid, imageUrl)` | 发图片 |
| `send_voice(accountId, toWxid, voiceUrl, durationMs?)` | 发语音 (自动转 silk) |
| `send_video(accountId, toWxid, videoUrl, thumbUrl?)` | 发视频 |
| `quote_reply(accountId, toWxid, content, msgId)` | 引用回复 (type=57 卡片) |
| `revoke_msg(accountId, toWxid, msgId, newMsgId)` | 撤回消息 |

其余 150+ tools 覆盖 Friend / Group / Login / User / Tools / Wxapp / TenPay 等全部服务端 tag (联系人 / 群管理 / 朋友圈 / 支付 / 公众号等)。

> AI 通过工具自动发消息。也可以直接让 AI"给 XX 发消息", 它自己会调对应工具。

---

## 3. 消息收发

### 3.1 接收 (服务端 → AI)

```
服务端推送 → webhook 127.0.0.1:4398/wechatpadpro/<account>/webhook (+ /business)
       → 验签 + 媒体 enrich (图片/语音/视频/文件下载)
       → 触发判定 (@ 私聊 / 关键词 / 引用 bot / 群接龙)
       → 路由到对应 agent → AI 处理
```

### 3.2 发送 (AI → 用户)

AI 决定回复 → 调 `send_*` 工具 → 服务端转发 → 用户微信收到。

**引用回复**: 用户引用 bot 消息 → AI 用引用卡片回复 (type=57)。
**AI 发语音**: agent 用 voice 类型发 → 插件自动转 silk (服务端只收 silk); 转码失败自动降级发文件。

---

## 4. 配置详解

### 4.1 config.json (全局)

```json
{
  "storage": {
    "saveHistory": true,
    "db": {
      "backend": "mariadb",
      "mariadb": {
        "host": "127.0.0.1",
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

### 4.2 accounts/<id>.json (账号)

`npm run setup add default` 生成, 核心字段:

```json
{
  "enabled": true,
  "tokenKeyEnv": "WECHATPRO_TOKEN_KEY",
  "authcodeEnv": "WECHATPRO_AUTHCODE",
  "apiBaseUrl": "http://127.0.0.1:18062",
  "wsUrl": "ws://127.0.0.1:18089/ws/sync",
  "webhookHost": "127.0.0.1",
  "webhookPort": 4398,
  "webhookPath": "/wechatpadpro/default/webhook",
  "allowFrom": [],                   // 私聊白名单: 空 = 拒绝所有 DM (fail-closed)
  "groupPolicy": "allowlist",        // open | disabled | allowlist | closed
  "groupAllowFrom": [],
  "selfWxid": "YOUR_WXID",           // ⚠️ bot 自己的 wxid (不是使用者)
  "nickname": "YourBot",
  "agent": "wpp-wechat",             // ⚠️ 必填且禁止 "main"
  "requireAtMention": true,
  "debounceMs": 1500
}
```

> **⚠️ selfWxid 语义**: `selfWxid` 必须是 **bot 自己** 的 wxid (插件用它判断"这条消息是不是 bot 自己发的"), 不是使用者主号。填错会导致 AI 自我回复循环。

### 4.3 环境变量

| 变量 | 用途 | 必设? |
|---|---|---|
| `WECHATPRO_TOKEN_KEY` | 服务端 API Token | ✅ |
| `WECHATPRO_AUTHCODE` | 服务端授权码 | ✅ |
| `WECHATPRO_DB_PASSWORD` | MariaDB 密码 | ✅ |
| `WPP_VENDOR_HOST` | 服务端域名 (媒体下载白名单) | ✅ 否则媒体下载失败 |
| `WPP_SILK_ENCODER_PATH` | silk 编码器 (发语音) | 用语音功能时 |
| `WPP_SILK_DECODER_PATH` | silk 解码器 (语音转文字) | 用语音功能时 |
| `WPP_DEBUG=1` | 打开 DEBUG 日志 | 排查用 |

---

## 5. 多账号 (一 authcode = 一 agent = 一账号)

每个微信号 (一个 authcode) 对应一个独立 OpenClaw agent, AI 记忆/人设完全隔离。

```bash
npm run setup add wechatA        # 建 accounts/wechatA.json + agent wpp-wechatA + 自动登记 openclaw.json
npm run setup list               # 看所有账号
npm run setup modify wechatA     # 改白名单/端口/agent
npm run setup remove wechatB --clean   # 删账号 + agent + binding (防残留)
```

**关键点**:
- 所有账号共享 webhook 端口 4398 (按 path 区分: `/wechatpadpro/<account>/webhook`)
- 每账号独立 env: `WECHATPRO_<ID>_TOKEN_KEY` / `WECHATPRO_<ID>_AUTHCODE`
- 自动登记 openclaw.json: `channels.wechatpadpro.accounts.<id>` + binding `{channel:"wechatpadpro", accountId:"<id>"}`

---

## 6. 文件助手命令

> 在**文件传输助手**里向机器人发送命令 (不打扰其它会话)。用 `/help` 查看全部命令。

| 命令 | 说明 | 示例 |
|---|---|---|
| `/help` | 显示全部可用命令 | `/help` |
| `/genpair` | **生成新配对码** — 给白名单外用户, 对方私聊机器人发 `/pair <码>` 自助加入 | `/genpair` |
| `/pairs` | **查看当前配对码** + 有效期 (过期可重新生成) | `/pairs` |
| `/adduser <wxid>` | **授权私聊白名单** — 添加允许私聊的用户 | `/adduser wxid_abc123` |
| `/deluser <wxid>` | **移除私聊白名单** — 撤销私聊权限 | `/deluser wxid_abc123` |
| `/addgroup <群ID>` | **授权群聊白名单** — 允许机器人响应某群 | `/addgroup 19908568237@chatroom` |
| `/delgroup <群ID>` | **移除群聊白名单** — 停止响应某群 | `/delgroup 19908568237@chatroom` |
| `/xiaowei on\|off\|status` | **小微智能体开关** — 开启/关闭/查看小微 AI 智能体能力 (默认关闭) | `/xiaowei on` |

> 💡 **说明**:
> - 命令只在**文件传输助手**生效, 普通聊天不会误触发
> - 白名单命令 (`/adduser` 等) 是**管理操作**, 只建议管理员使用
> - `/xiaowei` 控制**小微智能体**能力 (预开发), 默认关闭, 开启后用 AI 对话

---

## 7. 验证与监控

### 7.1 首次使用 (发消息测试)

| 测试 | 发什么 | 期望 |
|---|---|---|
| 私聊 | `你好` (allowFrom 内) | AI 文本回复 |
| 群聊 | `@机器人 你好` | AI 回复 + 引用块 |
| 图片 | 发一张图 | AI 识别图内容 |
| 文件 | 发 PDF/zip | 固定回复"收到文件…无法读取内容" |
| 语音 | 发语音 | AI 看到转写文字 |
| 群接龙 | 群里发 `#接龙 xxx` | AI 自动应景回复 |

### 7.2 验证命令

```bash
npm run setup validate default    # 账号配置检查 (11 项)
journalctl --user -u openclaw-gateway -f   # 实时看 AI 回复链路
ss -tlnp | grep 4398              # webhook 监听确认
```

### 7.3 日志与监控

- 日志格式: `ISO时间 LEVEL [WPP v1.3.63] msg key=value`
- DEBUG: `WPP_DEBUG=1`
- Prometheus metrics: 14+ counters (received / processed / rejected_* / timeout 等)

---

## 8. 常见场景

**场景 1: 门店客服机器人**
- 服务端 + 插件部署 → `allowFrom` 只加店员 wxid → 客户加门店微信, 店员不在时 AI 自动回
- 语音/图片都能收 (自动识别), 群接龙自动跟单

**场景 2: 群聊智能应答**
- `groupPolicy: allowlist` + `groupAllowFrom` 指定群 → 群里 `@机器人` 即回复
- 群聊上下文: 自动注入最近 N 条相关消息 (可配 `groupContextWindow`)

**场景 3: 多微信多 agent**
- 每个微信号独立 agent → 不同人设/记忆/白名单, 互不干扰
- `setup add` 一键建, `setup remove --clean` 一键清

---

## 9. 许可证

[MIT](./LICENSE) — 自由使用/修改/商用, 保留版权声明即可。
