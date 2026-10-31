# 部署指南 (DEPLOY.md)

WeChatPadPro OpenClaw Plugin v1.16.2 部署到 OpenClaw gateway 的详细指南。

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
| Redis | 服务端 (vendor) 依赖, 官方 docker-deploy 内置独立 Redis `127.0.0.1:16379` |

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
# 1. 拉取官方镜像 (build 20260818)
docker pull wechatpadpro/wechatpadprobusiness:v2026.08.18.1

# 2. 用官方 docker-deploy 一键部署 (解压 8075docker-deploy.zip → ./install.sh)
#    install.sh 引导填 user_token_key + 自动生成 Redis 密码
#    config/app.conf: redislink = "127.0.0.1:16379" (独立 Redis)

# 3. 验证 (host 网络, 端口即宿主机)
curl http://127.0.0.1:18062          # HTTP API 就绪
#    swagger: http://127.0.0.1:18062/swagger/
```

**公网接入**: 插件需要访问服务端, 建议 nginx 反代 18062/18089 到域名 (如 `https://wx.example.com`), 插件 `WPP_VENDOR_HOST=https://wx.example.com` (媒体下载白名单, 必设)。

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

### 3.5 厂商接口漂移自查 (部署后 / 厂商升版后跑一次)

`npm test` 里有一道**离线**对齐门 `tests/unit/wpp-swagger-alignment.test.mjs`: 它拿仓库快照
`tests/fixtures/vendor-swagger-endpoints.json` 与源码逐条比对 ——
「源码调的端点都在快照里」「快照里的端点都被显式登记或显式排除」「内联 body 不缺必填键」
「内联 body 里不出现线上没声明的字段名」。(最后一条是 2026-10-16 加的: 字段名写错时厂商 Go 是
**静默忽略**未知字段, 不报错、不生效 —— 必填那一层永远看不见这种病。)

快照只是**某一次**抓下来的线上 swagger, 所以还要单独查「线上有没有变」:

```bash
node tools/check-swagger-drift.mjs                # 默认取 http://127.0.0.1:28062/swagger.json
node tools/check-swagger-drift.mjs --url http://<host>:<port>/swagger.json
```

**退出码 —— 1 和 2 是两件事, 别混:**

| 码 | 含义 | 动作 |
|---|---|---|
| `0` | 线上与快照逐条一致 (md5 相同) | 无 |
| `1` | **有漂移**: 新端点 / 端点下线 / body 字段增删 / **必填项**变化 | 按输出逐条处理 (见下) |
| `2` | **取不到**线上 swagger (容器没起 / 端口不对 / 超时) | 这是「查不了」, **不是**漂移 —— 先确认 vendor 容器在跑 |

漂移的处理顺序:

```bash
curl -s http://127.0.0.1:28062/swagger.json -o /tmp/wpp-swagger.json
node tools/gen-swagger-snapshot.mjs /tmp/wpp-swagger.json          # 重生成快照
node --test tests/unit/wpp-swagger-alignment.test.mjs              # 对齐门会指出要改哪里
```

- **新端点** ⇒ 要么在 `src/send/*.ts` 里接上并登记进 `src/send/index.ts` 的 `WPP_VENDOR_ENDPOINTS`,
  要么写进对齐门里的 `DELIBERATELY_EXCLUDED` (**必须写理由**)。
- **字段改名 / 字段消失** ⇒ 改**源码字段名**。若对齐门报「未知字段」, 那就是厂商改了名 ——
  不要往 `KNOWN_EXTRA_KEYS` 里加条目糊过去 (那张表只收"经裁定**保留**且写明理由"的例外, 且会自己报腐烂)。
- **必填项新增** ⇒ 静态检查只看**键名**不看值, 所以每个受影响的调用点都要人工确认"真发得出这个键且值非空"
  (反例: `ConfirmPreTransferApi` 的工具曾把 4 个必填发成空串 —— 键名对、值不对, 静态检查看不见)。

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
| 插件 | v1.16.2 (本发布包) |
| 服务端 (vendor) | v8_m4.1.12.29_p8.0.75.53 (本包 `vendor/` 已含) |

> **插件仅适配此版本服务端** — 升级服务端前请先确认插件兼容, 或同步升级插件。
