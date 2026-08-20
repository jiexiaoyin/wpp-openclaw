# 快速开始 (GETTING_STARTED.md)

> **当前版本: v1.3.63** · 从零到可用 · 预计 20 分钟
> 本包只含编译产物, 不含 TypeScript 源码。

---

## 0. 这是什么 (30 秒看懂)

**WeChatPadPro OpenClaw 插件** = 微信 Pad 协议 HTTP API → OpenClaw AI 自动回复的桥。

| 能力 | 说明 |
|---|---|
| 收发消息 | 文本 / 图片 / 语音 / 视频 / 文件 |
| AI 回复 | 私聊或群聊 @ 机器人 → OpenClaw agent 生成回复 |
| 引用回复 | AI 引用用户消息回复 (type=57 引用卡片) |
| 图片识别 | AI 多模态看图 |
| 语音收发 | 发语音自动转 silk (vendor 只收 silk, 转码失败降级发文件); 收语音 STT 转文字 |
| 群接龙 | 群里发 `#接龙 xxx` → AI 自动应景回复 (无需 @) |
| 多账号 | 一个微信一个 agent, 相互隔离 |

---

## 1. 前置依赖

| 依赖 | 说明 |
|---|---|
| Node.js | ≥ 20.x |
| OpenClaw gateway | v2026.7.1+ |
| MariaDB | 存储消息数据库 |
| WeChatPadPro 服务端 | 微信 Pad 协议 HTTP API + WS — **本包 `vendor/` 已含** (v8_m4.1.12.29_p8.0.75.53), 部署见 [vendor/README.md](./vendor/README.md) |

**必填环境变量**(凭证不进 JSON/DB):

```bash
export WECHATPRO_TOKEN_KEY="<服务端 token>"
export WECHATPRO_AUTHCODE="<服务端授权码>"
export WECHATPRO_DB_PASSWORD="<数据库密码>"
```

**可选环境变量**(按需配置):

```bash
# 你的 WeChatPadPro 服务端域名 (安全白名单: 媒体下载只允许此域名 + OSS bucket)
#   不设则媒体下载全部拒绝 (安全默认, 必须设才能收发媒体)
export WPP_VENDOR_HOST="<你的服务端域名, e.g. wx.example.com>"

# 语音编解码器路径 (发布版无内置路径, 发语音/语音转文字必须设)
export WPP_SILK_ENCODER_PATH="/path/to/silk/encoder"
export WPP_SILK_DECODER_PATH="/path/to/silk/decoder"
```

> ⚠️ `WPP_VENDOR_HOST` 是媒体下载的安全白名单: 只允许向它 + OSS bucket 发起下载。
> 首次配置请务必设置, 否则图片/视频/文件/语音无法下载入库。

---

## 2. 安装 (6 步)

> **先部署服务端, 再装插件**: 插件依赖服务端提供 HTTP API + WS。

### 2.0 部署服务端 (vendor, 官方 Docker 镜像)

> 本发布包**不含服务端二进制**。服务端通过官方 Docker 镜像获取 + 官方 docker-deploy 一键部署。详细见 [vendor/README.md](./vendor/README.md)。

```bash
# 1. 拉取镜像 (v2026.08.18.1, build 20260818)
docker pull wechatpadpro/wechatpadprobusiness:v2026.08.18.1

# 2. 用官方 docker-deploy 发布包部署 (host 网络 + 独立 Redis)
#    解压 8075docker-deploy.zip → cd docker-deploy → ./install.sh
#    install.sh 引导填 user_token_key + 自动生成 Redis 密码

# 3. 验证 (端口是宿主机端口)
curl http://127.0.0.1:18062          # HTTP API
curl http://127.0.0.1:18062/swagger/  # 313 个 API 文档
```

> 插件需能访问服务端: 同机用 `http://127.0.0.1:18062`, 跨机用 nginx 反代 + `WPP_VENDOR_HOST`。

**前提**: 你的 OpenClaw gateway 已运行 (v2026.7.1+ 兼容的 channel 插件契约), 本插件随包的 `deploy.sh` 会自动注册到你的 OpenClaw。

```bash
# 0. 定位你的 OpenClaw 根目录 (默认 $HOME/.openclaw, 非默认可 env 覆盖)
export OPENCLAW_ROOT="${OPENCLAW_ROOT:-$HOME/.openclaw}"      # 例如 /home/you/.openclaw
export GATEWAY_SERVICE="${GATEWAY_SERVICE:-openclaw-gateway}" # systemd user 服务名 (docker 环境忽略)
export BACKUP_ROOT="${BACKUP_ROOT:-/data}"                    # 备份目录 (无 /data 权限可设 /tmp)

# 1. 解压发布包 (zip 不含依赖)
unzip wpp-plugin-release.zip
cd wpp-plugin-release

# 2. 安装依赖 (发布包不含 node_modules, 这一步会联网下载)
npm ci

# 3. 配账号 (交互式向导, 填你自己的服务端地址 + wxid)
cp accounts/default.json.example accounts/default.json
npm run setup add default

# 4. 设环境变量 (WECHATPRO_TOKEN_KEY / WECHATPRO_AUTHCODE / WECHATPRO_DB_PASSWORD / WPP_VENDOR_HOST / WPP_SILK_ENCODER_PATH)

# 5. 部署 (dry-run 验证 → 真实部署, 自动: 拷贝插件到 $OPENCLAW_ROOT/extensions/ + 注册 openclaw.json + 重启 gateway)
bash deploy.sh                # 验证 (18+ 项全 PASS 再继续)
bash deploy-swap.sh --force   # 真实部署
```

> **发布包含服务端**: zip 13M = 编译产物 (dist/) + 配套服务端 (vendor/) + 文档。**不含 node_modules** (依赖约 92MB), 接收方 `npm ci` 时自动下载, 这是标准发布做法, 不是缺文件。

### 2.1 用自己的 OpenClaw 部署 (三种环境)

| 你的 OpenClaw 部署方式 | 怎么做 |
|---|---|
| **systemd user 服务** (默认, 如 `openclaw-gateway`) | 直接 `bash deploy-swap.sh --force`, 自动重启 + verify |
| **docker 容器** | 设 `GATEWAY_SERVICE=` 留空让脚本跳过重启, 部署后 `docker restart <容器>`; 或手动用 2.2 手动方式 |
| **非 root 用户 / 自定义路径** | 设 `OPENCLAW_ROOT=/你的路径/.openclaw`, 其余照常 |

### 2.2 手动接入 (不想用脚本, 或 docker/自定义 OpenClaw)

```bash
# 1. 拷贝插件到你的 OpenClaw 插件目录
mkdir -p "$OPENCLAW_ROOT/extensions/wechatpadpro"
cp -a dist openclaw.plugin.json package.json config.json accounts "$OPENCLAW_ROOT/extensions/wechatpadpro/"
cp -a node_modules "$OPENCLAW_ROOT/extensions/wechatpadpro/"   # 需要 node_modules

# 2. 在 openclaw.json 注册插件
#    openclaw.json 里加:
#      "plugins": { "allow": ["wechatpadpro"], "entries": { "wechatpadpro": { "enabled": true } } }

# 3. 创建 agent + bindings 路由 (把 wechatpadpro 渠道消息路由到你的 agent)
#    openclaw agents add wpp-wechat    (或 npm run setup add 时自动建)

# 4. 重启你的 gateway
```

部署完成验证:

```bash
systemctl --user status "${GATEWAY_SERVICE:-openclaw-gateway}"          # active (running)
journalctl --user -u "${GATEWAY_SERVICE:-openclaw-gateway}" -n 50 | grep "wppChannelPlugin registered"  # 插件已注册
journalctl --user -u "${GATEWAY_SERVICE:-openclaw-gateway}" -n 50 | grep "account fully started"        # 账号已启动
```

---

## 3. 账号配置 (accounts/default.json 字段详解)

`npm run setup add default` 生成, 核心字段:

```json
{
  "enabled": true,
  "tokenKey": "",                   // 凭证走 env, 这里留空
  "tokenKeyEnv": "WECHATPRO_TOKEN_KEY",
  "authcode": "",
  "authcodeEnv": "WECHATPRO_AUTHCODE",
  "apiBaseUrl": "http://127.0.0.1:18062",   // 你的 WeChatPadPro 服务端地址
  "wsUrl": "ws://127.0.0.1:18089/ws/sync",
  "webhookHost": "127.0.0.1",       // 仅本机监听 (安全)
  "webhookPort": 4398,
  "webhookPath": "/wechatpadpro/default/webhook",
  "webhookPublicUrl": "",           // 配 nginx 反代后填公网地址
  "allowFrom": [],                  // 私聊白名单: 空=拒绝所有 DM (fail-closed)
  "groupPolicy": "allowlist",       // open | disabled | allowlist | closed
  "groupAllowFrom": [],
  "selfWxid": "YOUR_WXID",          // 你的微信 wxid/微信号 (@ 检测)
  "nickname": "YourBot",            // 机器人昵称
  "requireAtMention": true,
  "debounceMs": 1500,
  "agent": "wpp-wechat"             // OpenClaw agent 绑定 (必填, 禁止 "main")
}
```

> **安全**:
> - 凭证一律走 env var, JSON 永远留空
> - `allowFrom` 留空 = 拒绝所有私聊 (fail-closed)
> - `agent` 必填且禁止 `"main"` (防多账号串号)

---

## 4. 首次使用 (发消息测试)

部署完成后, 用你的微信发给机器人验证:

| 测试 | 发什么 | 期望 |
|---|---|---|
| 私聊 | `你好` (allowFrom 内) | AI 文本回复 |
| 群聊 | `@机器人 你好` | AI 回复 + 引用块 |
| 群聊发图+@ | 群里先发一张图, 再 `@机器人` | AI 能看到刚才的图 (群聊上下文) |
| 图片 | 发一张图 | AI 识别图内容 |
| 文件 | 发 PDF/zip | 固定回复"收到文件…无法读取内容" |
| 语音 | 发语音 | AI 看到转写文字 |
| 群接龙 | 群里发 `#接龙 xxx` | AI **自动**应景回复 (v1.3.54, 无需 @, 5 分钟节流) |

**引用回复**: 引用 bot 之前发的消息 → AI 用引用卡片回复 (type=57)。

**AI 发语音**: agent 用 voice 类型发 → 插件自动转 silk (v1.3.52); 转码失败自动降级发文件 (v1.3.53), 用户都能收到。

---

## 5. 验证命令

```bash
npm run setup validate default    # 账号配置检查
journalctl --user -u openclaw-gateway -f   # 实时看 AI 回复链路
ss -tlnp | grep 4398              # webhook 监听确认
```

---

## 6. 故障排查 (快速定位)

| 现象 | 原因 | 解决 |
|---|---|---|
| gateway 起不来 status=78 | openclaw.json 配置错 | `openclaw doctor --fix` 或还原备份 |
| 插件加载但消息不进 | webhook 没注册 | journal 看 `setWebhook OK` |
| AI 不回复 | agent 绑定错 / 模型 key 问题 | 检查 `agent` 字段 + OpenClaw 模型配置 |
| 私聊全被拒 | `allowFrom` 空 | 加你的 wxid 到 allowFrom |
| 文件读不到内容 | 服务端无文件下载 API | 已知限制, AI 固定回复"无法读取" |
| 接龙没触发 | 接龙标题不含 `#接龙` | 日志看 `relay detected`; 非标准模板需定制识别规则 |
| AI 发语音失败 | mp3 转 silk 失败 | 已自动降级发文件; 连续失败查 WPP_SILK_ENCODER_PATH 是否配对 |

---

## 7. 常见问题

**Q: 不分享源码怎么改配置?**
A: 配置全在 `accounts/<id>.json` + 环境变量, 不需要源码。功能逻辑已编译在 `dist/`。

**Q: 需要改插件行为怎么办?**
A: 源码未公开。如需定制, 联系作者或基于 MIT 协议自行 fork 开发。

**Q: 服务端 (WeChatPadPro) 从哪来?**
A: 这是第三方微信 Pad 协议服务, 需自行搭建或购买。本插件只做协议适配。

---

## 8. 许可证

[MIT](./LICENSE) — 自由使用/修改/商用, 保留版权声明即可。
