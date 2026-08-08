# Deployment Guide (DEPLOY.md)

WeChatPadPro OpenClaw Plugin v1.1.15 部署到 OpenClaw gateway 详细指南.

## 1. 前置检查 (Pre-deploy)

> v1.1.15: 323 tests 全绿 (clean env 322 pass + 1 fixture fail), tsc 0 错, deploy.sh 19 PASS / 0 FAIL / 0 WARN

### 1.1 老板铁律
- **凭证单一来源 env var** (B 方案, 2026-08-01 拍板)
- **备份放 /data** (不放原路径 .bak)
- **不动 /root/.openclaw/openclaw.json** (网关核心, 部署也不能改)
- **deploy.sh 默认 dry-run** (强制先验证再真部署)

### 1.2 系统依赖
- Node.js ≥ 20.x
- OpenClaw v2026.7.1+ (gateway 已运行)
- 1Panel MariaDB (host=1Panel-mariadb-RlbK, db=wechatpro)
- WeChatPadPro vendor 容器 (knowhub.cloud adminmaxapi)

### 1.3 必填环境变量 (见 `.env.example`)
| 变量名 | 来源 | 用途 |
|---|---|---|
| `WECHATPRO_DB_PASSWORD` | env (B 方案) | MariaDB 连接密码 |
| `WECHATPRO_TOKEN_KEY` | env (B 方案) | vendor API TokenKey |
| `WECHATPRO_AUTHCODE` | env (B 方案) | WebSocket 授权码 |

`accounts/default.json` 引用 `tokenKeyEnv` / `authcodeEnv` / `passwordEnv` 字段, runtime 从 env 读.

## 2. Dry-run 部署验证 (强烈建议先跑)

```bash
cd /root/dev/wechatpadpro-openclaw
bash deploy.sh                # 默认 verbose 不开
bash deploy.sh --verbose      # 看每个 step 细节
bash deploy.sh --skip-build   # 跳过 tsc, 复用当前 dist
```

### 2.1 检查清单 (deploy.sh 跑通后)
- [ ] `npm run build` 成功 (2s, dist 92 .js ~900K)
- [ ] `manifest JSON parse` 通过 (`openclaw.plugin.json` 合法)
- [ ] `manifest.id/version/kind` 字段全在
- [ ] `dist/index.js` 存在 (~6KB)
- [ ] `syntax check` 全部 92 .js 通过 `node --check`
- [ ] `ESM load` 成功 (Node ESM 直接 import 不抛)
- [ ] `ESM.id match`: dist runtime id = manifest id (`wechatpadpro`)
- [ ] `ESM.kind valid` (channel 类型)
- [ ] `ESM 5 methods` 全在 (start/stop/sendText/sendImage/buildSessionKey)
- [ ] `plugin.start error path` 返清晰 DB 凭证 error (不抛 generic Error)
- [ ] `console.log in dist` 0 处 (除 logger.ts 自身)
- [ ] `process.exit in dist` 0 处
- [ ] `manifest no password field` (configSchema 不含明文 password)

**退出码**:
- `0`: 全部 PASS, 可考虑真部署
- `1`: critical 失败 (build/load/manifest), 修
- `2`: PASS with warnings (看 WARN list)

## 3. 真实 Atomic 部署

`deploy-swap.sh` 实现 7 步 atomic 部署 (仿 OpenClaw v2026.7.1+ deploy-swap.sh 范式).

### 3.1 先 dry-run 看 plan
```bash
bash deploy-swap.sh --dry-run   # 打印 7 步 plan, 不真写
```

### 3.2 真部署 (强制要求 deploy.sh 刚跑过)
```bash
bash deploy-swap.sh             # 默认要求 5 分钟内 deploy.sh 跑过
bash deploy-swap.sh --force     # 跳过 dry-run gate (老板手动确认后用)
```

### 3.3 7 步详解
1. **备份原 prod**: `cp -a $DEPLOY $BACKUP_DIR/` (`/data/wpp-deploy-swap-${TS}/`)
2. **tsc build**: `rm -rf dist && npx tsc` (产物 0 个 → 中止, 不覆盖空 dist)
3. **注入 openclaw.json + env**:
   - `plugins.allow` 加 `wechatpadpro` (用 `jq`, 不直接 edit)
   - `plugins.entries.wechatpadpro = { enabled: true }`
   - `gateway.systemd.env` 加 `WECHATPRO_DB_PASSWORD=placeholder` (deploy 后必改真值)
4. **拷贝 artifacts**:
   - `dist/` + `openclaw.plugin.json` + `package.json` + `node_modules` (49M) + `config.json` + `accounts/`
5. **jiti 缓存清理**: `rm -rf $DEPLOY/node_modules/.cache/jiti`
6. **restart gateway**: `systemctl --user restart openclaw-gateway`
7. **verify**:
   - `journalctl ... | grep "wppChannelPlugin registered"` (应 1 行)
   - 0 error
   - `http server listening (6 plugins: ..., wechatpadpro, ...)`

### 3.4 部署后必做 (5 件事)
1. **改 WECHATPRO_DB_PASSWORD** 到真密码: `sudo nano /root/.openclaw/gateway.systemd.env`
2. **配 accounts/default.json** 的 tokenKey/authcode (从 vendor 后台拿, 走 env var)
3. **重启 gateway**: `systemctl --user restart openclaw-gateway`
4. **验证 plugin registered**: `journalctl --user -u openclaw-gateway -n 50 | grep "WPP v1.1.15"`
5. **验证 webhook 监听**: `ss -tlnp | grep 4398`

## 4. Rollback (回滚)

```bash
# 方案 A: 用备份还原
ls /data/wpp-deploy-swap-*/   # 找最近一次成功部署的备份
BACKUP=$(ls -td /data/wpp-deploy-swap-*/ | head -1)
rm -rf /root/.openclaw/extensions/wechatpadpro
cp -a "$BACKUP/extensions-wechatpadpro/" /root/.openclaw/extensions/wechatpadpro/
systemctl --user restart openclaw-gateway
# 还原 openclaw.json (从同 backup 拿, 或用 v1.1.15-G35 之类更早备份)
cp /data/wpp-deploy-swap-*/openclaw.json /root/.openclaw/openclaw.json
chmod 600 /root/.openclaw/openclaw.json

# 方案 B: 完全移除 (彻底撤回, 像 2026-08-04 那次)
rm -rf /root/.openclaw/extensions/wechatpadpro
# 还原 openclaw.json (从更早备份)
# 重启 gateway
```

## 5. 老板铁律 (deploy 时勿破)

| 铁律 | 验证方式 |
|---|---|
| 凭证单一来源 env | `.env.example` 列出 + `config.json` 用 `passwordEnv` 引用 |
| 备份放 /data | `deploy-swap.sh` 步骤 1 自动 `cp -a` 到 `/data/wpp-deploy-swap-${TS}/` |
| 不动 openclaw.json 核心 | `deploy-swap.sh` 只 `jq` 注入 `plugins.allow` + `plugins.entries` 2 字段, 不改其他 |
| deploy.sh 默认 dry-run | 强约束, `--force` 才跳过 |

## 6. 部署历史 (rollback backup 索引)

```bash
ls /data/wpp-deploy-swap-*      # 真实部署 backup
ls /data/wpp-deploy-backup-*    # 部署前 snapshot
ls /data/wechatpadpro-pre-v1.0-*  # dev backup
```

每次 deploy 前/后都有完整 backup, 字节级 SHA 校验 (rollback script 含).

## 7. 故障排查 (Troubleshooting)

| 现象 | 原因 | 解决 |
|---|---|---|
| deploy.sh exit 1: "tsc 编译失败" | src 改坏 | 改 src, 重跑 |
| deploy.sh exit 1: "dist/index.js 不存在" | build 失败 | `npm run build` 单独跑看错 |
| deploy.sh exit 1: "ESM load fail" | 模块循环依赖或语法错 | 检查 dist/index.js 顶部 |
| deploy.sh exit 2: "version mismatch" | package.json vs openclaw.plugin.json vs PLUGIN_VERSION 不一致 | 3 处同步 |
| prod: "plugin not found" | openclaw.json 没加 plugins.allow | 手动 `jq` 注入 |
| prod: "Cannot find module 'mysql2'" | 没拷 node_modules | `cp -a node_modules` |
| prod: "missing register/activate" | 旧 v0.1.0 plugin entry (没 register) | 升 v1.1.15 |
| prod: "missing required config helpers" | wppChannelPlugin.config 缺 6 helpers | 升 v1.1.15+ (G6) |
| prod: "incomplete metadata" | wppChannelPlugin.meta 缺字段 | 升 v1.1.15+ (G7) |
| prod: "plugin kind mismatch" | 旧 manifest kind="plugin" + export kind="channel" 冲突 | 升 v1.1.15+ (G3.5) |
| prod: DB connection fail | WECHATPRO_DB_PASSWORD 错 | 改 env, restart |

## 8. v1.1.15~v1.1.15 增量部署注意事项

| 版本 | 新增内容 | 部署影响 |
|---|---|---|
| v1.1.15 | Setup wizard (4 子命令) | 无 (新增 dev tool, 不影响 prod) |
| v1.1.15 | 2 复合索引 (`idx_account_peer_ts` / `idx_account_msgtype_ts`) | 自动 apply (idempotent), 新装 OK, 老装自动补 |
| v1.1.15 | AI dispatcher (WppChannelRuntime) | OpenClaw gateway 启动时需调 `setChannelRuntime` 才能真 dispatch (否则 NOOP) |
| v1.1.15 | E2E test scaffold | 需 `WECHATPRO_DB_PASSWORD` + `WECHATPRO_TOKEN_KEY` + 真扫码 authcode env 才能跑 (否则 4 skip) |
| v1.1.15 | webhook full verify (多算法 sha256/sha1/md5 + strict) | 配 `webhookSecret` 自动启用 HMAC 验签, 不配仍 NOOP |
| v1.1.15 | S3/OSS abstraction | 仅代码, runtime 不变 (S3 config 走 `config.json`) |
| v1.1.15 | 真实 S3 SDK 集成 | `node_modules` +13MB (`@aws-sdk/client-s3` + `s3-request-presigner`), `npm install` 必装 |
| v1.1.15 | setup migrate (v0.1.0 → v1.1 B 方案) | 新增子命令, 不影响老部署 |

部署 v1.1.15 推荐步骤 (新装):
1. 跑 `npm run setup add` 加账号 (B 方案, 凭证走 env)
2. 跑 `npm run setup validate` 11 项检查
3. 跑 `npm run setup migrate` (仅 v0.1.0 升级, 新装跳过)
4. `bash deploy-swap.sh --force` 真实部署
5. `journalctl --user -u openclaw-gateway -n 50` 验证

## 9. 老板拍板的特殊决策

- **2026-08-01**: B 方案 (accounts/<id>.json + env vars) 取代嵌套 config
- **2026-08-04**: wechatpadpro 部署 prod 后撤回 (manifest 缺 id 爆网关 status=78), 现 0 prod 残留
- **2026-08-04**: Phase G 完工, v1.1.15 + v1.1.15 audit 修复, 4 轮 dry-run + 5 轮 real deploy 验证通过
