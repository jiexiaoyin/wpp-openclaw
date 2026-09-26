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
2. **GitHub**: **`bash sync-github.sh`** 是唯一发布通道（2026-09-26 起）——它一次做四件事：
   `release/` 重建（`build-release.sh`，脱敏 + 门）→ `/data` 发布包 + zip → `main` 分支（脱敏 release）→
   `master` 分支（**脱敏源码快照**）。凭证不入 git（本地镜像 `.git/config` 管 `[user]`）；
   推送用 `--force-with-lease` 而非 `--force`。
3. **deploy**: 用 `./build-release.sh` 产出释放包 → `/root/.openclaw/extensions/wechatpadpro/`，
   再 `systemctl --user restart openclaw-gateway`（或 `deploy-swap.sh --force` 走 atomic 换树）。

**铁律**: 部署/重启是外部动作，需老板明确授权后执行。改动只落在 dev+GitHub 不算上线。

### 6.1 脱敏（2026-09-26 事故后加固：两处都必须脱敏）
公开仓 = `jiexiaoyin/wpp-openclaw`。`main` = 脱敏 release，`master` = 脱敏**源码快照**。

- **规则单一真源（不进仓、不发布）**: `~/.openclaw/wpp-sanitize.rules`（0600，`WPP_SANITIZE_RULES` 可覆盖）。
  规则含真实敏感串 ⇒ **绝不能内联进任何会发布的文件**。血的教训：旧版 `build-release.sh` /
  `sync-github.sh` 把 `PERSONAL` 正则内联在自己文件里，而这两个脚本自己在 `master` 里
  ⇒ 2026-09-26 审计发现 master **从 Initial commit 起 62 个提交全部**带个人信息
  （真实 wxid / 群 ID / 老板登录名 / vendor host / 生产密钥前缀，46 个文件命中），**含一把明文 API key**。
  该历史已重写（`tools/oneoff-rewrite-master-history-2026-09-26.sh`，旧 SHA `bb78ca4` → `133aabd`）。
- **二次事故（同一次审计抓出，两个"假安全"）**: ① `main` 27 个提交 + `master` 新提交的**作者/提交者邮箱**是老板
  个人 gmail —— 根因是本地镜像仓 `.git/config` 的 `user.email` 就是它，**每次同步新建的提交都把 gmail 带回来**
  ⇒ **只查 tip 的门 = 假安全**，meta 也不在"文件内容"门的视野里；② `main` 历史里 1 个提交（2026-08-20）的
  `USAGE.md` 把真实群 ID 当示例写了（后续提交改掉了 ⇒ **只看 tip 同样看不出来**）。
  两个分支的元数据+历史内容已二次重写（`tools/oneoff-scrub-author-email-2026-09-26.sh`，
  `--mailmap` + `--replace-text`；**两分支 tip 树 SHA 不变** ⇒ 公开的当前内容零变化）：
  `master` `32fd6e5` → `3a6b1edf`，`main` `456bdf68` → `0144fdaa`。
  根因同修：镜像仓 `git config user.email` = `jiexiaoyin@users.noreply.github.com`。
- **执行器**: `tools/sanitize-source.sh`（本文件无敏感串，可发布）
  `--check <dir|file>`（门）/ `--apply <dir>` / `--check-history <repo> [ref]`（**逐提交**校验整条历史）
  / `--emit-filter-repo <f>`（历史重写用）。规则是 **Python regex**（要前后视断言，见下）。
- **master 发布快照排除项**: `node_modules/` `coverage/` `release/` `dist-release/`（依赖与产物）、
  `accounts/default.json`（本机运行期账号配置：真实 wxid/管理员/群白名单；公开仓只留 `.example`）。
- **发布门（三道，缺一不可）**: ① 快照 `--check` 0 命中（内容）；② 每次 commit 后
  `tools/check-commit-metadata.sh` 查**作者/提交者邮箱**（元数据，不过则 `git reset --soft` 撤销提交并中止）；
  ③ 历史改动后 `--check-history` **逐提交**核树 + 提交信息 + 作者。有残留 ⇒ 拒绝上传。
- **为什么用前后视断言**: 如"11 位手机号但两侧不是数字"——否则长数字 ID / hex 里的片段会被误伤
  （实测 `9007199254740992` 里能"匹配"出手机号）。sed 的 ERE 表达不了 ⇒ 执行器用 python3，
  与历史重写（git-filter-repo = Python re）语义一致，树脱敏与历史重写可逐字节对齐。
- **`master` 别再手工 push**: 手工 push 就是这次泄漏的成因（无可避免地夹带本机串）。
  dev 本地仓的旧 `master` 分支已改名 `archive/pre-sanitize-master-2026-09-26`（防误 push）。

---

## 7. 版本号

- `package.json.version` 为单一来源（`PLUGIN_VERSION` 构建时动态读）。
- manifest 版本随 `git bump` 同步。
- CHANGELOG 按 [Keep a Changelog](https://keepachangelog.com/) 记录 **本 dev 仓库实际提交**；若多处上线未逐版同步，需在对应条目加「注: 详见 git log」说明，勿凭空补历史。

---

## 8. 已知架构注意点

- `dispatcher.ts` (~943 行) 是入站 dispatch 枢纽（分支编排，非上帝直线逻辑），D4 单文件超健康阈值但 A+ 未扣分；**拆分需先统一对 `WppAccountConfig` 强类型 + registry 的访问层**，直接按函数搬会破坏类型。
- `api-client.ts`(barrel) ↔ `api/client.ts` ↔ account-state/registry 存在**潜伏惰性值环**（当前全惰性调用无 TDZ 崩溃），改这些文件时**勿把任意惰性 import 提到模块顶层 / 勿把 `import type` 改值 import**，否则可能启动期崩溃。
