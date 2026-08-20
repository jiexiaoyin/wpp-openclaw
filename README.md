# WeChatPadPro OpenClaw Plugin

**基于 WeChatPadPro (微信 Pad 协议 HTTP API) 的 OpenClaw 适配插件 — 让微信账号接入 OpenClaw AI 自动回复**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

WeChatPadPro 微信 Pad 协议 → OpenClaw gateway → AI 自动回复。支持收发文本/图片/语音/视频/文件、引用回复、图片 AI 识别、语音收发 (silk 自动转码)、群接龙自动触发 AI、多账号。

> **只分享编译后代码** — 本包不含 TypeScript 源码, 提供完整可用的配置向导。

---

## 功能亮点

| 能力 | 说明 |
|---|---|
| 📨 消息收发 | 文本 / 图片 / 语音 / 视频 / 文件 |
| 🤖 AI 回复 | 私聊或群聊 @ 机器人 → OpenClaw agent 生成回复 |
| 💬 引用回复 | AI 引用用户消息回复 (type=57 引用卡片) |
| 🖼 图片识别 | AI 多模态看图 (多 schema 兼容) |
| 🎙 语音收发 | 发语音: 自动转 silk (vendor 只收 silk); 转码失败自动降级发文件; 收语音: STT 转文字 |
| 📋 群接龙 | 群里发 `#接龙 xxx` → AI **自动**应景回复 (无需 @, 5 分钟节流防刷屏) |
| 👥 多账号 | AccountRegistry 多账号隔离, 一个微信一个 agent |
| 🔐 安全门禁 | 私聊白名单 (fail-closed) + 群策略 + 凭证 env 隔离 |

## 快速开始

```bash
# 0. 解压发布包 (不含依赖)
unzip wpp-plugin-release.zip && cd wpp-plugin-release

# 1. 安装依赖 (发布包不含 node_modules, 这一步联网下载依赖)
npm ci

# 2. 配账号 (交互式向导, 填你自己的 vendor 地址 + wxid)
cp accounts/default.json.example accounts/default.json
npm run setup add default

# 3. 设环境变量 — WPP_VENDOR_HOST 必设, 否则图片/语音/文件无法下载!
export WPP_VENDOR_HOST="https://your-vendor-domain"   # 你的服务端域名
export WECHATPRO_TOKEN_KEY="..."                      # 服务端 API Token
export WECHATPRO_AUTHCODE="..."                       # 服务端授权码
export WECHATPRO_DB_PASSWORD="..."                    # MariaDB 密码

# 4. 部署
bash deploy.sh               # 验证 (18+ 项全 PASS)
bash deploy-swap.sh --force  # 真实部署
```

> **zip 小 = 正常**: 发布包只含编译产物, 不含 node_modules。`npm ci` 会根据 package.json 自动下载全部依赖。
> **`WPP_VENDOR_HOST` 别漏**: 媒体下载走白名单, 不设则图片/语音/文件全部无法下载。

> **配套服务端**: 本包**不含服务端二进制**。服务端通过官方 Docker 镜像获取: `docker pull wechatpadpro/wechatpadprobusiness:v2026.08.18.1`, 用官方 docker-deploy 包部署 (host 网络 + 独立 Redis)。详见 [`vendor/README.md`](./vendor/README.md)。插件仅适配此版本 (20260818)。

详细步骤见 [GETTING_STARTED.md](./GETTING_STARTED.md)。

## 前置要求

- Node.js ≥ 20
- OpenClaw gateway (v2026.7.1+)
- WeChatPadPro 微信 Pad 服务端 (HTTP API + WebSocket)
- MariaDB (存储消息)
- 环境变量: `WECHATPRO_TOKEN_KEY` / `WECHATPRO_AUTHCODE` / `WECHATPRO_DB_PASSWORD`

## 架构

```
微信客户端 ←→ WeChatPadPro 服务端 ←→ 本插件 (OpenClaw channel)
                                          ↓
                                     OpenClaw gateway
                                          ↓
                                       AI Agent
```

- 插件实现 OpenClaw `register(api)` + channel 接口 (start/stop/sendText/sendImage/sendMessage/buildSessionKey + outbound)
- `AccountRegistry` 管理多账号, 每个账号独立 agent
- 消息进站: webhook + WS 双通道 → trigger (@/keyword/msgType/quoteBot/**接龙**) → AI 处理
- 媒体: 图片/语音/视频自动下载 → OSS → AI 多模态识别

## 功能清单

- **200+ agent tools** — AI 可调用发消息/查联系人/管群/朋友圈等
- **313 vendor endpoints** — 覆盖 WeChatPadPro 服务端全部 API (含新增: 群发/发文件/公众号文章/视频号/红包/小程序 OAuth 等)
- **6 channel config helpers** — OpenClaw UI/诊断集成
- **Prometheus metrics** — 消息/错误/性能监控
- **语音 silk 自动转码** (v1.3.52): vendor `/Msg/SendVoice` 只收 silk → mp3 自动转码, 失败降级发文件 (v1.3.53)
- **群接龙自动触发** (v1.3.54): 识别 `#接龙` 消息 → 自动触发 AI 智能应景回复

## 配置

### 账号配置 (`accounts/<id>.json`)

```json
{
  "enabled": true,
  "tokenKeyEnv": "WECHATPRO_TOKEN_KEY",
  "authcodeEnv": "WECHATPRO_AUTHCODE",
  "apiBaseUrl": "http://127.0.0.1:18062",
  "wsUrl": "ws://127.0.0.1:18089/ws/sync",
  "webhookHost": "127.0.0.1",
  "webhookPort": 4398,
  "allowFrom": [],
  "groupPolicy": "allowlist",
  "selfWxid": "YOUR_WXID",
  "nickname": "YourBot",
  "agent": "wpp-wechat"
}
```

- 凭证 (tokenKey/authcode) 一律走环境变量, 不写进 JSON
- `allowFrom` 空 = 拒绝所有私聊 (fail-closed, 安全默认)
- `groupPolicy`: open / disabled / allowlist / closed

### 环境变量

| 变量 | 用途 |
|---|---|
| `WECHATPRO_TOKEN_KEY` | 服务端 API Token |
| `WECHATPRO_AUTHCODE` | 服务端授权码 |
| `WECHATPRO_DB_PASSWORD` | MariaDB 密码 |
| `WPP_VENDOR_HOST` | 你的服务端域名 (媒体下载安全白名单, **必须设否则媒体无法下载**) |
| `WPP_SILK_ENCODER_PATH` | silk 编码器路径 (语音发送转码用, 发布版无默认路径) |
| `WPP_SILK_DECODER_PATH` | silk 解码器路径 (语音转文字用) |

## 安全设计

- 凭证单一来源 env var (不进 JSON / DB)
- 私聊白名单 fail-closed (默认拒绝所有, 防误触发)
- Webhook HMAC 验签 (可选)
- 10MB body cap + 30s 超时 (防 DoS)
- 群策略门禁 (open/disabled/allowlist/closed)
- ReDoS 防护 (所有用户输入 regex 安全处理)

## 目录结构

```
wechatpadpro-openclaw/
├── dist/                      # 编译产物 (不含源码)
├── scripts/setup.js           # 配置向导
├── accounts/
│   └── default.json.example   # 账号配置模板
├── config.json                # 全局配置 (DB)
├── GETTING_STARTED.md         # 快速开始
├── LICENSE                    # MIT
└── openclaw.plugin.json       # OpenClaw manifest
```

## 文档

- [GETTING_STARTED.md](./GETTING_STARTED.md) — 从零安装 + 配置 (快速开始)
- [DEPLOY.md](./DEPLOY.md) — 部署 + 回滚 + 故障排查
- [USAGE.md](./USAGE.md) — 使用说明 (工具 / 配置 / 多账号 / 监控)
- [vendor/README.md](./vendor/README.md) — 配套服务端部署

## 许可证

[MIT](./LICENSE) — 自由使用/修改/商用, 保留版权声明即可。

## 免责声明

- 本插件仅用于合法用途, 使用者需遵守当地法律法规及微信平台条款
- 微信账号可能因违反平台规则被封禁, 使用风险自负
- WeChatPadPro 服务端为第三方协议实现, 与本插件作者无关
