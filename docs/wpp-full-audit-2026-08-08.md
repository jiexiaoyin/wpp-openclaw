# WeChatPadPro OpenClaw 插件 — 完整多维度审阅报告

| 项 | 值 |
|---|---|
| 审阅对象 | `/root/dev/wechatpadpro-openclaw` (dev) + `/root/.openclaw/extensions/wechatpadpro` (deploy) |
| 版本 | v1.1.16 (package.json / openclaw.plugin.json / `src/core/constants.ts:6` 三处一致) |
| 代码量 | src 93 文件 9860 行;tests 29 文件 5424 行 / 342 个 test case |
| 契约基线 | vendor swagger 2.0,`http://127.0.0.1:8062/swagger.json`,236 paths,165 definitions |
| 对比基线 | gewe-openclaw v3.1.6 (61 文件 9157 行,生产运行 2 个月) |
| 审阅日期 | 2026-08-08 |
| 触发原因 | 2026-08-08 16:00 P0 事故 — 机器人对老板主号所有微信联系人(25+)自动回复 |
| 方法 | 5 个并行只读审计 agent(契约 / 门禁 / 迁移 / 健壮性 / 测试运维)+ 审阅者逐条 grep 复核 |

---

## 阅读说明(给复核方)

本报告每条结论标注了证据等级,请优先复核 **[已验证]** 条目:

- **[已验证]** = 报告作者亲自执行 grep / node / curl 复核过,附命令与输出位置
- **[待复核]** = 由审计 agent 报告,作者未逐条复核,可能存在误报
- **[待确认]** = 需要外部信息(vendor 行为、云安全组配置)才能定论

历史上本项目族的第三方审阅报告出现过 5 起 false positive(误报不存在的符号、错误的行号、错误的数量统计)。**任何 finding 在动手修之前请先 grep 验证。**

---

## 零、执行摘要

| 维度 | 结论 |
|---|---|
| swagger 端点覆盖 | ✅ **236/236 = 100%**,0 缺失,0 幽灵路径 |
| swagger path 拼写 / HTTP method | ✅ **0 错配**(含 `/Finder/Findergettopiclist`、`/Tools/setproxy` 等怪名字全对) |
| swagger body 字段名 | ❌ **143/220 (65%) 名字对不上**,vendor 静默返 Code=0 |
| 入站门禁 | ❌ 4 处 fail-open,其中 2 处至今未修 |
| 消息去重 | ❌ 去重代码已写但**零调用**,DB 无 UNIQUE 约束 |
| HTTP 客户端 | ❌ 两套并存,live 的那套丢大整数精度 |
| webhook 鉴权 | ❌ 无签名验证 + `0.0.0.0:4398` 全网卡监听 |
| TypeScript | ✅ `tsc --noEmit` 0 错 |
| 测试 | ⚠️ 342 case,但门禁/去重/api-client/ws-client 关键路径零覆盖或假绿 |
| gewe 迁移 | ⚠️ 可行,但需先补 6 项 P0 能力,估算 25-35 人日 |

---

## 一、P0 事故根因分析

### 1.1 事故链(4 缺陷叠加)

**① DM 默认 fail-open** — `src/inbound/triggers.ts:64-70` **[已验证]**

```ts
if (msg.peerKind === "direct") {
  const allow = ctx.allowFrom ?? [];
  if (allow.length > 0 && !allow.includes(msg.fromWxid)) {
    return { triggered: false, via: "blocked" };
  }
  return { triggered: true, via: "at" };   // ← allowFrom 为空 = 放行所有私聊
}
```

`allowFrom.length === 0` 时无条件放行。产生空 `allowFrom` 的路径:
- `accounts/alice.json` 默认模板 `"allowFrom": []`
- `src/setup-wizard.ts:188` `allowFrom: input.allowFrom` — 无默认值、无校验
- `src/setup-wizard.ts:347` `allowFrom: acc.allowFrom ?? []` — v0 迁移 fallback 空
- 部署态 `accounts/accounts/default.json` 也是 `"allowFrom": []`

**② agentId 硬编码 `main`** — journal 实证 **[已验证]**

```
Aug 08 15:45:37 INFO [WPP v1.1.15] dispatch: account=default
  session=agent:main:wechatpadpro:default:direct:gh_359f94e32fb7 trigger=at
Aug 08 15:45:47 ... session=agent:main:wechatpadpro:default:direct:weixin trigger=at
Aug 08 15:57:06 ... session=agent:main:wechatpadpro:default:direct:wxid_i0zxkic7hsgp22 trigger=at
```

所有联系人被路由到同一个 `main` agent。

**③ `requireAtMention` 是空 if,完全 no-op** — `src/inbound/triggers.ts:75-78` **[已验证]**

```ts
// requireAtMention 必走 @ 检测 (即使其他 trigger enabled, 没 @ 也不走)
if (cfg.requireAtMention && !botMentioned) {
  // 仍可被 msgType / quoteBot 通过 — msgType/quoteBot 模式
}
```

if 块内 0 行代码,无 return / throw / 赋值。注释描述的行为与代码完全不符。

**④ `groupPolicy` 在 live 路径里从未被读取** — **[已验证]**

```bash
$ grep -rn "groupPolicy" src/inbound/ src/dispatch/
src/inbound/index.ts:67:    const policy = state.config.groupPolicy;
```

唯一读点在 `src/inbound/index.ts:41` 的 `handleWebhookPayload()` 内。而该函数**是死代码**:

```bash
$ grep -rn "handleWebhookPayload" src/
# 仅 inbound/index.ts 自身定义 + src/index.ts 两条注释,0 个 runtime 调用点
```

**真实 live 路径**(已逐跳验证):
```
src/index.ts:102  createWppInboundHandler({...})
  → src/inbound/handler.ts:85  shouldTrigger(m, opts.triggerConfig, ctxForTrigger)
  → src/dispatch/dispatcher.ts:129  dispatchInboundToOpenClaw(msg, ...)
```

### 1.2 修复状态

| 缺陷 | 状态 | 证据 |
|---|---|---|
| ① DM fail-open | ✅ v1.1.16 已修并部署 | `deploy/dist/inbound/triggers.js:19` 含 allowFrom 检查,mtime 16:31 |
| ② agentId main | ✅ v1.1.16 已修 | `src/index.ts:72-74` 启动强制校验 `cfg.agent` 并 throw |
| ③ requireAtMention no-op | ❌ **未修** | `src/inbound/triggers.ts:75-78` 空 if 仍在 |
| ④ groupPolicy 不生效 | ❌ **未修** | 同上 grep 结果 |

### 1.3 `groupPolicy: "closed"` 是假的安全感 **[已验证]**

部署态 `accounts/default.json` 紧急加固时写入 `"groupPolicy": "closed"`,存在三重问题:

1. **非法枚举值** — `src/types.ts:30` 定义 `groupPolicy: "open" | "disabled" | "allowlist"`,不含 `"closed"`;`src/setup-wizard.ts:132-137` 的 `validPolicies` 也不含。运行时无校验,silent accept。
2. **即使写成合法的 `"disabled"` 也无效** — live 路径不读该字段(见 ④)。
3. **当前群聊没炸是靠运气** — `defaultTriggerConfig()` 里 keyword / msgType / quoteBot 三个触发器恰好都 `enabled: false`,群消息走到 `triggers.ts` 末尾 `return { triggered: false }`。

**风险**:一旦启用 `msgTypeTrigger.enabled: true`(例如接龙 53),群消息立即绕过 `requireAtMention`(缺陷③)和 `groupPolicy`(缺陷④)**两道锁**,重演污染。

### 1.4 其余未修的放行口

**无自回环过滤** **[已验证]**
```bash
$ grep -rn "selfWxid\|botWxid" src/inbound/handler.ts src/inbound/triggers.ts
# 仅 botWxid 用于 @mention 检测,无 fromWxid === selfWxid 判断
```
bot 自己发的消息若被 vendor 回推,DM 路径直接 `triggered: true` → 自问自答循环。目前不炸依赖 vendor 不回推 self 消息,属于外部依赖而非自身防御。

**红包消息照样 dispatch** — `src/inbound/handler.ts:75-77` **[已验证]**
```ts
if (isRedPacketMessage(m)) {
  processRedPacket(m);   // 只 log,不 return,继续往下走 dispatch
}
```

**`selfWxid` 格式与 @ 检测 regex 不匹配** **[已验证]**

配置 `"selfWxid": "q139198824"`(微信号,非 `wxid_` 格式),而 `src/inbound/parser/mention.ts:7-16` 的 4 条 regex **全部硬要求 `wxid_[a-zA-Z0-9]+`**。后果双向:
- **漏判**:群里以 `<atuserlist><username>q139198824</username>` 形式 @ 机器人时,`extractAtUserList` 永远不返回该值
- **误判**:`mention.ts:49-50` 的 `content.includes('@' + botWxid)` / `content.includes(' ' + botWxid)` 是裸字符串匹配,任意文本(URL、他人昵称、引用内容)含 `q139198824` 子串即判定被 @

### 1.5 当前运行状态 **[已验证]**

```
/root/.openclaw/openclaw.json:
  channels.wechatpadpro.enabled          = true      ← 仍在运行
  plugins.entries.wechatpadpro.enabled   = true

journal (16:36):  仍在接收 business callback 并写库
                  [wechatpadpro] [default] auto-restart attempt 7/10 in 300s
                  [wechatpadpro] [default] channel exited without an error
```

而 `accounts/default.json` 内注释写着 `"plugin disabled in openclaw.json 等待 code-level 白名单修复"` — **与实际配置不符**。

崩溃循环根因(journal 15:45 实证):
```
WARN dispatch: dispatchReply failed:
  TypeError: Cannot read properties of undefined (reading 'SupplementalContext')
  at dispatchInboundToOpenClaw (dist/dispatch/dispatcher.js:84:29)
```

---

## 二、Swagger 契约核对

### 2.1 覆盖率:100% **[已验证]**

```bash
$ curl -s http://127.0.0.1:8062/swagger.json -o /tmp/wpp-swagger.json
$ grep -rhoE '"/[A-Za-z][A-Za-z0-9/_-]*"' src/ | tr -d '"' | sort -u > /tmp/wpp-impl-paths.txt
# 比对结果:
SPEC: 236  IMPL-matched: 236  coverage: 100.0%
MISSING (swagger 有 src 无): 0
GHOST  (src 有 swagger 无): 2  → /wechatpadpro/webhook, /ws/sync (本地路径,非 vendor 端点)
```

**path 拼写 / 大小写**:236/236 逐字符正确,含 `/Finder/Findergettopiclist`、`/Wxapp/Wxapp/QrcodeAuthLogin`、`/QWContact/QWContact/QWAddContact`、`/Tools/setproxy`(小写 s)等易错项。

**HTTP method**:swagger 10 个 GET-only 端点 vs 代码 10 个 `getWppJson` 调用点,path 集合完全一致,0 错配。

### 2.2 body 字段名:143/220 (65%) 不匹配 **[部分已验证 / 总数待复核]**

vendor 是 Go + swaggo,`json.Unmarshal` **字段名大小写不敏感**,因此审计将差异分两类:

- **A 类 truly-wrong**:名字真的不同(如 `chatroomId` vs `QID`)→ **100% 静默失效**
- **B 类 case-only**:仅大小写(如 `toWxid` vs `ToWxid`)→ Go 下可工作,不合规

以下 P0/P1 只列 A 类。

#### P0-A `/Msg/SendTxt` 群 @ 从未生效 **[已验证]**

```
swagger  Msg.SendNewMsgParamDoc = { At: string, Content: string, ToWxid: string, Type: integer }
         body description 原文:"Type请填写1  At == 群@,多个wxid请用,隔开"

代码     src/api-client.ts:160   this.call("/Msg/SendTxt", { toWxid, content: text, ats: ats ?? [] })
         src/send/msg.ts:121     dispatch("/Msg/SendTxt", { toWxid, content, ats: ats ?? [] })
```

三处错:
1. `ats` ≠ `At`(**多一个 s**,非大小写差)→ Go 匹配不上,@ 列表整体丢弃
2. `At` 要求**逗号分隔字符串**,代码传 `string[]`
3. `Type` 从不传 → Go 零值 0,swagger 要求 1

这是唯一的生产回复路径(`dispatch/outbound.ts:59 sendText` → `state.apiClient.sendText`)。文本能发出(`content`/`toWxid` 靠大小写不敏感兜住),**群 @ 从未生效,且 Code 仍为 0 无任何报错**。

#### P0-B `/Msg/SendApp` 用错端点 —— 它是「群发消息」 **[已验证]**

```bash
$ node -e "s=require('/tmp/wpp-swagger.json'); console.log(s.paths['/Msg/SendApp'].post.summary)"
群发消息
$ ... schema → #/definitions/Msg.SendGroupMassMsgTextParamDoc = { Content, ToIds[] }
$ ... s.paths['/Msg/ShareLink'].post.summary → 发送分享链接消息
```

代码把 `/Msg/SendApp` 当「发 XML 应用消息」使用,4 个调用点全错:
- `src/api-client.ts:178`、`src/send/msg.ts:63`、`src/send/msg.ts:110`、`src/send/msg.ts:117`
- 上层可达:`src/dispatch/handler-action.ts:44-50` case `"sendApp"` → `outbound.ts:131`
- AI 工具可达:`agent-tools/msg-meta.ts:23` `sendAppMessage`

vendor 当前收到 `Content=""` + `ToIds=nil` 的**群发**请求。除功能不生效外,存在误触发广播风险。**建议立即停用该工具路径**。正确端点为 `/Msg/ShareLink`(`{ ToWxid, Type, Xml }`)。

#### P0-C Group tag 19/21 端点字段名错 **[已验证 - 抽样]**

```bash
$ node -e "console.log(JSON.stringify(require('/tmp/wpp-swagger.json').definitions['Group.GetChatRoomParamDoc'].properties))"
{"QID":{"type":"string"}}

$ grep -n "chatroomId" src/send/group.ts | head -4
13:    addMember: (chatroomId: string, wxidList: string[]) =>
14:      dispatch("/Group/AddChatRoomMember", { chatroomId, wxidList: wxidList.join(",") }),
17:    consentToJoin: (chatroomId: string, url: string) =>
18:      dispatch("/Group/ConsentToJoin", { chatroomId, url }),
```

swagger 群相关只有三种 schema:`{QID}`、`{Content, QID}`、`{ChatRoomName, ToWxids}`。代码全线用 `chatroomId` / `wxidList` / `wxid` / `name` / `remark` / `enabled` / `newOwnerWxid` / `operation`。

**佐证非误判**:`src/api-client.ts:199` 作者已把 `getChatroomMemberList` 改为 `{ QID: chatroomId }` 并加注释 "swagger body: Group.GetChatRoomParamDoc [QID]",但**同文件隔 6 行的 `api-client.ts:193 getChatroomInfo` 仍是 `{ chatroomId }`**,`send/group.ts` 21 个端点一个都没改。

#### P0-D Admin 端点会删掉本账号授权码 **[已验证]**

swagger 4 个端点 query 参数是 `key`(管理员密钥,required)而非 `authcode`:
```
POST /Admin/DelayAuthKey   query:[key*]  body:{authcode, days}
POST /Admin/DeleteAuthKey  query:[key*]  body:{authcode}
POST /Admin/GenAuthKey     query:[key*]  body:{count, days, remark}
GET  /User/GetAllOnline    query:[key*]
```

`src/api/client.ts:127-131 withAuthcodeQuery()` 只注入 `authcode=`,全仓 grep `key=` 注入逻辑 0 处,`src/types.ts` 的 `WppAccountConfig` 也没有 adminKey 字段 → **这 4 个端点结构性不可用**。

**叠加风险**:`src/send/admin.ts:18` 传 `{ authKey }`(swagger 要 `authcode` = 待删除的目标授权码),而 `src/api/client.ts:167-170` 无差别往所有 body 塞本账号 `authcode`:
```ts
if (rt.authcode && finalBody["authcode"] === undefined) {
  finalBody["authcode"] = rt.authcode;   // ← 本账号自己的授权码
}
```
实际发出 `{authKey:"目标", authcode:"自己"}`。当前因 `key` 缺失请求先被拒;**一旦有人"顺手修好 key 参数",第一次调用 `deleteAuthKey` 就会删掉本账号授权码**。`DelayAuthKey` 同理。

#### P0-E `/Webhook/Set` 漏传 `enabled` **[已验证]**

```bash
$ node -e "... definitions['webhook.WebhookConfig'].properties"
{"enabled":bool, "includeSelfMessage":bool, "messageTypes":array,
 "retryCount":int, "secret":string, "timeout":int, "url":string}

$ grep -n "Webhook/Set" src/api-client.ts
216:    return this.call("/Webhook/Set", { url, authcode });
```

只传 2 个字段,`enabled` 缺失 → Go bool 零值 `false` → **webhook 设了等于没设**。

**与 `docs/wpp-vendor-push-issue-2026-08-08.md` 记录的推送故障高度相关。改一行即可实测证伪,建议作为第一验证项。**

#### P0-F 媒体发送:vendor 要 Base64,代码传 URL **[待复核]**

| 文件:行 | 端点 | 代码字段 | swagger 字段 |
|---|---|---|---|
| `send/msg.ts:125` | SendVideo | `videoUrl, thumbUrl, videoDuration` | `Base64, ImageBase64, PlayLength, ToWxid` |
| `send/msg.ts:134` | SendVoice | `voiceUrl, duration` | `Base64, ToWxid, Type, VoiceTime` |
| `api-client.ts:170/174` | SendVoice/SendVideo | 同上 | 同上 |
| `send/msg.ts:75` | SendCDNVideo | `videoUrl, thumbUrl` | `Content, ToWxid` |

`/Msg/SendVoice` body description 原文:`"Type: AMR=0, MP3=2, SILK=4, SPEEX=1, WAVE=3  VoiceTime: 音频长度 1000为一秒"` — 代码既不传 `Type` 也不传 `VoiceTime`,`duration` 单位未 ×1000。

#### P1 级契约问题 **[待复核]**

| 编号 | 问题 | 位置 |
|---|---|---|
| P1-1 | Search tag **18/18 全错** — 查询词字段是 `query`,代码传 `keyword` | `send/search.ts:13-66` |
| P1-2 | Finder 14/15、TenPay 7/7、Voice 3/3、Translate 2/2 字段全错 | `send/{finder,tenpay,voice,translate}.ts` |
| P1-3 | Friend/FriendCircle `wxid` vs `toWxid`/`userName`;`remark` vs `remarks`;`firstPageMd5` vs `fristpagemd5`(vendor 自身拼错,代码"修正"反而不匹配) | `send/friend.ts`、`send/friendcircle.ts` |
| P1-6 | Tools 下载类端点是**分片下载协议**(`compressType/dataLen/sectionLen/sectionStart`),代码只传 `{aesKey, fileId}`,分片完全未实现 | `send/tools.ts:14-30` |
| P1-7 | OfficialAccounts 8/12 漏传 `wxid` | `send/officialaccounts.ts` |
| P1-9 | `/Msg/Revoke` 撤回契约不符:`msgId`≠`ClientMsgId`、`toWxid`≠`ToUserName`、`CreateTime` 漏传 → 撤回不可用 | `send/msg.ts:59`、`api-client.ts:182` |
| P1-10 | `/Msg/StartAutoSync` 传 `{intervalMs}`,swagger 是 `{TargetURL}`(告诉 vendor 往哪推)。`api-client.ts:231` 版本正确,`send/msg.ts:200` 版本错误 → **两客户端行为分叉** | `send/msg.ts:200` |

#### agent-tools schema 错位:7 个工具 100% 必崩 **[待复核]**

`src/dispatch/agent-tools/factory.ts:33-39` 按 `schema.properties` 顺序取参传给函数。以下 7 处 schema 声明 `Type.String()`,而目标函数签名是 `string[]` 且函数体首行即 `.join(",")`:

| meta 位置 | tool | 目标函数 |
|---|---|---|
| `group-meta.ts:31/40/49/58` | addChatRoomMember / inviteChatRoomMember / delChatRoomMember / createChatRoom | `group.ts:14/53/26/22` |
| `misc-meta.ts:33/48` | labelAdd / labelUpdateList | `label.ts:14/27` |
| `misc-meta.ts:110` | customizedUniftyAuthBatch | `customized.ts:14` |

AI 传字符串 → `"a,b".join is not a function` → `factory.ts:42` catch → 返回 Error。**162 个 meta entry 中 11 个有问题(7 必崩 + 2 低危 + 2 语义错)。**

### 2.3 契约错配分布表 **[待复核]**

220 个可比对端点(236 - 28 个 body schema 为空 - 未计入项):

| TAG | 核对数 | A 类真错 | B 类仅大小写 | 漏传字段 |
|---|---:|---:|---:|---:|
| Search | 18 | **18** | 0 | 0 |
| Group | 21 | **19** | 4 | 0 |
| Msg | 17 | **16** | 14 | 0 |
| Finder | 15 | **14** | 2 | 0 |
| Wxapp | 20 | **12** | 8 | 7 |
| Tools | 14 | **10** | 2 | 1 |
| Friend | 12 | **9** | 0 | 3 |
| FriendCircle | 11 | **9** | 0 | 1 |
| User | 15 | **8** | 8 | 6 |
| TenPay | 7 | **7** | 0 | 0 |
| OfficialAccounts | 12 | **4** | 0 | 8 |
| Voice / Translate / SayHello / QWContact | 10 | **10** | 2 | 0 |
| Label | 5 | **3** | 4 | 0 |
| Admin / Customized | 4 | **3** | 0 | 0 |
| Favor | 4 | **1** | 2 | 1 |
| Login | 31 | 0 | 0 | 21 |
| Webhook | 4 | 0 | 0 | 3 |
| **合计** | **220** | **143 (65%)** | **46 (21%)** | **51 (23%)** |

---

## 三、其他 P0(与污染事故无关)

### P0-G 三通道重复回复,去重代码写了但零调用 **[已验证]**

```bash
$ grep -rn "SeenTracker\|buildDedupeKey\|incRejectedDedupe" src/ tests/
src/monitor/metrics.ts:52:  incRejectedDedupe: () => incCounter(...)   # 定义
tests/monitor.test.ts:15,16,40,55-80                                    # 仅测试引用
tests/webhook-receiver.test.ts:22,76                                    # 仅测试引用
# src/ 下 0 个 runtime 调用点
```

`src/webhook-receiver.ts:209` 有完整 `SeenTracker`(1000 上限 + 30min TTL)与 `buildDedupeKey`,但 `src/inbound/handler.ts:118-138` 的 `handle()` 入口**无任何 msgId 去重**。

同一条消息可从 3 条路径进入(`src/index.ts:128-198`):
1. webhook `sync_message` → 主动调 `/Msg/Sync` 拉取(`index.ts:168-175`)
2. business callback → 完整消息直接入 handler
3. WS push → 同样触发 `/Msg/Sync`;另有 60s fallback timer(`ws-client.ts:59`)

叠加 **DB 无 UNIQUE 约束**:`db/schema.sql:21-37` 的 `wpp_messages` 只有 `INDEX idx_msg_id` / `idx_new_msg_id`,`src/storage/db/mysql.ts:207-229` 是裸 `INSERT` 无 `ON DUPLICATE KEY`,代码注释自承 "existing schema has no UNIQUE, so we use a simple INSERT for now"。

→ **同一条消息可能被回复多次并重复入库。**

### P0-H 两套 HTTP 客户端并存,live 的那套丢大整数精度 **[已验证]**

```bash
$ grep -n "stringifyLargeInts\|JSON.parse" src/api-client.ts src/api/client.ts
src/api-client.ts:62:        json = JSON.parse(text);      ← 裸解析
src/api-client.ts:107:       json = JSON.parse(text);      ← 裸解析
src/api/client.ts:50:export function stringifyLargeInts(jsonText: string)
src/api/client.ts:64:  const safe = stringifyLargeInts(text);
src/api/client.ts:66:    return JSON.parse(safe);          ← 有精度保护
```

**live 路径用的是没有保护的那套**:`src/accounts/account-context.ts:59` → `new WechatpadproApiClient(...)`(即 `src/api-client.ts`)。

两套差异:

| 维度 | `api-client.ts` (class, **live**) | `api/client.ts` (function) |
|---|---|---|
| HTTP 库 | undici `request` | global `fetch` |
| 重试 | **0 次** | 3 次指数退避 |
| 超时 | headersTimeout 30s / bodyTimeout 60s | `AbortSignal.timeout(30s)` per retry |
| 大整数 | **无保护** | `stringifyLargeInts` |
| 错误语义 | 一律 `Code: -1` | 三态区分 |

影响面:`/Msg/Sync` 返回的 `new_msg_id`(16+ 位)在 `JSON.parse` 时精度丢失 → 后续撤回、消息回查全部找不到。18 个 class method 均受影响。

### P0-I JSON 解析失败被判定为成功 **[待复核]**

`src/api/client.ts:203-213`:
```ts
const obj = parseJsonText(text) as {...} | null;   // 解析失败返回 null
const ok = obj && typeof obj === "object" ? obj : {};
const Code = ok.Code ?? 0;                          // ← null → {} → Code = 0 = 成功
```
`src/api-client.ts:66-69` 同型(`catch { json = { raw: text } }` → `Code: obj.Code ?? (statusCode===200 ? 0 : -1)`)。

vendor 走公网反代(`wx.juhe.chat`),返回 HTML 错误页 / nginx 502 body / 纯文本时,只要 HTTP 2xx 一律判 `Code=0`。`dispatch/outbound.ts:60` 的 `if (r.Code !== 0 && r.Code !== 200)` 判不出来 → **消息标记为发送成功并入库**。

### P0-J webhook 无鉴权 + 端口全网卡暴露 **[已验证]**

```bash
$ ss -tlnp | grep 4398
LISTEN 0 511  0.0.0.0:4398  0.0.0.0:*  users:(("MainThread",pid=2083620,fd=43))

$ iptables -S | wc -l
34        # 全部是 docker 相关;-P INPUT ACCEPT,无 4398 相关规则

$ curl -s -m 5 -o /dev/null -w "%{http_code}" -X POST \
    http://127.0.0.1:4398/wechatpadpro/default/webhook -H 'Content-Type: application/json' -d '{}'
200
```

`src/core/signature.ts:106` `signatureRequired(secret) = !!secret`,而 `accounts/default.json` 的 `webhookSecret` 为空 → **签名验证整体跳过**,`webhook-receiver.ts:142-153` 直接 `await onMessage(payload)`。

**攻击路径**:构造 payload,`FromUserName` 填白名单内 wxid(公开信息),`ToWxid` 填任意目标 → bot 视为真实消息 → AI 生成 → `/Msg/SendTxt` 发给任意人。

**[待确认]** 需核实阿里云安全组是否放行 4398 入方向。若放行,则为可被外部触发的发消息通道。

---

## 四、P1 问题清单 **[待复核]**

| 编号 | 问题 | 位置 |
|---|---|---|
| P1-a | `startAccountById` 幂等 early-return 仍有 race 窗口:`state.wsClient` 在 `await ws.start()` **之后**才 attach,并发调用两条都能通过检查 → 双 WS 连接 + 双 fallback timer + 重复拉取 | `src/index.ts:128-131` vs `:143-144` |
| P1-b | shutdown 不 flush debouncer:`AccountContext.stop()` 拿不到 handler 闭包内的 debouncer 引用 → 停机丢失 buffered 消息 | `src/accounts/account-context.ts:178-199` |
| P1-c | 重连 / backoff `setTimeout` 未 `unref()` → 阻塞进程退出 | `src/index.ts:234`、`src/ws-client.ts:184` |
| P1-d | `S3Storage.put/get` 无超时(仅 `ping()` 有 3s)→ endpoint 挂死时消息队列无限积压 | `src/storage/media.ts:125-152` |
| P1-e | `queryWithTimeout` 把 `ER_STATEMENT_TIMEOUT` 吞成 `return []` → 单行查询被误判为"不存在"(silent killer) | `src/storage/db/mysql.ts:46-52` |
| P1-f | outbound persist 顺序不一致:`sendText` 失败不 persist,`sendImage/Voice/Video/App` 先 persist 后判 Code → 失败时留假记录 | `src/dispatch/outbound.ts:43-84` |
| P1-g | 热重载只同步 3 个字段(`requireAtMention` / `botWxid` / `allowFrom`),**未同步** `keywordTrigger` / `msgTypeTrigger` / `quoteBotTrigger` / `blacklistGroups` / `chatroomDebug` → 热改这些门禁字段静默不生效 | `src/index.ts:527-540` |
| P1-h | `setup-wizard.writeAccountFile` **不写 `agent` 字段**,而 `index.ts:72-74` 启动强制要求 → wizard 新建的账号永远启不来 | `src/setup-wizard.ts:175-198` |
| P1-i | `src/monitor/ws-client.ts` 疑似死代码(live 路径是 `src/ws-client.ts`,`index.ts:31` 导入后者) | — |
| P1-j | deploy-swap.sh **不跑 npm test、不跑 npm install** | `deploy-swap.sh` |
| P1-k | 关键模块零测试覆盖:`api-client.ts`、`ws-client.ts`、`storage/db/connection.ts`、`dispatch/handler-action.ts` | `tests/` |
| P1-l | 假绿测试:`tests/inbound.test.ts:366` `assert.ok(true)`;`tests/channel-meta.test.ts:57/71/122` 断言常量;`tests/media-storage.test.ts:34` ping 假实现恒 true | `tests/` |

---

## 五、P2 问题清单 **[待复核]**

- **部署目录残留** **[已验证]**:`/root/.openclaw/extensions/wechatpadpro/accounts/accounts/` 嵌套目录,内含 `default.json` 且配置为 `allowFrom: []` + `groupPolicy: "open"`(危险配置)。当前**不会被加载**(`config.ts:135` 只读 `*.json`,`"accounts"` 目录名被过滤),但存在未来重构误读风险。
- **旧 build layout 残留**:`deploy/dist/src/` 完整镜像 + `dist/{dispatcher,handler,triggers}.js` 顶层旧文件,均为 v1.1.13 目录重构前残留,永不被 import。
- `config.json.bak.1785936627` 备份留在原路径(项目铁律要求备份统一放 `/data`)。
- `stringifyLargeInts` regex `/("[\w$]+"\s*:\s*)(\d{16,})/` 不覆盖:数组裸元素、嵌套对象、负数。
- `ensureColumn` / `ensureIndex` 直接字符串拼接 SQL(当前 caller 全 hardcode,无外部输入)。`src/storage/db/mysql.ts:72-93`
- ESLint **[已验证]**:`npm run lint`(src + tests)= **7 errors + 30 warnings**。其中 `src/core/logger.ts:60` 的 `console.log` 触发 no-console(建议加块级 eslint-disable)。
  > 注:审计 agent 报告的是 9 errors,与实测 7 不符,以实测为准。
- **文档数字陈旧** **[待复核]**:README 标题仍写 v1.1.15、"216/216 tests, 15 test files, ~3100 LOC";CHANGELOG 最新条目停在 v1.1.15,**无 v1.1.16 记录**(而代码有 13 处 `// v1.1.16 P0-FIX` 注释且已部署)。实测 29 test files / 5424 LOC / 342 case。

---

## 六、与 gewe-openclaw 的对比及迁移评估

### 6.1 能力矩阵 **[待复核 - 数字由 agent grep 得出]**

| 能力 | gewe v3.1.6 | wpp v1.1.16 |
|---|---|---|
| silk 语音转码 + STT | ✅ 116 处引用(silk.ts / stt.ts / transcribe.ts) | ❌ **完全没有** |
| OSS / S3 媒体后端 | ✅ oss.ts / oss-backend.ts / s3-backend.ts | ❌ 仅本地存储,长期会爆盘 |
| CDN 下载 + aes_key/file_id 转发 | ✅ download.ts + 3 个 DB 列 | ❌ 无,**无法转发他人消息** |
| 撤回(msgId+newMsgId+createTime) | ✅ 3 列 + `idx_revoke_target` | ❌ 缺 createTime 列(且契约 P1-9 也错) |
| ReDoS 防护 `isCatastrophicRegex` | ✅ | ❌ **0 处**(gewe 曾实测 hang 119s) |
| 临时文件 mkdtemp + try/finally | ✅ 11 处 | ❌ 0 处 |
| fetch 超时(AbortSignal) | ✅ 7 处 | ⚠️ 2 处 |
| 接龙 title 字面 `\n` 修复 | ✅ 已修 | ⚠️ `relay.ts:32` 已有 replace,但 `parsePlainList` 空输入返回 items=0 |
| **—— wpp 更强 ——** | | |
| 多账号 AccountRegistry | ❌ 单账号 | ✅ 440 行完整实现 |
| 朋友圈 / 红包 / TenPay | ❌ 协议不支持 | ✅ vendor 原生支持 |
| agent-tools 数量 | 47 | **166** |
| WS + webhook 双通道 | ❌ 仅 webhook | ✅ |
| 测试量 | 1593 行 | 5424 行 / 342 case |

### 6.2 协议差异带来的迁移风险

| 项 | gewe | wpp | 风险 |
|---|---|---|---|
| 消息 ID | 3 件套(msgId 18 位 + newMsgId + createTime 秒) | 2 件套(msgId + new_msg_id),**无 createTime** | 撤回逻辑迁过来直接坏 |
| 推送形态 | 单 webhook | webhook + business callback + WS 三通道 | 必须先做去重(见 P0-G) |
| 群 @ 检测 | 有 `pushType=2` 兜底 | 无 pushType 概念,仅靠 XML 解析 | 漏触发风险 |
| DB schema | `messages` 27 列 11 索引 | `wpp_messages` 13 列 4 索引 | 列映射 + ETL |

### 6.3 迁移 blocker 与估算 **[待复核]**

**P0 blocker(迁移前必须补齐)**:silk 语音转码、OSS/S3 后端、CDN 下载 + aes_key/file_id、撤回 3 件套、ReDoS 防护、接龙解析边界。

**分阶段估算**:
- 阶段 1 P0 能力补齐:5-7 人日
- 阶段 2 架构升级(ENV 收口 / fetch 超时 / 去重 / deploy 跑测试):5-7 人日
- 阶段 3 数据 ETL + 双跑验证 + 切换:5-10 人日
- **合计 25-35 人日**

**最大风险不在代码**:vendor MMTLS 长链死亡(参见 `docs/wpp-vendor-push-issue-2026-08-08.md`,已有 4 次误诊记录)。此为协议层问题,迁移后同样存在,监控与应急 SOP 需先行。

---

## 七、建议动作顺序

### 立刻(10 分钟)
1. 决定是否将 `openclaw.json` 的 `channels.wechatpadpro.enabled` 改为 `false` —— 当前为 `true`,与 `accounts/default.json` 内注释描述不符
2. 停用 `sendApp` AI 工具(打在「群发消息」端点上,见 P0-B)

### 今天(2-3 小时)
3. `src/inbound/triggers.ts:75-78` 空 if 补 `return { triggered: false, via: "blocked" }`
4. `groupPolicy` 检查搬入 `triggers.ts` 的 4-way OR 之前;`"closed"` 加入合法枚举;启动时校验非法值并 fail-fast
5. DM 默认改 **fail-closed**(`allowFrom` 为空 = 拒绝)
6. 加自回环过滤 `msg.fromWxid === ctx.botWxid → blocked`
7. `SeenTracker` 接入 `handler.handle()` 入口;`wpp_messages` 加 `UNIQUE (account_id, msg_id, new_msg_id)`
8. 红包消息 `processRedPacket` 后 `return`,不继续 dispatch

### 本周
9. `/Webhook/Set` 补 `enabled: true` 并实测(**最可能解决 8/8 推送故障,建议第一个验**)
10. `api-client.ts` 的 `JSON.parse` 换成带 `stringifyLargeInts` 的 `parseJsonText`;JSON 解析失败不再判 `Code=0`
11. `/Msg/SendTxt` 的 `ats` → `At`(逗号串)+ 补 `Type: 1`
12. `api/client.ts:167-170` 的 authcode 无差别注入改为白名单(防 Admin 端点自删授权码)
13. webhook 绑 `127.0.0.1` + 1Panel nginx 反代限 vendor IP;或配置 `webhookSecret` 启用签名
14. `selfWxid` 支持微信号格式:扩展 `mention.ts` regex,并去掉裸 `includes()` 快路径

### 系统性修法(契约层)
143 处字段名不建议逐个手改。`send/*.ts` 的 `dispatch()` 是唯一出口(`factory.ts` 已收口),建议:
1. 由 swagger `definitions` 自动生成 `endpoint → 字段映射表`
2. 在 dispatch 层做字段名转换
3. 把比对脚本纳入 `tests/`,作为回归测试

使偏差在 CI 暴露,而不是等 vendor 静默返回 200。

---

## 附录 A:复核命令清单

```bash
# 拉取 swagger
curl -s http://127.0.0.1:8062/swagger.json -o /tmp/wpp-swagger.json

# 端点覆盖率
grep -rhoE '"/[A-Za-z][A-Za-z0-9/_-]*"' src/ | tr -d '"' | sort -u > /tmp/impl.txt
node -e "const s=require('/tmp/wpp-swagger.json');const impl=new Set(require('fs').readFileSync('/tmp/impl.txt','utf8').split('\n'));
const miss=Object.keys(s.paths).filter(p=>!impl.has(p));console.log('missing:',miss.length)"

# 门禁验证
grep -rn "groupPolicy" src/inbound/ src/dispatch/          # 预期:仅 inbound/index.ts:67(死代码)
grep -rn "handleWebhookPayload" src/                       # 预期:0 runtime 调用点
sed -n '75,78p' src/inbound/triggers.ts                    # 预期:空 if 块
grep -rn "SeenTracker\|buildDedupeKey" src/                # 预期:仅定义,0 调用

# 客户端精度
grep -n "stringifyLargeInts\|JSON.parse" src/api-client.ts src/api/client.ts

# 契约抽查
node -e "const s=require('/tmp/wpp-swagger.json');
console.log(JSON.stringify(s.definitions['Msg.SendNewMsgParamDoc'].properties));
console.log(s.paths['/Msg/SendApp'].post.summary);
console.log(JSON.stringify(s.definitions['Group.GetChatRoomParamDoc'].properties));
console.log(JSON.stringify(s.definitions['webhook.WebhookConfig'].properties));"

# 暴露面
ss -tlnp | grep 4398
iptables -S | grep 4398
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  http://127.0.0.1:4398/wechatpadpro/default/webhook -H 'Content-Type: application/json' -d '{}'

# 基线
npx tsc --noEmit          # 预期 0 错
npm run lint              # 实测 7 errors + 30 warnings
```

## 附录 B:审阅过程披露

1. **有一次非预期写操作**:第 5 个审计 agent 为核对 dist 漂移执行了 `npx tsc`,重新编译了 dev 的 `dist/`(mtime 15:56 → 16:40)。tsc 输出为 deterministic,内容应等价,但 mtime 已变。**该仓库无 git**(`.git` 不存在),无法 checkout 回滚。

2. **版本号在审阅期间发生变化**:审阅开始时 `package.json` 为 `1.1.15`,结束时为 `1.1.16`。若非人工并行修改,需排查原因。

3. **审计 agent 数据偏差**:agent 报告 ESLint 9 errors,实测 7;agent 报告"deploy 目录嵌套 accounts 会被加载",实测不会(`config.ts:135` 过滤非 `.json`)。**本报告已按实测修正,但 [待复核] 条目未逐条验证,请复核方独立核实。**

## 附录 C:关键文件位置速查

| 关注点 | 文件:行 |
|---|---|
| 门禁判定(live) | `src/inbound/triggers.ts:46-114` |
| 门禁判定(死代码) | `src/inbound/index.ts:41-94` |
| requireAtMention 空 if | `src/inbound/triggers.ts:75-78` |
| DM fail-open | `src/inbound/triggers.ts:64-70` |
| @ 检测 regex | `src/inbound/parser/mention.ts:7-16, 46-52` |
| dispatch 入口 | `src/dispatch/dispatcher.ts:129-207` |
| agentId fallback | `src/dispatch/dispatcher.ts:137-146` |
| 启动装配 + 热重载 | `src/index.ts:60-200, 519-541` |
| 去重(未接线) | `src/webhook-receiver.ts:209` |
| HTTP 客户端 A(live) | `src/api-client.ts` |
| HTTP 客户端 B | `src/api/client.ts` |
| 签名验证 | `src/core/signature.ts:96-108` |
| DB 写入无 UPSERT | `src/storage/db/mysql.ts:207-229` |
| schema 无 UNIQUE | `db/schema.sql:21-37` |
| 契约实现 | `src/send/*.ts`(23 个模块) |
| AI 工具 meta | `src/dispatch/agent-tools/*-meta.ts`(18 个) |

---

*报告生成:2026-08-08 · 审阅方法:5 路并行只读审计 + 逐条 grep 复核*
