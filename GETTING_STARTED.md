# 快速开始 (GETTING_STARTED.md)

> **当前版本: v1.3.54** · 从零到可用 · 预计 20 分钟
> 详细部署见 [DEPLOY.md](./DEPLOY.md),开发见 [DEV.md](./DEV.md),功能清单见 [FEATURES.md](./FEATURES.md)。

---

## 0. 这是什么(30 秒看懂)

**WeChatPadPro OpenClaw 插件** = 微信 Pad 协议 HTTP API → OpenClaw AI 自动回复的桥。

| 能力 | 说明 |
|---|---|
| 收发消息 | 文本 / 图片 / 语音 / 视频 / 文件 |
| AI 回复 | 私聊 @ 或群聊 @ 机器人 → OpenClaw agent 生成回复 |
| 引用回复 | AI 引用用户消息回复(type=57 引用卡片,v1.1.55 修复) |
| 图片识别 | AI 多模态看图(v1 schema 走 64KB 截断,v1.1.56) |
| 语音收发 | 发语音: **vendor 只收 silk**,mp3 自动转码(v1.3.52),转码失败降级发文件(v1.3.53);收语音: silk 转码 + SiliconFlow STT |
| 接龙自动回复 | 群接龙消息自动触发 AI(v1.3.54),AI 根据接龙主题智能应景回复 |
| 文件兜底 | 文件消息确定性回复(绕过 AI,防误读,v1.2.0) |
| 多账号 | AccountRegistry 多账号隔离(可扩展) |

---

## 1. 前置依赖

| 依赖 | 版本/说明 |
|---|---|
| Node.js | ≥ 20.x |
| OpenClaw gateway | v2026.7.1+(已运行) |
| 1Panel MariaDB | 数据库 `wechatpro` |
| WeChatPadPro vendor 容器 | `wechatpadpromax08`,反代 `https://wx.juhe.chat/api/` |
| OSS 凭证(可选) | `~/.openclaw/credentials/oss-credentials.json`(图片/语音/视频上传用) |

**必填环境变量**(凭证单一来源铁律,不进 JSON/DB):

```bash
export WECHATPRO_TOKEN_KEY="<vendor token>"
export WECHATPRO_AUTHCODE="<vendor authcode>"
export WECHATPRO_DB_PASSWORD="<mariadb password>"
```

---

## 2. 安装(5 步)

```bash
# 1. 到 dev 目录
cd /root/dev/wechatpadpro-openclaw

# 2. 装依赖
npm ci

# 3. 配 env(从模板复制 + 填 3 个凭证)
cp .env.example .env
# 编辑 .env: WECHATPRO_TOKEN_KEY / WECHATPRO_AUTHCODE / WECHATPRO_DB_PASSWORD

# 4. 交互式引导配置账号(推荐,自动生成 accounts/default.json)
npm run setup add default

# 5. 部署
bash deploy.sh                # dry-run 验证(19 项全 PASS 再继续)
bash deploy-swap.sh --force   # 真实原子部署(自动备份/重启 gateway)
```

部署完成验证:

```bash
systemctl --user status openclaw-gateway          # active (running)
journalctl --user -u openclaw-gateway -n 50 | grep "WPP v1.3.54"  # 插件已加载
journalctl --user -u openclaw-gateway -n 50 | grep "account fully started"  # 账号已启动
```

---

## 3. 账号配置(accounts/default.json 字段详解)

`npm run setup add default` 生成,核心字段:

```json
{
  "enabled": true,
  "tokenKey": "",                // 凭证走 env, 这里留空
  "tokenKeyEnv": "WECHATPRO_TOKEN_KEY",
  "authcode": "",
  "authcodeEnv": "WECHATPRO_AUTHCODE",
  "apiBaseUrl": "https://wx.juhe.chat",      // vendor HTTP API 反代
  "wsUrl": "wss://wx.juhe.chat/ws/sync",     // vendor WS 推送
  "webhookHost": "127.0.0.1",                // 仅本机监听 (安全加固, 不用 0.0.0.0)
  "webhookPort": 4398,
  "webhookPath": "/wechatpadpro/default/webhook",
  "webhookPublicUrl": "https://wx.juhe.chat", // 公网入口, vendor push 用
  "allowFrom": ["wxid_xxx"],      // 私聊白名单: 空=拒绝所有 DM (fail-closed)
  "groupPolicy": "allowlist",     // open | disabled | allowlist | closed
  "groupAllowFrom": ["xxx@chatroom"],
  "selfWxid": "q139198824",       // bot 自己 wxid/微信号 (@ 检测)
  "nickname": "接晓银",            // bot 昵称 (群 @ 中文匹配)
  "requireAtMention": true,       // 群聊需 @ 才触发 (注: 当前未在 shouldTrigger 内实现)
  "debounceMs": 1500,
  "agent": "wpp-wechat"           // OpenClaw agent 绑定 (必填, 禁止 "main")
}
```

### 3.1 进阶字段字典 (v1.3.x, 可选但推荐配)

| 字段 | 类型/默认 | 说明 |
|---|---|---|
| `dmPairingEnabled` | bool 默认 `false` | 开启 DM 配对码: 白名单外用户私聊 `/pair <8位码>` 自助加入 allowFrom (零重启) |
| `adminUsers` | `string[]` | 管理员 wxid 列表 (默认 `[selfWxid]`), 限频/脱敏/优先回复豁免预留 |
| `commandAllowlist` | `{allowlist, prefix?, blockMessage?}` | 命令白名单: 设了才拦截 `/xxx` 命令 (不在白名单静默拒绝, 不进 AI) |
| `keywordTrigger` | `{enabled, keywords[], mode?}` | 关键词触发器: 设了关键词后才触发 AI 处理 |
| `msgTypeTrigger` | `{enabled, appMsgTypes?[]}` | 消息类型触发: 只处理指定类型 (如接龙 49) — **接龙已默认自动触发 (v1.3.54), 此字段是可选精确控制** |
| `quoteBotTrigger` | `{enabled}` | 引用 bot 消息触发 |
| `blacklistGroups` | `string[]` | 黑名单群: 拒绝处理任何消息 |
| `groupContextEnabled` | bool 默认 `false` | 缓冲非触发群消息进上下文, 触发时注入 AI |
| `groupContextWindow` | int 默认 `20` | 群上下文保留条数 (环形缓冲) |
| `groupContextMaxImages` | int 默认 `5` | 群上下文最多理解几张图 (0=不理解媒体) |
| `llmIntentEnabled` | bool 默认 `true` | 群聊上下文用 LLM 判断注入哪些候选 (false→回退规则过滤) |
| `llmIntentTimeoutMs` | int 默认 `5000` | LLM 判断超时毫秒 |
| `llmIntentModel` | string 默认 `MiniMax-M2.5` | LLM 判断模型 (快+便宜) |
| `embedIntentEnabled` | bool 默认 `true` | 用 embedding 快路径定位相关候选 (ms 级) |
| `embedIntentTopN` | int 默认 `5` | embedding 选 top-N 候选 |
| `embedIntentThreshold` | float 默认 `0.3` | embedding 相似度阈值 (低于则 LLM 兜底) |
| `chatroomDebug` | bool 默认 `false` | 群调试模式: 详细日志 (生产禁用) |

> **安全铁律**:
> - 凭证(tokenKey/authcode/password)一律走 env var,JSON 永远留空
> - `allowFrom` 留空 = 拒绝所有私聊(防 P0 联系人 fan-out)
> - `agent` 必填且禁止 `"main"`(防多账号串号)
> - `groupPolicy=allowlist` 时配 `groupAllowFrom`, 否则群消息被拒

---

## 4. 首次引导(发消息测试)

部署完成后,用老板微信发给机器人验证:

| 测试 | 发什么 | 期望 |
|---|---|---|
| 私聊 | `你好`(allowFrom 内) | AI 文本回复 |
| 群聊 | `@机器人 你好` | AI 回复 + 引用块 |
| 图片 | 发一张图 | AI 识别图内容(v1 schema 64KB) |
| 文件 | 发 PDF/zip | 固定回复"收到文件…无法读取内容"(v1.2.0) |
| 语音 | 发语音 | AI 看到转写文字 |
| 接龙 | 群里发 `#接龙 xxx` | AI **自动**回复(v1.3.54, 无需 @, 5 分钟内同接龙只回一次) |

**引用回复**(老板常用): 引用 bot 之前发的消息 → AI 用引用卡片回复(type=57,title=AI 回复文字)。

**AI 发语音**(老板常用): agent 用 voice 类型发 → 插件自动转 silk(v1.3.52);转码失败自动降级发文件(v1.3.53),用户都能收到。

---

## 5. 验证命令

```bash
npm test                          # 800+/800+ 全绿
npm run setup validate default    # 账号配置静态检查 (11 项)
npm run setup diagnose default    # 运行时诊断 (env/vendor连通/webhook/agent) ← 推荐
journalctl --user -u openclaw-gateway -f   # 实时看 AI 回复链路
ss -tlnp | grep 4398              # webhook 监听确认
```

`npm run setup diagnose` 输出示例 (14 pass / 1 warn / 0 fail):
```
✓ env WECHATPRO_TOKEN_KEY — 32 chars
✓ env WECHATPRO_AUTHCODE — 36 chars
✓ vendor API 连通 (HeartBeat) — OK
✓ webhook 127.0.0.1:4398 监听中
✓ agent 'wpp-wechat' 在 openclaw.json — OK
```

---

## 6. 故障排查(快速定位)

| 现象 | 原因 | 解决 |
|---|---|---|
| gateway 起不来 status=78 | openclaw.json 配置错 | `openclaw doctor --fix` 或还原备份 |
| 插件加载但消息不进 | webhook/business 没注册 | journal 看 `setBusinessWebhook OK` |
| AI 不回复 | agent 绑定错 / 模型 key 问题 | 检查 `agent` 字段 + openclaw 模型配置 |
| 私聊全被拒 | `allowFrom` 空 | 加发送者 wxid 到 allowFrom |
| 图片 AI 看不清 | v1 schema 64KB 截断 | 大图让 AI 部分识别,或联系 vendor 解封 |
| 文件读不到内容 | v1 schema 无下载 API | 默认固定回复"无法读取"; 开 MCP (mcpEnabled=true + vendor realtime) 后可读 |
| 接龙没触发 | 接龙标题不含 `#接龙`(非标准模板) | 日志看 `relay detected`; 若标题不带 #接龙, 联系加识别规则 |
| AI 发语音失败 | mp3 转 silk 失败 | 日志看 `[WPP v1.3.53 VOICE-DEGRADE]` — 已自动降级发文件; 连续失败查 silk 二进制 / ffmpeg |
| 接龙 AI 重复回 | 同一接龙反复推送 | 内置 5 分钟节流, 日志看 `relay throttled` |

---

## 7. 相关文档

- [DEPLOY.md](./DEPLOY.md) — 部署/回滚/7 步详解
- [USAGE.md](./USAGE.md) — OpenClaw 框架使用
- [FEATURES.md](./FEATURES.md) — 159 agent tools + 231 vendor endpoints
- [DEV.md](./DEV.md) — 二次开发/架构/测试
- [CHANGELOG.md](./CHANGELOG.md) — 49 个版本历史
- [MIGRATION.md](./MIGRATION.md) — v0.1.0 → v1.2.0 升级记录(历史)

## 8. 发布/分享 (不泄露源码)

**只分享编译后代码, 不含 TypeScript 源码**:

```bash
bash build-release.sh    # 生成 release/ 发布包
```

发布包特点:
- `release/dist/` = 编译产物 (无 .map sourcemap, 无源码注释, 无个性化值)
- `release/scripts/setup.js` = 配置向导 (接收方 `npm run setup` 配自己的 vendor)
- `release/accounts/default.json.example` = 配置模板 (填自己 wxid/nickname/vendor 地址)
- 含 MIT LICENSE + GETTING_STARTED.md + README.md

接收方步骤:
```bash
# 1. 拷贝发布包 + 装依赖
cp -a /data/wpp-plugin-release-20260809/ /path/to/your/
cd /path/to/your/ && npm ci
# 2. 配账号 (交互式向导, 填自己的 vendor + wxid)
cp accounts/default.json.example accounts/default.json
npm run setup add default
# 3. 部署
bash deploy.sh && bash deploy-swap.sh --force
```
