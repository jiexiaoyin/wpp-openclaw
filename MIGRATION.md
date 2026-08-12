# Migration Guide (MIGRATION.md)

> **历史说明**: 本文档记录早期 v0.1.0 → v1.0.1 的迁移细节 (plugin entry API / config / DB schema)。当前生产版本为 **v1.2.0**, 新装请直接看 [GETTING_STARTED.md](./GETTING_STARTED.md)。

## 1. 升级路径 (历史)

```
v0.1.0 (Phase A-F PoC)
  ↓
v1.0.0 (Phase G 完工, 2026-08-04)
  ↓
v1.0.1 (Audit 修复, 2026-08-04)
  ↓
... (v1.1.x 持续迭代)
  ↓
v1.2.0 (当前, 2026-08-09, 生产已部署)
```

**当前生产**: v1.2.0 (`/root/.openclaw/extensions/wechatpadpro/`)

**首次部署**: 直接部署当前版本 (视作 fresh install, 无需历史迁移)

**已部署 v0.1.0 环境的升级**: 见 [§3 升级步骤](#3-升级步骤)

## 2. 主要变化 (v0.1.0 → v1.0.1)

### 2.1 Plugin Entry API 范式变化

**v0.1.0 (旧) ❌**:
```javascript
// dist/index.js
export const wppChannelPlugin = {
  id, name, version,
  kind: "channel",
  start, stop, sendText, sendImage, buildSessionKey,
};
export default wppChannelPlugin;
```

**v1.0.1 (新) ✅** (对齐 OpenClaw v2026.7.1+ 契约):
```javascript
// dist/index.js
export const wppChannelPlugin = {
  id, name, version,
  kind: "channel",
  start, stop, sendText, sendImage, buildSessionKey,
  config: { listAccountIds, resolveAccount, defaultAccountId, isConfigured, unconfiguredReason, describeAccount },
  meta: { id, label, selectionLabel, docsPath, blurb, aliases, quickstartAllowFrom },
  capabilities: { chatTypes, reactions, threads, media, nativeCommands, blockStreaming },
  gateway: { startAccount, stopAccount },
};
export const plugin = {
  id, name, version, description, configSchema,
  register(api) { api.registerChannel({ plugin: wppChannelPlugin }); },
};
export default plugin;
```

### 2.2 多账号架构 (Phase G)

**v0.1.0 (旧) ❌**: module-level Map singleton
**v1.0.1 (新) ✅**: AccountRegistry class (纯 in-memory, 可多实例, 集成 DB 持久化)

### 2.3 内部代码重构

| 旧 (v0.1.0) | 新 (v1.0.1) |
|---|---|
| `src/account-state.ts` 13 facade exports | `src/account-state.ts` 2 函数 (getDefaultAccountRegistry / resetDefaultRegistry) |
| `src/outbound/index.ts` legacy thin wrapper | **删除** (统一到 `src/dispatch/outbound.ts`) |
| `getAccountState(accountId)` (functional) | `getDefaultAccountRegistry().get(accountId)` (class API) |
| `startAccount(accountId, cfg, globalCfg)` | `getDefaultAccountRegistry().start(accountId, cfg)` |
| `stopAccount(accountId)` | `getDefaultAccountRegistry().stop(accountId)` |

### 2.4 Webhook 验签 (v1.0.1 P1-1)

**v0.1.0 (旧) ❌**: webhook 接收无验签
**v1.0.1 (新) ✅**: 完整 HMAC-SHA256 实现 (placeholder, vendor 公开算法后切 strict)

```typescript
// 配了 accounts/<id>.json 的 webhookSecret → 必需要 X-Signature header
// vendor 暂未公开签名算法, 未来切 strict 模式
```

### 2.5 并发 start 锁 (v1.0.1 P2-1)

**v0.1.0 (旧) ❌**: 同 accountId 并发 start 可能创建多个 context, 第二个覆盖第一个 (ctx 泄漏)
**v1.0.1 (新) ✅**: AccountRegistry inFlight Map 序列化, 5 并发 caller 收同 ctx

## 3. 升级步骤 (v0.1.0 部署 → v1.0.1 部署)

### 3.1 备份 (必做)

```bash
# 1. dev 备份
cd /root/dev/wechatpadpro-openclaw
tar --exclude='node_modules' --exclude='.git' -czf /data/wechatpadpro-pre-v0.1.0-$(date +%H%M%S).tar.gz -C /root/dev wechatpadpro-openclaw/

# 2. prod 备份 (如有)
cp -a /root/.openclaw/extensions/wechatpadpro /data/wpp-prod-backup-v0.1.0-$(date +%s)
cp /root/.openclaw/openclaw.json /data/openclaw.json.v0.1.0.bak
```

### 3.2 验证 dry-run

```bash
cd /root/dev/wechatpadpro-openclaw
git pull   # 或手动 sync 到 v1.0.1
npm ci
npm test   # 全绿 (当前 534)
bash deploy.sh  # 退出 0 = 通过
```

### 3.3 真实部署

```bash
bash deploy-swap.sh --force   # 跳过 dry-run gate
# 7 步 atomic deploy
```

### 3.4 部署后验证

```bash
# 1. plugin 加载
journalctl --user -u openclaw-gateway -n 50 | grep "WPP v"
# 应见: "plugin.register: registering wppChannelPlugin (v<当前版本>)"

# 2. 6 plugins 列表
journalctl --user -u openclaw-gateway -n 30 | grep "http server listening"
# 应见: "6 plugins: ..., wechatpadpro, ..."

# 3. 0 warning (之前 4 个全消失)
journalctl --user -u openclaw-gateway -n 100 | grep -iE "warn|error" | grep -iE "wechatpadpro|wpp"
# 应为 0 行

# 4. config helpers 在用
journalctl --user -u openclaw-gateway -n 30 | grep "loaded account config"
# 应见多次: "loaded account config: default (...)"
```

### 3.5 升级后行为差异

| 场景 | v0.1.0 | v1.0.1 |
|---|---|---|
| OpenClaw 加载 | ❌ "missing register/activate" | ✅ plugin 正常注册 |
| OpenClaw 路由 | ❌ 不会调 wppChannelPlugin | ✅ 11+ 次/10s 调 config helpers |
| 多账号 | module Map 单例 | AccountRegistry class + DB 持久化 |
| 并发 start | 潜在 race | inFlight 锁串行化 |
| Webhook 验签 | 无 | placeholder (配 secret 必需要 sig header) |
| 错误信息 | `account not found: X` | `account not found: X (known: A, B)` |
| Log 格式 | `[WPP v0.1.0] ... ${var}` | `ISO-timestamp LEVEL [WPP v1.x] msg key=value` |

## 4. 老板的 OpenClaw 上下文 (历史教训)

- v0.1.0 之前曾部署 prod, 因 manifest 缺 id 爆网关 status=78, 2026-08-04 已撤回
- v1.0.0 + v1.0.1 是修复版, 与 OpenClaw v2026.7.1+ 兼容
- 4 轮 dry-run + 5 轮 real deploy 验证 (Phase G + v1.0.1), 每次 rollback 字节级一致 (SHA 校验)

## 5. 不兼容 / Breaking Changes

- **不兼容 1**: `src/outbound/index.ts` 删除, 如有外部 import 需改成 `src/dispatch/outbound.js`
- **不兼容 2**: `account-state.ts` facade 函数删除 (startAccount/getAccountState/etc.), 改用 `getDefaultAccountRegistry().xxx`
- **不兼容 3**: `wppChannelPlugin` 不再是 default export, default 是 `plugin` (manifest wrapper)
- **不兼容 4**: `WppAccountState` 接口加 4 mutation 方法 (attachWsClient/attachWebhookServer/setVendorAuth/stop), 但 wppChannelPlugin 已实现 (structural typing)

## 6. 回滚 (v1.0.1 → v0.1.0)

```bash
# 1. 用 dev 备份还原
cd /root/dev
rm -rf wechatpadpro-openclaw
tar xzf /data/wechatpadpro-pre-v0.1.0-*.tar.gz

# 2. 用 prod 备份还原
rm -rf /root/.openclaw/extensions/wechatpadpro
cp -a /data/wpp-prod-backup-v0.1.0-*/wechatpadpro /root/.openclaw/extensions/
cp /data/openclaw.json.v0.1.0.bak /root/.openclaw/openclaw.json

# 3. restart gateway
systemctl --user restart openclaw-gateway
```

⚠️ v0.1.0 之前部署会重新触发 OpenClaw "missing register/activate" 错 (因为 v0.1.0 没 register). 推荐不回滚, 升 v1.0.1 后保持.
