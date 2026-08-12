# Development Guide (DEV.md)

WeChatPadPro OpenClaw Plugin 开发指南 (架构 / 调试 / 测试 / 添加功能 / 会话交接).

## 0. 当前状态 (Session Handover — 2026-08-11)

### 0.1 版本基线
- **dev version**: `1.3.40`(src/core/constants.ts PLUGIN_VERSION)
- **deploy version**: `1.3.40`(/root/.openclaw/extensions/wechatpadpro/, 生产已上线)
- **CHANGELOG**: 最新 v1.3.40
- **测试**: 731/731 全绿
- **账号**: 益融小助理 (wxid_eezdbu1ytws422), authcode `71bed0f5-626a-43ad-9831-b2d7017b27e0` (2026-08-11 gewe 迁移)

### 0.2 近期关键变更 (v1.3.26 ~ v1.3.40)
- **v1.3.26**: listAccountIds async→sync 契约修复 (OpenClaw health 同步调用 + spread 展开)
- **v1.3.27**: BigInt 序列化 + safe-fetch 3 AI 域名白名单 + media-enrich 拆 6 子模块
- **v1.3.28/29**: 图片/视频朋友圈发布 (publishImages/publishVideo + agent-tools)
- **v1.3.30**: setup 8 字段补全 + diagnose 命令 + 文档字段字典
- **v1.3.31**: classifyGroupIntent 改"有文字一律 topic" (群@回复)
- **v1.3.32**: NO_REPLY 修复 (群聊上下文提示加"必须回复")
- **v1.3.33**: 群聊引用回复加 @被回复人昵称 (gewe 范式)
- **v1.3.34**: 三表同步 (contacts/chatrooms/members) + gewe 6025 消息迁移
- **v1.3.35**: OSS 结构统一 `wpp/{account}/{type}/{date}` + gewe 文件迁移归档
- **v1.3.36**: media-oss 适配 buildOssKey + wpp 原本文件归档
- **v1.3.37**: 接龙解析增强 (单行/条目内换行/保守不猜昵称)
- **v1.3.38**: 借鉴 gewe (pending-reply 路由 + attachments 数组兼容)
- **v1.3.39**: filehelper 特殊会话命令 (只处理命令)
- **v1.3.40**: filehelper 命令注册表 (白名单增删 + 自动 /help 兼容)

### 0.3 架构变更 (2026-08-11 gewe 迁移)
- **gewe-multi-agent 已移除**, 益融小助理迁到 WPP
- 5 个 skill: wpp-history / wpp-identity / wpp-friendcircle / wpp-friendcircle-stats / wpp-friendcircle-view
- 三表本地查询: wpp_contacts(20) / wpp_chatrooms(8) / wpp_chatroom_members(86)
- OSS 结构: `wpp/default/{images,voices,videos,files}/{YYYY-MM-DD}/` (846 文件)
- geweWechatId → wppId 全量重命名 (phoneerp SSOT + DB + 程序)

### 0.4 备份位置 (/data)
| 备份 | 用途 |
|---|---|
| `wpp-v1159-file-deterministic-reply-20260809-1430/` | v1.2.0 dev 备份 |
| `wpp-comment-cleanup-final-20260809-1530/` | 注释精简后版本备份 |
| `wpp-docs-optimize-20260809-1600/` | 文档优化前备份 |
| `wpp-deploy-swap-*/` | 每次真实部署自动备份 |

### 0.5 引用回复终态 (v1.1.55 起, 已覆盖早期 BUGFIX)

**早期问题**: v1.1.28 曾把引用回复 XML 改 title=displayname + des=AI → client 只显示 refermsg 预览。
**v1.1.55 终态**: appmsg type=57, **title=AI 回复文字** (gewe 范式), refermsg 极简 svrid+fromusr, 全 msgType 引用。
**当前已知限制**: 无 (引用回复/图片/文件均正常)。

### 0.6 待办事项 (按 ROI 排序)

> **2026-08-09 更新**: 近期待办已基本清空。
> - ✅ vendor API 覆盖: 231/231 (20 tag) 已实现 (见 send/index.ts WPP_VENDOR_ENDPOINTS)
> - ✅ ReDoS 防护 / hot-reload 全字段 / gateway-compat / e2e mock 全完成
> - ⬜ **v1 schema 文件内容下载** (vendor 无 API, 需联系 knowhub.cloud) — 当前文件消息确定性回复兜底
> - ⬜ **图片 >64KB 完整下载** (vendor /Tools/DownloadImg 硬限 64KB)
> - ⬜ **多账号 UI** (当前 CLI setup wizard)
> - ⬜ **E2E 真凭证测试** (需真 WECHATPRO_DB_PASSWORD + 真扫码 authcode)

| 优先级 | 项 | 估时 | 风险 |
|---|---|---|---|
| P0 | deploy v1.1.32 全量修复 + 实测 (等老板拍板时机) | 0.5h | 必须 |
| P3 | Admin/Login 海外/QWContact/Wxapp 11 个缺口补齐 (按需) | 2h | 低 |
| P3 | OpenTelemetry 整合 (149 log + 22 metrics → OTel) | 长 | 低 |
| P3 | 图片引用能力重启用 (等 vendor 暴露真 svrid) | 阻塞 | vendor 限制 |

## 1. 架构总览

### 1.1 多账号架构 (Phase G 后)

```
OpenClaw Gateway
    ↓ plugin.register(api)
    ↓ api.registerChannel({ plugin: wppChannelPlugin })
    ↓
wppChannelPlugin
├── config:    6 helpers (listAccountIds/resolveAccount/...)        [G6]
├── meta:      UI display info                                       [G7]
├── capabilities: feature flags                                      [G7]
├── gateway:   startAccount/stopAccount                              [G7]
├── start/stop/sendText/sendImage: 顶层 lifecycle
└── buildSessionKey: utility

    ↓ startAccountById
    ↓
AccountRegistry (singleton via getDefaultAccountRegistry())
├── contexts: Map<accountId, AccountContext>
└── inFlight: Map<accountId, Promise>  [v1.1.15 P2-1 lock]

    ↓
AccountContext (1 per account)
├── config: WppAccountConfig (from accounts/<id>.json)
├── apiClient: WechatpadproApiClient (1 per ctx)
├── wsClient / webhookServer (attached post-start)
├── inboundFlushHook — stop() 顺序: clearRetryTimers → flushAll → ws.stop → webhook.stop
└── scoped logger: [WPP:<accountId>] prefix
```

### 1.2 关键设计约束
- **1 accountId = 1 AccountContext** (Registry 保证)
- **多实例隔离**: 测试可 `new AccountRegistry()` 不污染 default
- **DB 共享**: 所有账号共用 1 个 MariaDB pool (`setBackend` 同 cfg 幂等)
- **凭证隔离**: tokenKey/authcode/webhookSecret 走 env var, 不进 config.json / accounts/<id>.json / DB
- **v1.1.16 P0-FIX**: `cfg.agent` 必填且禁止 `"main"` (防 25+ 联系人 fan-out)

## 2. 目录结构 (src/)

```
src/
├── index.ts                  # plugin 入口 (default = plugin, named = wppChannelPlugin)
├── config.ts                 # 全局配置加载 (config.json)
├── config-helpers.ts         # 6 OpenClaw channel config helpers [G6]
├── account-state.ts          # 默认 registry 入口 (2 函数)
├── accounts/                 # Phase G 多账号 class
│   ├── account-context.ts    # 单账号隔离 + attachInboundFlush
│   └── account-registry.ts   # 多账号 registry + inFlight 并发锁
├── api/                      # vendor HTTP client (231 paths, 20 tag)
├── core/                     # logger, env, paths, constants, signature, safe-regex, runtime-config
├── db.ts / storage/db/       # MariaDB adapter (wpp_ 前缀表)
├── dispatch/                 # OpenClaw 集成
│   ├── outbound.ts           # 主 outbound (sendText/Image/Voice/Video/App/Revoke)
│   ├── handler-action.ts     # OpenClaw action handler
│   ├── pending-reply.ts      # AI 发消息 newMsgId 跟踪
│   ├── reply-helpers.ts      # reply 公共逻辑 (引用上下文)
│   ├── resolve-local-media.ts
│   ├── dispatcher.ts         # AI dispatcher + per-session 串行 (v1.1.26 CONCURRENCY-FIX)
│   └── agent-tools/          # 159 agent tools (13 dedicated + misc)
├── inbound/                  # 接收 pipeline
│   ├── parser/               # wxid/mention/quote/content/payload/index
│   ├── parser.ts             # payloadToInboundMessage + parseV1Message (v1 真实格式)
│   ├── triggers.ts           # 4-way trigger (DM allowFrom fail-closed [v1.1.16])
│   ├── debouncer.ts          # 1.5s 合并 + VOICE bypass
│   ├── relay.ts              # 接龙 XML 解析 (字面 \n 修复)
│   ├── enrich.ts             # DB 写入
│   ├── media-enrich.ts       # 图片/视频/文件/语音 下载 + OSS
│   ├── handler.ts            # QUOTE media inject (image/video/file/voice)
│   ├── hongbao.ts            # 红包消息处理 + return (v1.1.17)
│   └── quote-svrid.ts        # 引用消息 svrid 映射表
├── monitor/                  # webhook + ws-client + metrics
├── send/                     # 20 tag 231 send 函数
│   ├── msg.ts                # SendTxt/SendCDNImg/Video/Voice/ShareLink/Revoke/Quote
│   ├── group.ts              # 字段名对齐 vendor swagger (ChatRoomName/ToWxids/QID)
│   ├── search.ts             # query 字段对齐
│   ├── friend.ts / friendcircle.ts / finder.ts / tenpay.ts / voice.ts / translate.ts
│   │                         # 字段名批量对齐 vendor swagger
│   └── quote-reply.ts + quote-xml.ts  # 引用回复 (v1.1.55 title=AI + 极简 refermsg)
├── storage/                  # DB adapter + media (S3 + 临时文件)
│   ├── silk.ts               # silk encoder/decoder
│   └── stt.ts                # SiliconFlow STT
├── webhook-receiver.ts       # HTTP webhook 接收 (P1-1 signature + SeenTracker 去重)
└── ws-client.ts              # WS 客户端 (vendor MMTLS 长链)
```

## 3. 调试技巧

### 3.1 启用 DEBUG 日志
```bash
export WPP_DEBUG=1
npm test
```
或在 systemd:
```bash
sudo systemctl --user edit openclaw-gateway
# 加 Environment=WPP_DEBUG=1
```

### 3.2 隔离单个测试
```bash
npx tsx --test tests/account-registry.test.ts
npx tsx --test --test-name-pattern="并发" tests/account-registry.test.ts
```

### 3.3 手动触发 plugin (不通过 gateway)
```bash
node --input-type=module -e "
import { wppChannelPlugin, plugin } from './dist/index.js';
console.log('plugin:', plugin.id, plugin.version);
console.log('channel:', wppChannelPlugin.id, wppChannelPlugin.kind);
plugin.register({
  registerChannel: (arg) => console.log('registerChannel called:', arg.plugin.id),
});
"
```

### 3.4 查看 mock 配置
```bash
cat accounts/default.json | jq .       # 当前 dev 测试账号
cat config.json | jq .                  # 全局配置
cat /root/.openclaw/extensions/wechatpadpro/accounts/default.json | jq .   # prod 账号
cat /root/.openclaw/extensions/wechatpadpro/config.json | jq .              # prod 全局
```

### 3.5 MMTLS 健康检查
```bash
bash /root/dev/wechatpadpro-openclaw/scripts/mm-health-check.mjs
# 检查: vendor 容器运行 + MMTLS outbound ≥ 1 + openclaw-gateway active + journal fatal + webhook 200
# 部署 cron: */5 * * * * bash scripts/mm-health-check.mjs >> /var/log/wpp-health.log 2>&1
```

### 3.6 vendor API 直连 (curl 验证契约)
```bash
curl -X POST https://wx.juhe.chat/api/Msg/SendTxt \
  -H "X-TokenKey: $WECHATPRO_TOKEN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"toWxid": "wxid_xxx", "content": "test"}'
```

## 4. 添加新功能

### 4.1 添加 vendor endpoint (对齐 swagger)
**前置**: vendor swagger.json 已有 path (`curl -s http://127.0.0.1:8062/swagger.json`)

```typescript
// src/api-client.ts 或 src/send/<tag>/<func>.ts
async myNewEndpoint(param: string): Promise<WppApiResponse<MyData>> {
  return this.call("/New/MyEndpoint", { param });  // 字段名按 swagger definitions
}

// src/dispatch/agent-tools/<tag>-meta.ts
myNewFunc: [
  "工具描述",
  Type.Object({ param: Type.String() }),
  api.myNewFunc,
],
```

### 4.2 添加 agent tool (AI-callable)
同上 4.1,工具会自动注册到 AGENT_TOOLS_META (src/dispatch/agent-tools/index.ts)。

### 4.3 添加新账号 (B 方案)
```bash
cat > accounts/<id>.json <<EOF
{
  "enabled": true,
  "tokenKeyEnv": "WECHATPRO_<ID>_TOKEN_KEY",
  "authcodeEnv": "WECHATPRO_<ID>_AUTHCODE",
  "agent": "<id>-wechat",  // v1.1.16 必填, 禁止 "main"
  ... 其它字段从 accounts/default.json 复制
}
EOF
echo "WECHATPRO_<ID>_TOKEN_KEY=xxx" >> /root/.openclaw/gateway.systemd.env
echo "WECHATPRO_<ID>_AUTHCODE=xxx" >> /root/.openclaw/gateway.systemd.env
systemctl --user restart openclaw-gateway
journalctl --user -u openclaw-gateway -n 20 | grep "loaded account config: <id>"
```

## 5. 测试规范

### 5.1 测试框架
- `node:test` + `node:assert/strict` (0 依赖)
- `tsx --test tests/*.test.ts` 跑全部
- **当前测试量**: 49 文件 / ~8000 LOC / 539 case (分批跑 7-15s/run)

### 5.2 测试覆盖要求
- **新功能**: ≥ 5 case (正常 + 边界 + 错误 + 多账号隔离)
- **Bug fix**: 1 个回归 test
- **Refactor**: 保持现有测试全绿

### 5.3 多账号隔离测试模板
```typescript
test("X — 2 个实例完全隔离", async () => {
  const reg = new AccountRegistry();
  const ctxA = await reg.start("alice", makeCfg());
  const ctxB = await reg.start("bob", makeCfg());
  assert.notEqual(ctxA.apiClient, ctxB.apiClient);
});
```

### 5.4 跑测试 + 类型检查
```bash
npm run check    # tsc --noEmit
npm test         # 全部 539 case
# 单个文件:
npx tsx --test tests/safe-regex.test.ts
# 注: gateway-compat / quote-trigger / e2e 已用 mock 修复 (e2e-helper USE_MOCK 默认 true), 不再卡死
```

## 6. 部署流程

### 6.1 部署前 checklist
- [ ] `npm run check` 0 错
- [ ] 关键测试全绿 (inbound/parser/quote/dispatcher/agent-tools/api/db)
- [ ] `bash deploy.sh` 退出 0 (dry-run + 19 PASS / 0 FAIL)
- [ ] 备份当前 prod:`cp -a /root/.openclaw/extensions/wechatpadpro /data/wpp-pre-v<new>-<ts>/`

### 6.2 真实部署
```bash
bash deploy-swap.sh --force
# 自动: 备份原 prod → tsc build → 拷贝 dist + manifest → 清 jiti → restart gateway → verify
```

### 6.3 部署后验收 5 项
1. dist 102 .js 文件就位
2. `PLUGIN_VERSION = "<new>"` 三处一致 (package.json / openclaw.plugin.json / core/constants.ts)
3. webhook 127.0.0.1:4398 LISTEN
4. systemd `openclaw-gateway active`
5. vendor MMTLS outbound ≥ 1

### 6.4 回滚
```bash
rm -rf /root/.openclaw/extensions/wechatpadpro
cp -a /data/wpp-pre-v<old>-<ts>/. /root/.openclaw/extensions/wechatpadpro/
systemctl --user restart openclaw-gateway
```

## 7. OpenClaw 集成关键点 (供 OpenClaw 查阅)

### 7.1 plugin 入口契约 (v2026.7.1+)
```typescript
// src/index.ts
const plugin = {
  id: CHANNEL_ID,                          // "wechatpadpro"
  register(api: OpenClawRegisterApi) {       // 必需
    api.registerChannel({ plugin: wppChannelPlugin });
  },
};
export default plugin;
export { wppChannelPlugin };                  // named export
```

### 7.2 wppChannelPlugin 结构
```typescript
{
  id: "wechatpadpro",
  kind: "channel",
  name: PLUGIN_NAME,                        // "WeChatPadPro"
  version: PLUGIN_VERSION,                   // "1.1.27"
  meta: { id, label, selectionLabel, docsPath, blurb, aliases, quickstartAllowFrom },
  capabilities: { chatTypes: ["direct", "group"], media: true, ... },
  config: {                                  // 6 helpers (G6)
    listAccountIds, resolveAccount, defaultAccountId,
    isConfigured, unconfiguredReason, describeAccount,
  },
  gateway: {
    async startAccount(ctx) { /* registry.start + WS + Webhook */ },
    async stopAccount(ctx) { /* registry.stop */ },
  },
  agentTools: AGENT_TOOLS,                   // 162 tool list
  async start(accountId, agentId = "wpp-wechat") { /* lifecycle */ },
  async stop(accountId) { /* shutdown */ },
  async sendText(accountId, toWxid, text, ats?) { /* outbound */ },
  async sendImage(accountId, toWxid, imageUrlOrPath) { /* outbound */ },
  buildSessionKey(opts) { /* peerKind + peerId → "agent:<id>:wechatpadpro:<acct>:<kind>:<peer>" */ },
}
```

### 7.3 inbound 接入点
- **webhook**: `/wechatpadpro/<accountId>/webhook` (POST) + `/wechatpadpro/<accountId>/webhook/business`
- **WS**: `wss://wx.juhe.chat/ws/sync` (vendor MMTLS 长链)
- **三通道去重**: SeenTracker (内存 30min) + DB UNIQUE (account_id, msg_id, new_msg_id) 双层

### 7.4 已知 OpenClaw 限制 (勿触碰)
- v3 API 必填: `plugin` manifest + `register(api)` + `wppChannelPlugin.config` 6 helpers + `meta` + `capabilities` + `gateway`
- Plugin 不能改 /root/.openclaw/openclaw.json (deploy-swap.sh 已守)
- 凭证不能进 plugin 文件 (走 env var / systemd env file)

## 8. 历史教训 (反馈)

- **本项目 v1.4.4** 在 `/root/dev/本项目/` 是参考架构(同账号多 agent 隔离)
- 另: dist 在 `/root/.openclaw/extensions/other/dist/index.js` v3 channel 完整范式
- OpenClaw v2026.7.1+ 文档不公开; 内部 doc 描述实现
- **v1.1.16 P0 污染事件**: 老板主号 25+ 联系人 fan-out — 根因 `agentId: "main"` hardcode, fix 强制 `cfg.agent` 必填
- **vendor MMTLS 长链死亡**: 已 4 次误诊(feedback-wpp-vendor-push-issue-2026-08-08.md), 监控 SOP 是 `scripts/mm-health-check.mjs`
- **引用回复**: appmsg type=57 + title=AI 回复 (v1.1.55), refermsg 极简 svrid+fromusr (gewe 范式)

## 9. 文件级速查表

| 关注点 | 文件:行 |
|---|---|
| 门禁判定 (live) | `src/inbound/triggers.ts:46-114` |
| DM fail-open / groupPolicy fail-fast | `src/index.ts:73-92`, `src/inbound/triggers.ts:64-70` |
| 群 session 按 groupId | `src/inbound/parser.ts:154-158` |
| 引用回复 XML | `src/send/quote-xml.ts`, `src/send/quote-reply.ts` |
| 三通道去重 (P0-G) | `src/inbound/handler.ts:185-211` + `src/webhook-receiver.ts:209` |
| MMTLS outbound 监控 | `scripts/mm-health-check.mjs` |
| Shutdown flush debouncer | `src/accounts/account-context.ts:48` + `src/index.ts:135` |
| STT pipeline | `src/storage/silk.ts` + `src/storage/stt.ts` |
| OSS 目录规范化 | `src/inbound/media-enrich.ts` (4 处 `wpp/` prefix) |
| ReDoS 防护 | `src/core/safe-regex.ts` + parser/content.ts + parser/quote.ts |
| vendor 字段对齐 | `src/send/{group,search,friend,friendcircle,finder,tenpay,voice,translate}.ts` |
| 创建时间列 | `db/schema.sql:33` + `src/storage/db/m.ts:155` |

## 10. 老板铁律(项目铁律,勿违反)

1. **凭证单一来源 env var** — tokenKey/authcode/webhookSecret 不进 config.json / accounts/*.json / DB
2. **备份统一放 /data** — 不放原路径 .bak
3. **不动 /root/.openclaw/openclaw.json** — 这是网关核心配置
4. **引用回复** — 全 msgType 引用 (v1.1.50 放开), title=AI 回复文字 (v1.1.55)
5. **per-账号必填 cfg.agent** — 禁止 "main"

## 11. 跟进清单 (Next Session)

> **2026-08-09 更新**: 历史待办 (v1.1.28 BUGFIX/实测字段/regex safeMatch/微信号格式) 已全部完成。

1. **v1 schema 文件内容下载** (vendor 无 API, 需联系 knowhub.cloud) — 当前文件确定性回复兜底
2. **图片 >64KB 完整下载** (vendor /Tools/DownloadImg 硬限 64KB) — 联系 vendor 加 endpoint
3. **多账号 UI / 统一管理界面** (当前 CLI setup wizard)
4. **E2E 真凭证测试** (需真 WECHATPRO_DB_PASSWORD + 真扫码 authcode)
5. **ESLint 清理** (当前仍有 warnings, 不引 console.log 铁律)
## 12. 部署 SOP (v1.3.18 强化)

老板铁律 (C9 SOP):
1. **dev 阶段禁止部署**到 `/root/.openclaw/extensions/wechatpadpro/` — 仅 `deploy-swap.sh` 才动 prod
2. deploy-swap 默认要求 deploy.sh 已跑 (exit 0); `--force` 跳过 gate (老板手动确认后才用)
3. **备份统一放 /data** — 不放原路径 .bak; 命名 `wpp-<task>-<YYYYMMDD-HHMMSS>/`
4. **不动 `/root/.openclaw/openclaw.json`** — 这是网关核心配置, 部署时也不能改

### deploy.sh vs deploy-swap.sh 完整区别

| 项 | `deploy.sh` (13.8KB) | `deploy-swap.sh` (6.3KB) |
|---|---|---|
| 模式 | **DRY-RUN ONLY** (默认) | **真实 atomic 部署** |
| 阶段 | 5 阶段: build / manifest / dist integrity / ESM load / 总结 | 7 阶段: md5sum backup / cp dist / atomic rename / restart / verify |
| 写 prod | ❌ 不动 `/root/.openclaw/` | ✅ 写 `/root/.openclaw/extensions/wechatpadpro/` + restart gateway |
| 默认要求 | 无 (任何时候可跑) | deploy.sh 已 exit 0 |
| 跳过 gate | N/A | `--force` (老板手动确认后) |
| 备份 | 无 (不动 prod) | md5sum 对账 + cp -a 到 `/data/wpp-deploy-<TS>/` |

### 标准部署 SOP (老板拍板)

```bash
# Step 1: dev 阶段编辑 /root/dev/wechatpadpro-openclaw/
#   - 改 src/ 或 accounts/<id>.json
#   - 跑: npx tsc --noEmit (必须 0 错)
#   - 跑: unset MINIMAX_API_KEY BAILIAN_EMBEDDING_API_KEY && npm test (必须全绿)

# Step 2: dry-run 验证 (不动 prod)
cd /root/dev/wechatpadpro-openclaw
bash deploy.sh
#   必须 exit 0, 看 build/manifest/ESM load 5 阶段全 pass

# Step 3: 老板手动确认 (chatGPT/微信/控制台 跟 AI 沟通后) → "可以部署"
#   如果不算紧急/有不确定 → 先不开 deploy-swap, 让老板实测 dev 阶段

# Step 4: 真实 atomic 部署
bash deploy-swap.sh
#   - 自动 md5sum backup 到 /data/wpp-deploy-<TS>/
#   - cp dist/ 到 /root/.openclaw/extensions/wechatpadpro/
#   - restart gateway
#   - verify plugin load OK

# Step 5: 老板手机实测 inbound + outbound
#   - 发 DM 给插件 (webchat 或 wecom)
#   - 看主号手机是否真收到 AI 回复
#   - 看日志: journalctl --user -u openclaw-gateway -f | grep "WPP v1.3.18"
```

### 参考报告

- `/root/audit-reports/2026-08/wechatpadpro-openclaw/independent-audit-v1.3.17-2026-08-10.md` — v1.3.17 独立审计
- `/root/audit-reports/2026-08/wechatpadpro-openclaw/v1.3.18-fix-p2p3-misc-2026-08-10.md` — P2/P3 收口报告 (本次)
- `/root/audit-reports/2026-08/wechatpadpro-openclaw/v1.3.18-full-fix-2026-08-10.md` — 完整修复综合报告 (本批次)
