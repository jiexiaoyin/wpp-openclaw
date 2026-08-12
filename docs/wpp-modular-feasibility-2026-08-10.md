# WPP 插件模块化重构可行性报告 (按 swagger API 分组)

- **日期**: 2026-08-10
- **版本**: v1.3.17 (openclaw 修复已并入, 643/643 测试, 1 项 flaky)
- **目标**: 插件代码模块化, 对齐 swagger API 分组, 快速查找接口文件 + 快速扩展/修复
- **结论**: **可行, 且 API 调用层已完成 ~85%**。建议只做**收口层重构** (低成本 1-2 天), 不做**业务层按 tag 强分** (高成本高风险, 架构上不成立)。

---

## 一、现状盘点 (基于实际代码证据)

### 1. send/ 层已 100% 按 swagger tag 分文件 ✅

swagger 21 个 tag (Login/Msg/Group/Friend/User/Finder/FriendCircle/Search/Wxapp/OfficialAccounts/Tools/TenPay/Favor/Label/Voice/QWContact/SayHello/Translate/Customized/Webhook) → `src/send/` 恰好 21 个文件 + index.ts barrel:

```
src/send/
  login.ts          msg.ts           group.ts       friend.ts
  user.ts           finder.ts        friendcircle.ts search.ts
  wxapp.ts          officialaccounts.ts tools.ts     tenpay.ts
  favorites.ts      label.ts         voice.ts       qwcontact.ts
  sayhello.ts       translate.ts     customized.ts  webhook.ts
  index.ts (makeWppSend 聚合 21 tag) + factory.ts (ctx)
```

- `makeWppMsg` 覆盖 swagger Msg 全部 18 端点 (SendTxt/ShareLink/SendVoice/SendVideo/UploadImg/... 逐一核对)
- `src/send/index.ts` 的 `WPP_VENDOR_ENDPOINTS` 已是静态 236 端点→tag 索引 (tests/api-coverage 校验 100%)

### 2. agent-tools/ 层 ~85% 按 tag 分文件

14 个 `<tag>-meta.ts` (login/msg/group/friend/user/finder/friendcircle/search/wxapp/officialaccounts/tools/tenpay/webhook) + `misc-meta.ts` **把 7 个小 tag 合并** (favorites/label/voice/sayhello/translate/customized/qwcontact)。

### 3. 核心缺口: `src/api-client.ts` 双实现未对齐 ❌

- `src/api-client.ts` (313 行) `WechatpadproApiClient` 是**独立第二套实现**, 单文件不按 tag 拆, 被 `outbound.ts` / `ws-client.ts` / `index.ts` 使用
- 与 `send/msg.ts` **重叠 8 个 Msg 端点** (SendTxt/SendVoice/SendVideo/ShareLink/Revoke/Sync/StartAutoSync/UploadImg)
- 行为分叉 (本报告 2026-08-10 审阅 P1-核心/B1 已记录): 文本 chunk / 图片下载 / 视频缩略图 / persist 判 Code 时机各不同

### 4. 业务逻辑是 cross-cutting, 不可按 tag 切分 ⚠️

以 Msg 为例, 一条消息从收到到回复横跨 6 层:
```
/Msg/SendTxt
  ├─ src/api-client.ts (outbound 发送路径)
  ├─ src/send/msg.ts (makeWppMsg 工具路径)
  ├─ src/send/quote-reply.ts (引用回复)
  ├─ src/dispatch/agent-tools/msg-meta.ts (AI 工具)
  ├─ src/dispatch/dispatcher.ts (上下文/触发)
  └─ src/inbound/handler.ts (接收/入库)
```
消息**接收→解析→媒体→触发→回复**是天然跨 tag 管线。把 dispatcher/inbound/storage 强按 tag 重排, 会: 重复管线代码、破坏 643 测试、修复时反而更难定位。

---

## 二、可行性判断

| 方案 | 内容 | 工作量 | 风险 | 是否建议 |
|---|---|---|---|---|
| **A. 收口层重构** | 合并 api-client.ts 双实现 → 统一到 send/<tag>.ts; 拆 misc-meta; 加 endpoint→file 索引 | **1-2 天** | 低 (API 调用层改动, 行为先对齐再收口) | ✅ **推荐** |
| **B. 业务层按 tag 强分** | dispatcher/handler/inbound/storage 按 swagger tag 重组目录 | 5-10 天 | **高** (破坏 cross-cutting 管线 + 643 测试 + 已修 P1 回归) | ❌ 不推荐 |
| **C. 只加索引不改结构** | 生成 236 endpoint→文件查找表 + 文档 | 2-4 小时 | 极低 | ✅ 兜底 (无论如何都值得做) |

### 为什么 A 可行且价值最高

1. **send/ 已对齐** — 只需把 api-client.ts 收敛进来, 消灭"同一端点两处实现"
2. **查找即达**: 收口后 `/Msg/SendTxt` → `src/send/msg.ts` 1:1 定位; agent-tools 同理
3. **扩展即达**: 加新端点 = `send/<tag>.ts` 加一个 dispatch + `<tag>-meta.ts` 加一条 meta (2 处)
4. **与 openclaw 修复兼容**: v1.3.18 已修 (safeFetchWithCap / direction:"any" / persist 判 Code) 都在 send/ 与 mysql.ts 层, 收口时不碰这些

### 为什么 B 不成立

消息插件本质是**管线式**不是**表驱动式**。swagger tag 是 vendor API 的**出站接口分类**, 而插件业务是**入站事件处理**。两者是正交维度:
- 一个入站图片消息 (Msg tag) 需要 storage (落库) + media-enrich (下载) + dispatcher (触发) + outbound (回复)
- 把它塞进 "Msg/ 文件夹" 会迫使所有层互相 import, 比现状更乱

---

## 三、目标结构 (方案 A)

```
src/
  api/                    # swagger 契约层 (已存在, client.ts 统一 HTTP)
  send/                   # ① 唯一 API 调用层 (已 90%, 收口 api-client.ts)
    <21 tag>.ts           #    每文件 = 一个 swagger tag 的全部端点
    index.ts              #    makeWppSend 聚合 + WPP_VENDOR_ENDPOINTS 索引
  dispatch/
    agent-tools/          # ② AI 工具层 (已 85%, 拆 misc-meta → 7 小 tag)
      <tag>-meta.ts
      send-message.ts     # 统一发送入口 (v1.3.17)
    dispatcher.ts         # ③ 业务编排 (保持功能组织, 不按 tag)
    outbound.ts           #    媒体解析纯函数 (base64/缩略图/chunk)
  inbound/                # ④ 接收/解析/媒体 enrich (保持功能组织)
  storage/                # ⑤ 持久化 (保持功能组织)
  docs/
    ENDPOINT-INDEX.md     # ⑥ 236 endpoint → 文件 自动生成索引 (核心查找工具)
```

**三层职责边界** (解决"快速查找/扩展/修复"的根源):
| 层 | 找什么 | 改哪里 |
|---|---|---|
| 出站调用 | "某 endpoint 发什么" | `send/<tag>.ts` + `agent-tools/<tag>-meta.ts` |
| 入站处理 | "收到消息怎么解析" | `inbound/parser*` + `media-enrich.ts` |
| 业务编排 | "触发/上下文/回复怎么走" | `dispatcher.ts` + `handler.ts` |

---

## 四、方案 A 具体步骤 (若执行)

### Step 1: endpoint 索引生成 (2-4h, 最高性价比, 先做)
- 脚本读 `/tmp/juhe-openapi.json` (或 vendor swagger) → 生成 `docs/ENDPOINT-INDEX.md`:
  `/Msg/SendTxt → send/msg.ts + agent-tools/msg-meta.ts + (若入站) inbound/handler.ts`
- 同步到 `WPP_VENDOR_ENDPOINTS` 校验 (防 endpoint 漏注册)

### Step 2: 双实现收口 (1-2 天)
- 把 `api-client.ts` 里 `sendText/sendImage/sendVoice/sendVideo/sendFileViaApp/revokeMsg/shareLocation` 的**行为差异**先对齐到 send/msg.ts (文本 chunk / 图片下载 / 视频缩略图 / persist 判 Code 时机)
- `api-client.ts` 降级为**薄 adapter**: 转发到 `send/<tag>.ts`, 保留 `WppApiClient` interface (outbound/ws-client/index 调用方零改动)
- 或更彻底: outbound.ts 直接用 `makeWppSend(registry ctx)`, 删 api-client.ts

### Step 3: misc-meta 拆分 (0.5-1h)
- 7 个小 tag 各建独立 `-meta.ts` (favorites/label/voice/sayhello/translate/customized/qwcontact), 对齐 swagger tag 数 = 21

### Step 4: 回归验证
- 643 测试全绿 + tsc 0 错 + deploy dry-run + 真机抽测 (发图/引用/文件各一次)

---

## 五、风险与注意

1. **双实现合并是唯一高风险点** — outbound/ws-client/index 都依赖 api-client.ts, 行为对齐后再收口, 避免"重构顺手改行为"
2. **保 openclaw v1.3.18 修复不回归** — safeFetchWithCap (SSRF/50MB cap) / direction:"any" (引用 bot 回复) / persist 判 Code (假记录) 是刚修的, 收口时不得覆盖
3. **1 项 flaky 测试**: `tests/inbound-media-enrich-v1.test.ts` 的 B-4 图片 HTTP 500 用例全量跑偶发失败 (单跑 10/10 过, 复跑 643/643 过) — 建议重构前先稳定它 (mock 竞态)
4. **不要为了"完整性"重排 inbound/dispatcher** — 那会让 643 测试大改 + 已修 P1 回归风险, 而查找收益已由索引解决

---

## 六、收益预估

| 场景 | 现状 | 方案 A 后 |
|---|---|---|
| 找 `/Msg/SendTxt` 实现 | 需 grep 4-5 文件 (api-client + send/msg + outbound + agent-tools) | 1 个索引查 → `send/msg.ts` + `msg-meta.ts` |
| 加新端点 | 需判断走哪套实现 + 2 处同步 | `send/<tag>.ts` + `<tag>-meta.ts` 固定 2 处 |
| 修发送 bug | 可能只改一处, 另一套实现还错 | 单实现, 改一处全生效 |
| AI/人快速上手 | 学习两套实现 + 跨层耦合 | 三层边界文档 + 索引即达 |

---

## 七、结论

**可行。** 最佳路径:
1. **先做 Step 1 (endpoint 索引)** — 2-4 小时, 零风险, 立即可用, 解决"快速查找"
2. **再做 Step 2 (双实现收口)** — 1-2 天, 中等风险, 解决"快速扩展/修复"根源 (消灭同一端点两处实现)
3. **Step 3 (misc-meta 拆分)** 顺带做; **Step 4 回归** 必做
4. **不做方案 B** (业务层按 tag 强分) — 架构上不成立, 成本高收益负

总工作量: **~1.5-2.5 天**, 风险集中在双实现合并一处, 其余为增量改动。
