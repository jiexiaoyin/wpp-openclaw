# 部署指南 (DEPLOY.md)

WeChatPadPro OpenClaw Plugin v1.3.63 部署到 OpenClaw gateway 的详细指南。

> 本插件部署分**两层**, 都要跑通:
> 1. **服务端 (vendor)** — 微信 Pad 协议服务 (本包 `vendor/` 已含), 提供 HTTP API + WS
> 2. **插件** — 部署到你的 OpenClaw gateway, 对接服务端 → AI

---

## 1. 前置检查

### 1.1 系统依赖

| 依赖 | 要求 |
|---|---|
| Node.js | ≥ 20.x |
| OpenClaw gateway | v2026.7.1+ (已运行) |
| MariaDB | 存储消息数据库 |
| Redis | 服务端 (vendor) 依赖, 默认 `127.0.0.1:6379` db=8 |

### 1.2 必填环境变量 (凭证单一来源 env var, 不进 JSON/DB)

| 变量 | 用途 |
|---|---|
| `WECHATPRO_DB_PASSWORD` | MariaDB 连接密码 |
| `WECHATPRO_TOKEN_KEY` | 服务端 API TokenKey (个人中心生成) |
| `WECHATPRO_AUTHCODE` | 服务端 WebSocket 授权码 (微信扫码登录后拿到) |

> `accounts/<id>.json` 引用 `tokenKeyEnv` / `authcodeEnv` 字段, 运行时从 env 读取。

### 1.3 设计原则 (部署时勿破)

| 原则 | 验证方式 |
|---|---|
| 凭证单一来源 env | `config.json` 用 `passwordEnv` 引用, JSON 永远留空 |
| 备份放 `BACKUP_ROOT` | `deploy-swap.sh` 步骤 1 自动备份到 `${BACKUP_ROOT}/wpp-deploy-swap-${TS}/` |
| 不动 openclaw.json 核心 | `deploy-swap.sh` 只注入 `plugins.allow` + `plugins.entries` 2 字段 |
| deploy.sh 默认 dry-run | 强约束, `--force` 才跳过 |

---

## 2. 第一步: 部署服务端 (vendor)

> 服务端在微信协议侧, 需要能连微信 (MMTLS)。**先部署服务端, 再装插件**。

完整步骤见 [vendor/README.md](./vendor/README.md), 要点:

```bash
# 1. 解压
mkdir -p vendor && tar xzf vendor/20260809_030557_linux64_v8_m4.1.12.29_p8.0.75.53.tar.gz -C vendor

# 2. 配置 conf/app.conf
#    user_token_key = "<你的 TokenKey>"   # 个人中心生成
#    redislink = "127.0.0.1:6379"          # 你的 Redis

# 3. 运行
cd vendor && ./wechatpadpromax08

# 4. 验证
curl http://127.0.0.1:8062          # HTTP API 就绪
#    swagger: http://127.0.0.1:8062/swagger/
```

**公网接入**: 插件需要访问服务端, 建议 nginx 反代 8062/8089 到域名 (如 `https://wx.example.com`), 插件 `WPP_VENDOR_HOST=https://wx.example.com` (媒体下载白名单, 必设)。

---

## 3. 第二步: 部署插件

### 3.1 Dry-run 验证 (强烈建议先跑)

```bash
# 在解压后的发布包目录
bash deploy.sh                # 默认 verbose 不开
bash deploy.sh --verbose      # 看每个 step 细节
bash deploy.sh --skip-build   # 跳过 tsc, 复用当前 dist
```

**检查清单** (deploy.sh 跑通):
- [ ] `npm run build` 成功 (dist 126 .js)
- [ ] `manifest JSON parse` 通过 (`openclaw.plugin.json` 合法)
- [ ] `manifest.id/version/kind` 字段全在
- [ ] `syntax check` 全部 .js 通过 `node --check`
- [ ] `ESM load` 成功 (Node ESM 直接 import 不抛)
- [ ] `ESM.id match`: dist runtime id = manifest id (`wechatpadpro`)
- [ ] `ESM.kind valid` (channel 类型)
- [ ] `ESM 5 methods` 全在 (start/stop/sendText/sendImage/buildSessionKey)
- [ ] `console.log in dist` 0 处 (除 logger 自身)
- [ ] `manifest no password field` (configSchema 不含明文 password)

**退出码**:
- `0`: 全部 PASS, 可考虑真部署
- `1`: critical 失败 (build/load/manifest), 修后再跑
- `2`: PASS with warnings (看 WARN list)

### 3.2 真实 Atomic 部署

`deploy-swap.sh` 实现 7 步 atomic 部署 (自动备份 + 拷贝 + 注册 + 重启 + verify)。

```bash
bash deploy-swap.sh --dry-run   # 先看 plan, 不真写
bash deploy-swap.sh             # 真部署 (要求 5 分钟内 deploy.sh 跑过)
bash deploy-swap.sh --force     # 跳过 dry-run gate (手动确认后用)
```

**7 步详解**:
1. **备份原 prod** → `${BACKUP_ROOT}/wpp-deploy-swap-${TS}/`
2. **tsc build**: `rm -rf dist && npx tsc` (产物 0 个 → 中止)
3. **注入 openclaw.json + env**: `plugins.allow` 加 `wechatpadpro` + `plugins.entries.wechatpadpro = { enabled: true }`
4. **拷贝 artifacts**: `dist/` + manifest + package.json + node_modules + config + accounts
5. **jiti 缓存清理**: `rm -rf $DEPLOY/node_modules/.cache/jiti`
6. **restart gateway**: `systemctl --user restart openclaw-gateway` (docker 环境设 `GATEWAY_SERVICE=` 跳过, 手动 `docker restart`)
7. **verify**: `journalctl | grep "wppChannelPlugin registered"` + 0 error

### 3.3 部署后必做 (5 件事)

1. **设 WECHATPRO_DB_PASSWORD** 到真密码 (gateway 环境)
2. **配 accounts/default.json** 的 tokenKey/authcode (从服务端后台拿, 走 env var)
3. **重启 gateway**: `systemctl --user restart openclaw-gateway`
4. **验证 plugin registered**: `journalctl --user -u openclaw-gateway -n 50 | grep "wppChannelPlugin registered"`
5. **验证 webhook 监听**: `ss -tlnp | grep 4398`

### 3.4 手动接入 (不想用脚本, 或 docker/自定义 OpenClaw)

```bash
# 1. 拷贝插件到 OpenClaw 插件目录
mkdir -p "$OPENCLAW_ROOT/extensions/wechatpadpro"
cp -a dist openclaw.plugin.json package.json config.json accounts "$OPENCLAW_ROOT/extensions/wechatpadpro/"
cp -a node_modules "$OPENCLAW_ROOT/extensions/wechatpadpro/"

# 2. openclaw.json 注册
#    "plugins": { "allow": ["wechatpadpro"], "entries": { "wechatpadpro": { "enabled": true } } }

# 3. 建 agent + binding 路由 (wechatpadpro 渠道 → 你的 agent)
#    npm run setup add default    (自动建 agent wpp-wechat + binding)

# 4. 重启 gateway
```

---

## 4. 回滚 (Rollback)

```bash
# 方案 A: 用备份还原
ls ${BACKUP_ROOT:-/data}/wpp-deploy-swap-*/   # 找最近一次成功部署的备份
BACKUP=$(ls -td ${BACKUP_ROOT:-/data}/wpp-deploy-swap-*/ | head -1)
rm -rf "$OPENCLAW_ROOT/extensions/wechatpadpro"
cp -a "$BACKUP/extensions-wechatpadpro/" "$OPENCLAW_ROOT/extensions/wechatpadpro/"
systemctl --user restart openclaw-gateway

# 方案 B: 完全移除 (彻底撤回)
rm -rf "$OPENCLAW_ROOT/extensions/wechatpadpro"
# 还原 openclaw.json (从更早备份)
# 重启 gateway
```

> 每次 deploy 前/后都有完整 backup (字节级), 可随时回滚。

---

## 5. 故障排查 (Troubleshooting)

| 现象 | 原因 | 解决 |
|---|---|---|
| deploy.sh exit 1: "tsc 编译失败" | 源码编译错 | 看 tsc 报错, 修后重跑 |
| deploy.sh exit 1: "ESM load fail" | 模块循环依赖/语法错 | 检查 dist/index.js 顶部 |
| deploy.sh exit 2: "version mismatch" | package.json vs openclaw.plugin.json 不一致 | 3 处同步 |
| gateway 起不来 status=78/CONFIG | openclaw.json 配置错 (如 binding 含非法字段) | `openclaw doctor --fix` 或还原备份 |
| prod: "plugin not found" | openclaw.json 没加 plugins.allow | 手动 jq 注入 |
| prod: "Cannot find module 'mysql2'" | 没拷 node_modules | `cp -a node_modules` |
| prod: DB connection fail | WECHATPRO_DB_PASSWORD 错 | 改 env, restart |
| 插件加载但消息不进 | webhook 没注册 | journal 看 `setWebhook OK` |
| 私聊全被拒 | `allowFrom` 空 | 加你的 wxid 到 allowFrom |
| 文件读不到内容 | 服务端无文件下载 API | 已知限制, AI 固定回复"无法读取" |
| 媒体 (图/语音/文件) 下载失败 | WPP_VENDOR_HOST 未设或错 | 设对服务端域名, 重启 |

---

## 6. 版本对应

| 组件 | 版本 |
|---|---|
| 插件 | v1.3.63 (本发布包) |
| 服务端 (vendor) | v8_m4.1.12.29_p8.0.75.53 (本包 `vendor/` 已含) |

> **插件仅适配此版本服务端** — 升级服务端前请先确认插件兼容, 或同步升级插件。
