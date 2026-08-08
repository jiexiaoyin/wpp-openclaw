# WeChatPadPro OpenClaw Plugin v1.1.15

**基于 WeChatPadPro (微信 Pad 协议 HTTP API) 的 OpenClaw 适配插件**

参考 OpenClaw v2026.7.1+ 架构设计 + 2026-08-01 老板 B 方案偏好。

## 状态

- **版本**: v1.1.15 (完整 audit 修复: 0 P0, 1 P1 + 4 P2 + 5 P3 全修)
- **Phase G**: AccountContext + AccountRegistry + 6 config helpers + meta/capabilities/gateway (G1-G7 全 ✅)
- **v1.1.15 audit 修复**: P1-1 webhook 验签 placeholder, P2-1 AccountRegistry 并发锁
- **v1.1.15 完整 audit 修复**: P1-1 webhook body cap, P2-1 webhook timeout, P2-2 metrics 集成, P3-1 死代码清理, P3-3 formatErr 统一
- **OpenClaw 契约**: v2026.7.1+ 完整兼容 (register/api, config, meta, capabilities, gateway)
- **测试**: 216/216 全绿 (15 test files, ~3100 LOC)
- **生产部署**: ✅ 5 轮 dry-run + 6 轮 real deploy 验证 + 6 轮 rollback (字节级一致), 现已 0 wechatpadpro 残留

详细 phase 进度见 [ROADMAP.md](./ROADMAP.md), 版本历史见 [CHANGELOG.md](./CHANGELOG.md)。

## 设计原则

- **多账号架构 (Phase G)**: `AccountRegistry` class (纯 in-memory), 单账号/多账号同代码路径
- **B 方案独立账号配置**: `accounts/<id>.json`, 凭证走 env var (老板 2026-08-01 铁律)
- **共存模式**: 与 本项目 并行运行, 不替换
- **完整 vendor 覆盖**: 236 paths (21 tag) 1:1 实现 + 162 agent tools (14 dedicated meta + 1 misc-meta)
- **结构化日志**: 仿 pino 接口, `formatErr` 自动保留 stack (silent killer 永久救回)
- **OpenClaw v2026.7.1+ API 完整对齐**: `register(api)` + 6 config helpers + meta + capabilities + gateway

## 前置依赖 (已部署, 见 DEPLOY.md)

```
✅ 1Panel-mariadb-RlbK (mariadb:11.8.8, 1panel-network 172.23.0.2)
✅ 数据库 wechatpro (用户 wechatpro, 密码从 env: WECHATPRO_DB_PASSWORD)
✅ WeChatPadPro 容器 (wechatpadpromax08, 8062/8089)
✅ 反代: https://wx.juhe.chat/api/... (HTTP API)
✅ 反代: wss://wx.juhe.chat/ws/sync (WebSocket)
✅ Vendor token_key (从 env: WECHATPRO_TOKEN_KEY)
✅ Swagger SSOT: /opt/.../swagger.json (236 paths, basePath=/api)
```

## 快速开始

```bash
# 1. 安装依赖
npm ci

# 2. 配置 env (从 .env.example 复制)
cp .env.example .env
# 编辑 .env 填 WECHATPRO_DB_PASSWORD / WECHATPRO_TOKEN_KEY / WECHATPRO_AUTHCODE

# 3. 编译
npm run build

# 4. 测试 (216 case)
npm test

# 5. dry-run 部署验证
bash deploy.sh
```

真实部署: `bash deploy-swap.sh --force` (见 [DEPLOY.md](./DEPLOY.md))

## 项目结构

```
wechatpadpro-openclaw/
├── README.md                      # 本文件
├── CHANGELOG.md                   # 版本历史
├── DEPLOY.md                      # 部署指南
├── DEV.md                         # 开发指南
├── USAGE.md                       # OpenClaw 框架使用指南
├── FEATURES.md                    # 162 agent tools + 236 vendor endpoints 清单
├── MIGRATION.md                   # v0.1.0 → v1.1.15 升级指南
├── ROADMAP.md                     # 未来 phase 规划
├── openclaw.plugin.json           # channel manifest (channelId: wechatpadpro)
├── package.json                   # npm metadata + scripts
├── tsconfig.json                  # tsc 配置 (strict 6 flags + noUncheckedIndexedAccess)
├── config.json                    # 全局配置 (DB)
├── .env.example                   # 环境变量模板 (凭证单一来源)
├── deploy.sh                      # 部署 dry-run 验证 (默认)
├── deploy-swap.sh                 # 真实 atomic 部署 (--force)
├── accounts/
│   └── default.json               # B 方案: 默认账号配置
├── db/
│   └── schema.sql                 # MariaDB schema (wpp_ 前缀, 7 表)
├── src/                           # ~7900 LOC, 92 .ts 文件
│   ├── index.ts                   # plugin 入口 (register + wppChannelPlugin)
│   ├── config.ts                  # 全局配置加载
│   ├── config-helpers.ts          # 6 OpenClaw channel config helpers (G6)
│   ├── account-state.ts           # 默认 registry 入口
│   ├── accounts/                  # Phase G 多账号 class
│   │   ├── account-context.ts     # 单账号隔离 (G1)
│   │   └── account-registry.ts    # 多账号 registry + inFlight 锁 (G2 + v1.1.15 P2-1)
│   ├── api/                       # vendor API client (236 paths)
│   ├── core/                      # logger, env, paths, constants, signature
│   ├── db.ts / storage/db/        # MariaDB adapter
│   ├── dispatch/                  # OpenClaw 集成 (outbound/handler/agent-tools)
│   ├── inbound/                   # 接收 pipeline (parser/triggers/debouncer/relay/enrich/handler)
│   ├── monitor/                   # webhook + ws-client + metrics
│   ├── outbound/                  # 已删 (G3 重构)
│   ├── send/                      # 21 tag 236 send 函数
│   ├── storage/                   # DB adapter pattern
│   ├── webhooks/                  # 已删
│   ├── ws-client.ts               # WS 客户端
│   ├── webhook-receiver.ts        # HTTP webhook 接收 (含 P1-1 signature 验签)
│   └── ...
├── tests/                         # ~3100 LOC, 15 .test.ts
│   ├── account-context.test.ts
│   ├── account-registry.test.ts
│   ├── api.test.ts
│   ├── basic.test.ts
│   ├── channel-meta.test.ts
│   ├── config-helpers.test.ts
│   ├── core.test.ts
│   ├── db.test.ts
│   ├── gateway-compat.test.ts
│   ├── inbound.test.ts
│   ├── monitor.test.ts
│   ├── plugin-entry.test.ts
│   ├── signature.test.ts
│   └── webhook-receiver.test.ts   # v1.1.15 新增 (metrics 集成 + body cap 单元)
└── dist/                          # tsc 编译产物 (~900K, 92 .js)
```

## 关键命令

```bash
npm run check       # tsc --noEmit (类型检查)
npm run build       # tsc (编译到 dist/)
npm run dev         # tsc --watch --noEmit (dev 模式)
npm test            # 跑 216 测试
bash deploy.sh      # dry-run 部署验证 (默认, 不上 prod)
bash deploy-swap.sh --force  # 真实 atomic 部署
```

## 老板铁律 (勿改)

1. **凭证单一来源 env var**: tokenKey/authcode/password 走 env, 不进 JSON 不进 DB
2. **备份放 /data**: 不放原路径 .bak
3. **不动 /root/.openclaw/openclaw.json**: 这是网关核心配置, 部署时也不能改
4. **deploy.sh 默认 dry-run**: 强制先验证再真部署

## 文档导航

- [CHANGELOG.md](./CHANGELOG.md) — 版本变更记录
- [DEPLOY.md](./DEPLOY.md) — 部署到 OpenClaw gateway 详细步骤
- [DEV.md](./DEV.md) — 二次开发指南 (架构 / 调试 / 测试)
- [USAGE.md](./USAGE.md) — OpenClaw 框架使用 (162 agent tools 怎么用)
- [FEATURES.md](./FEATURES.md) — 162 agent tools + 236 vendor endpoints 完整清单
- [MIGRATION.md](./MIGRATION.md) — v0.1.0 → v1.1.15 升级
- [ROADMAP.md](./ROADMAP.md) — 未来 phase 规划 (v1.1+)
- [docs/wpp-deploy-troubleshooting-2026-08-05.md](./docs/wpp-deploy-troubleshooting-2026-08-05.md) — 1Panel 部署层 troubleshooting (vendor 鉴权 / conf 解析 / 容器失联 / Hook 方案)

## Related

- `本项目` v1.4.4 — 参考架构源头 (77 files 5.6K LOC tests)
- OpenClaw v2026.7.1+ 文档 (OpenClaw v2026.7.1+ dist/index.js v3 channel 完整范式)
