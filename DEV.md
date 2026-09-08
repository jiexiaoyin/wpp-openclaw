# 开发者指南 (DEV.md)

> **当前基线: v1.5.x** · 源码见 [README.md](./README.md) · 使用见 [USAGE.md](./USAGE.md) · 部署见 [DEPLOY.md](./DEPLOY.md)

面向接开发本插件（v1.5.x）的代码结构、构建、测试与多端同步说明。生产部署者在走 `build-release.sh`，开发者在本仓库改源码时以此为准。

---

## 1. 仓库与目录结构

```
wpp-openclaw/                 # dev 源码仓库 (git: jiexiaoyin/wpp-openclaw)
├── src/                      # 源码 (.ts, ~137 文件 / ~22.9k 行)
│   ├── index.ts              # 插件入口 — 聚合 webhook/命令/账号注册
│   ├── api/ client.ts        # 低层 HTTP 收发 (postWppJson)
│   ├── api-client.ts         # 薄 adapter → 委托 send/<tag>.ts (sendText/Image/Group…)
│   ├── account-state.ts      # 默认账号 registry 单例 (惰性)
│   ├── accounts/             # 账号上下文 (account-context.ts)
│   ├── send/                 # 发送: msg/group/friend/webhook/tenpay/quote-reply…
│   ├── dispatch/             # 入站→OpenClaw dispatch (dispatcher.ts 枢纽/intent-llm/intent-embed)
│   ├── inbound/              # 入站: handler.ts 枢纽/heartflow/affection/enrich/media-enrich/parser
│   ├── storage/db/           # 消息/账本持久化 (mysql.ts / messages.ts …)
│   ├── core/                 # logger / constants / lru / paths
│   └── util/                 # safe-fetch / bigint / exec …
├── dist/                     # 编译产物 (.js, tsc --bundle=false)
├── scripts/                  # 构建辅助 (setup-wizard 等)
├── tests/unit/*.test.mjs     # node:test 单元 + 源级守卫测试
├── docs/                     # 参考文档 (若有)
├── package.json              # "version" + openclaw.extensions
├── CHANGELOG.md / README.md / USAGE.md / GETTING_STARTED.md / DEPLOY.md
```

---

## 2. 构建

```bash
npm run build        # tsc → dist/ (含 setup-wizard 独立编译)
```

产物：
- `dist/*.js` 由 tsc 产出（`--bundle=false`，保留 import 供后续分析）
- `scripts/` 下独立 esbuild 编译的 js 也进 `dist/`

**改完源码必须重 build 同步 dist**，否则网关加载的是旧 `dist/index.js`。

---

## 3. 测试

```bash
node --test tests/unit/*.test.mjs    # 全量
npm run test:single -- <file>        # 单个
```

当前基线: **103 pass / 0 fail / 2 skip**（2 skip 为显式 `# SKIP` 的 HMAC 凭据保留 test）。

测试分两类：
1. **运行时/集成** — 直接 import src 逻辑跑断言（如 heartflow-learn、send-group）。
2. **源级守卫 (source-level)** — 读 `src/*.ts` 文本断言关键结构不回归（如 perf-heat-path 防热路径回退成底层 I/O、deploy-integrity 防文案拼错的常量）。

新增核心逻辑建议两种都补一条（真断言 + 防回退守卫）。

---

## 4. 账号与配置多端

- 全局配置 `config.json`（DB 连接，从 env 取密码，不落明文）。
- 账号配置 `accounts/<id>.json`（单账号时 `<id>=default`）。
- 配置读取走 `config.ts` 的 **LruCache**（disk I/O 缓存，TTL 60s）。
- manifest `openclaw.plugin.json` schema 的 default/enum 是兜底链第 1 环（见 CHANGELOG v1.4.0 设计哲学）。

---

## 5. 热路径性能约定（勿破坏）

以下热路径**已是内存 O(1) 或带 LRU**，重构不得回退成每次 disk/DB/网络读：
- 账号配置 → `config.ts` LruCache。
- 群好感度/情绪 → `affection.ts` `groupStates` 内存 Map。
- 心流学习阈值 → `heartflow-learn.ts` `_learnedThresholds` 内存 Map（DB 聚合只在启动/热载）。
- OSS 凭据 → `media-oss.ts` / `media-enrich/shared.ts` LruCache (TTL 30s)。

`tests/unit/perf-heat-path.test.mjs` 固化上述结构，改动需保持全绿。

---

## 6. 三端同步（dev / deploy / GitHub）

开发一处改完同步到三处保持幂等（老板 2026-08 拍板）：
1. **dev**: 本仓库 `src/` 改 + `npm run build`。
2. **GitHub**: 提交 + `git push origin master`。凭证不入 git（本地 `.git/config` 管 `[user]`）。推送用 `force-with-lease` 而非 `--force`（避免覆盖）。
3. **deploy**: 用 `./build-release.sh`（含备份到 `/data/`，脱敏 host/token/wxid）产出释放包 → `/root/.openclaw/extensions/wechatpadpro/`，再 `systemctl --user restart openclaw-gateway`。

**铁律**: 部署/重启是外部动作，需老板明确授权后执行。改动只落在 dev+GitHub 不算上线。

---

## 7. 版本号

- `package.json.version` 为单一来源（`PLUGIN_VERSION` 构建时动态读）。
- manifest 版本随 `git bump` 同步。
- CHANGELOG 按 [Keep a Changelog](https://keepachangelog.com/) 记录 **本 dev 仓库实际提交**；若多处上线未逐版同步，需在对应条目加「注: 详见 git log」说明，勿凭空补历史。

---

## 8. 已知架构注意点

- `dispatcher.ts` (~943 行) 是入站 dispatch 枢纽（分支编排，非上帝直线逻辑），D4 单文件超健康阈值但 A+ 未扣分；**拆分需先统一对 `WppAccountConfig` 强类型 + registry 的访问层**，直接按函数搬会破坏类型。
- `api-client.ts`(barrel) ↔ `api/client.ts` ↔ account-state/registry 存在**潜伏惰性值环**（当前全惰性调用无 TDZ 崩溃），改这些文件时**勿把任意惰性 import 提到模块顶层 / 勿把 `import type` 改值 import**，否则可能启动期崩溃。
