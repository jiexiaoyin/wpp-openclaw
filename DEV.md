# Development Guide (DEV.md)

WeChatPadPro OpenClaw Plugin v1.1.15 二次开发指南 (架构 / 调试 / 测试 / 添加功能).

## 1. 架构总览

### 1.1 Phase G 后的多账号架构 (v1.0+)

> v1.1.15~v1.1.15 增量: setup wizard / E2E test / S3 SDK / AI dispatcher / 特殊消息 / 多算法验签 / migrate

```
OpenClaw Gateway
    ↓ plugin.register(api)
    ↓ api.registerChannel({ plugin: wppChannelPlugin })
    ↓
wppChannelPlugin (v1.1.15)
├── config:    6 helpers (listAccountIds/resolveAccount/...)  [G6]
├── meta:      UI display info                                 [G7]
├── capabilities: feature flags                                [G7]
├── gateway:   startAccount/stopAccount                        [G7]
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
└── scoped logger: [WPP:<accountId>] prefix
```

### 1.2 关键设计约束
- **1 accountId = 1 AccountContext** (Registry 保证)
- **多实例隔离**: 测试可 `new AccountRegistry()` 不污染 default
- **DB 共享**: 所有账号共用 1 个 MariaDB pool (`setBackend` 同 cfg 幂等)
- **凭证隔离**: tokenKey/authcode/webhookSecret 走 env var, 不进 config.json / accounts/<id>.json / DB

## 2. 目录结构 (src/)

```
src/
├── index.ts                  # plugin 入口 (default = plugin, named = wppChannelPlugin)
├── config.ts                 # 全局配置加载 (config.json)
├── config-helpers.ts         # 6 OpenClaw channel config helpers [G6]
├── account-state.ts          # 默认 registry 入口 (2 函数)
├── accounts/                 # Phase G 多账号 class
│   ├── account-context.ts    # 单账号隔离 [G1]
│   └── account-registry.ts   # 多账号 registry [G2 + v1.1.15 P2-1]
├── api/                      # vendor HTTP client (236 paths)
├── core/                     # logger, env, paths, constants, signature
├── db.ts / storage/db/       # MariaDB adapter
├── dispatch/                 # OpenClaw 集成
│   ├── outbound.ts           # 主 outbound (sendText/Image/Voice/Video/App/Revoke)
│   ├── handler-action.ts     # OpenClaw action handler
│   ├── pending-reply.ts      # AI 发消息 newMsgId 跟踪 (Map keyed by accountId|sessionKey)
│   ├── reply-helpers.ts
│   ├── resolve-local-media.ts
│   └── agent-tools/          # 162 agent tools (14 dedicated + 1 misc)
├── inbound/                  # 接收 pipeline
│   ├── parser/               # wxid/mention/quote/content/payload/index
│   ├── triggers.ts           # 4-way trigger
│   ├── debouncer.ts          # 1.5s 合并 + VOICE bypass
│   ├── relay.ts              # 接龙 XML 解析 (字面 \n 修复)
│   ├── enrich.ts             # DB 写入
│   └── handler.ts
├── monitor/                  # webhook + ws-client + metrics
├── send/                     # 21 tag 236 send 函数
├── storage/                  # DB adapter pattern
├── webhook-receiver.ts       # HTTP webhook 接收 (含 P1-1 signature 验签)
└── ws-client.ts              # WS 客户端
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
// 模拟 register
plugin.register({
  registerChannel: (arg) => console.log('registerChannel called:', arg.plugin.id),
});
"
```

### 3.4 查看 mock 配置
```bash
# accounts/default.json
cat accounts/default.json | jq .

# 全局 config.json
cat config.json | jq .

# 当前 prod 部署 (如果有)
ls /root/.openclaw/extensions/wechatpadpro/
```

## 4. 添加新功能 (典型流程)

### 4.1 添加 1 个新 vendor endpoint
**前置**: vendor swagger.json 已有这 path

```typescript
// src/api/client.ts 或 src/send/<tag>/<func>.ts
// 1. 在 WechatpadproApiClient 加方法
async myNewEndpoint(param: string): Promise<WppApiResponse<MyData>> {
  return this.call("/New/MyEndpoint", { param });
}

// 2. 加 wrapper 函数 (src/send/<tag>/)
export async function myNewFunc(accountId: string, param: string) {
  const ctx = getDefaultAccountRegistry().get(accountId);
  if (!ctx) return { ok: false, error: `account not found: ${accountId}` };
  const r = await ctx.apiClient.myNewEndpoint(param);
  return persistAndReturn(ctx, "mynew", param, ..., inferPeerKind(param), r);
}

// 3. 加 test
test("myNewFunc — 成功路径", async () => { ... });
test("myNewFunc — 未知账号", async () => { ... });

// 4. (可选) 加 agent tool
// src/dispatch/agent-tools/<tag>-meta.ts 加 myNewFuncSchema + handler
```

### 4.2 添加 1 个新 agent tool (AI-callable)

```typescript
// src/dispatch/agent-tools/<tag>-meta.ts
import { Type } from "typebox";
import { myNewFunc } from "../../send/<tag>/<func>.js";

export const myNewTool = {
  name: "myNewFunc",
  description: "Call vendor's /New/MyEndpoint",
  parameters: Type.Object({
    accountId: Type.String(),
    param: Type.String(),
  }),
  handler: async (args: { accountId: string; param: string }) => {
    return await myNewFunc(args.accountId, args.param);
  },
};
```

工具会被自动注册到 AGENT_TOOLS_META (在 src/dispatch/agent-tools/index.ts).

### 4.3 添加 1 个新账号 (B 方案)

```bash
# 1. 建 accounts/<id>.json
cat > accounts/<id>.json <<EOF
{
  "enabled": true,
  "tokenKeyEnv": "WECHATPRO_<ID>_TOKEN_KEY",
  "authcodeEnv": "WECHATPRO_<ID>_AUTHCODE",
  ... 其它字段从 accounts/default.json 复制
}
EOF

# 2. 加 env vars 到 /root/.openclaw/gateway.systemd.env
echo "WECHATPRO_<ID>_TOKEN_KEY=xxx" >> /root/.openclaw/gateway.systemd.env
echo "WECHATPRO_<ID>_AUTHCODE=xxx" >> /root/.openclaw/gateway.systemd.env

# 3. 重启 gateway
systemctl --user restart openclaw-gateway

# 4. 验证 (AccountRegistry 自动发现)
journalctl --user -u openclaw-gateway -n 20 | grep "loaded account config: <id>"
```

## 5. 测试规范

### 5.1 测试框架
- `node:test` + `node:assert/strict` (无外部依赖, 0 mock library)
- `tsx --test tests/*.test.ts` 跑全部
- `tests/_helpers/` 暂未建立 (G2-3 用了 inline 简化, 可后续抽)

### 5.2 测试覆盖要求
- **新功能**: ≥ 5 case (正常 + 边界 + 错误 + 多账号隔离)
- **Bug fix**: 1 个回归 test (防止再次出现)
- **Refactor**: 保持现有测试全绿, 不删 (除非该测试是 refactor 前的产物)

### 5.3 多账号隔离测试模板
```typescript
test("X — 2 个实例完全隔离", async () => {
  const reg = new AccountRegistry();  // 独立实例
  const ctxA = await reg.start("alice", makeCfg());
  const ctxB = await reg.start("bob", makeCfg());
  // 字段独立
  assert.notEqual(ctxA.apiClient, ctxB.apiClient);
  // state 独立
  ctxA.setVendorAuth("wxid_A", "auth-A");
  assert.equal(ctxB.vendorAuthed, false);
});
```

### 5.4 跑测试 + 类型检查
```bash
npm run check   # tsc --noEmit
npm test        # 207 tests
```

## 6. 提交前 checklist (PR review)

- [ ] `npm run check` 0 错
- [ ] `npm test` 全绿
- [ ] `bash deploy.sh` 退出 0
- [ ] 新功能有 ≥ 5 case
- [ ] 敏感字段不进 log / toJSON / DB (tokenKey/authcode/webhookSecret)
- [ ] 不用 `: any` (除非 `eslint-disable` + JSDoc 解释)
- [ ] 不用 `console.log` (用 logger)
- [ ] 不用静默 `catch {}` (用 logger.warn/error 或 throw)
- [ ] `accountId` 不漏写 (多账号安全)
- [ ] 备份改动到 `/data`

## 7. 调试 vendor API 集成

```bash
# 1. 直接 curl vendor
curl -X POST https://wx.juhe.chat/api/Msg/SendTxt \
  -H "X-TokenKey: $WECHATPRO_TOKEN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"toWxid": "wxid_xxx", "content": "test"}'

# 2. 通过 wpp 调 (模拟 OpenClaw sendText)
node --input-type=module -e "
import { wppChannelPlugin } from './dist/index.js';
import { getDefaultAccountRegistry } from './dist/account-state.js';
const reg = getDefaultAccountRegistry();
const cfg = { enabled: true, tokenKey: process.env.WECHATPRO_TOKEN_KEY, ... };
await reg.start('debug', cfg);
const r = await wppChannelPlugin.sendText('debug', 'wxid_xxx', 'test');
console.log(JSON.stringify(r, null, 2));
"
```

## 8. 老板的 OpenClaw 上下文 (历史教训)

- **本项目 v1.4.4** 在 `/root/dev/本项目/` 是参考架构
- 另: dist 在 `/root/.openclaw/extensions/other/dist/index.js` v3 channel 完整范式
- OpenClaw v2026.7.1+ 文档不公开; 内部 doc 描述实现
- v3 API 必填: `plugin` manifest (default) + `register(api)` + `wppChannelPlugin.config` 6 helpers + `meta` + `capabilities` + `gateway`


## 5. Setup Wizard (v1.1.15+ 4 子命令)

```bash
npm run setup                  # 交互式菜单
npm run setup list              # 列账号 + env 状态
npm run setup add alice         # 交互式加账号
npm run setup validate default  # 11 项检查
npm run setup remove alice     # 删账号
npm run setup migrate config.json  # v1.1.15: v0.1.0 → v1.1 迁 (B 方案)
```

设计: 0 依赖 (node:readline), accountId 安全 (path traversal sanitize), 凭证隔离 (env var)。

## 6. S3 媒体存储 (v1.1.15~6)

```typescript
import { createMediaStorage } from "./src/storage/media.js";
const storage = createMediaStorage({
  kind: "composite",
  composite: {
    primaryKind: "passthrough",
    cdnBase: "https://wx.juhe.chat/cdn",
    s3: { endpoint: "https://oss-cn-hangzhou.aliyuncs.com", region: "cn-hangzhou",
           bucket: "my-bucket", accessKeyId: "...", secretAccessKey: "..." },
  },
});
await storage.put("img/abc.jpg", buffer, "image/jpeg");
const url = await storage.sign("img/abc.jpg", 3600);  // presigned URL
```

兼容 AWS S3 / MinIO / AliOSS / TXOSS / Cloudflare R2 (@aws-sdk/client-s3 真集成)。

## 7. AI Dispatcher (v1.1.15)

```typescript
import { dispatchInboundToOpenClaw, setChannelRuntime } from "./src/dispatch/dispatcher.js";
setChannelRuntime(openClawRuntime);  // gateway 启动时调
await dispatchInboundToOpenClaw(msg);  // NOOP if not set
```

调 `runtime.session.recordInboundSession` + `runtime.reply.dispatchReplyWithBufferedBlockDispatcher`, `onReply` 调 `sendText`。

## 8. v1.1.15 setup migrate (v0.1.0 → v1.1)

```typescript
import { migrateFromV0Config } from "./src/setup-wizard.js";
const r = migrateFromV0Config("./config.json", "default");
// r.tokenKeyEnv = "WECHATPRO_DEFAULT_TOKEN_KEY"
// r.newFile = "./accounts/default.json"
// r.oldFile = "./config.json.migrate-backup.<ts>"
```

老 inline `config.json.account.*` 字段转换到 B 方案 `accounts/<id>.json` (tokenKey/authcode 清空, 走 env)。
