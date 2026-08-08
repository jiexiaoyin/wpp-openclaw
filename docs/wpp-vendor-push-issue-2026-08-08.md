# WeChatPadPro 接入异常排查报告 (2026-08-08)

**报告类型**：接入链路异常 — **vendor ↔ 微信服务器 MMTLS long-link 死亡**
**报告人**：OpenClaw Gateway v2026.7.1-2 + WeChatPadPro plugin v1.1.9
**服务器**：阿里云 iZbp1dfvd56ai31wqa8dtbZ
**时间**：2026-08-08 11:00-11:10 (UTC+8)
**状态**：✅ **真因已锁定 (老板网关报告 11:15 纠偏)** — vendor binary MMTLS long-link decrypt failed
**纠正前错误判断**：vendor push dispatcher dead / 推送路由未生效 → ❌ 错
**真因**：vendor binary (容器 wechatpadpromax08) 跟微信服务器 short.weixin.qq.com 的 MMTLS long-link **建不起来**，vendor 永远收不到任何新消息

---

## ⚠️ 修正说明 (2026-08-08 11:15)

老板 11:10 亲测：发消息后 vendor 容器日志**完全没反应**，网关报告 `/root/audit-reports/2026-08/wechatpadpro-openclaw/mmtls-long-link-dead-2026-08-08.md` 锁定真凶 — **MMTLS long-link 死了**，不是 push dispatcher 问题。

之前 11:07 提交的报告假设 "vendor 收到了消息但没推"，**完全错误**。本报告替换原版。

---

## 问题描述 (真因版)

WPP (WeChatPadPro) 容器 vendor binary 跟微信服务器的 **MMTLS long-link 三次 decrypt 失败**，物理上没建立到微信服务器 (`short.weixin.qq.com`) 的 outbound 连接。结果：
- vendor 内部登录态 OK (心跳成功)
- WebSocket OK (用户连接数=2)
- webhook set OK (Code:0)
- 但 vendor **永远收不到任何新消息**（因为微信服务器压根没把消息投递过来）

**后果**：老板手机发消息到 q139198824 → 微信服务器有消息 → 但消息**只投递到 GeWe SaaS (副号 wxid_eezdbu1ytws422)**，**不投递到 vendor (主号 q139198824)**。

---

## 关键证据链

### 证据 1: vendor binary 跟微信服务器的 MMTLS 握手失败 (10:07:47)

```
2026/08/08 10:07:47 [MMTLS] decrypt attempt=1 failed host=short.weixin.qq.com profile=default-pad-v104 path=/mmtls/a3dcf2a1 ...
2026/08/08 10:07:47 [MMTLS] decrypt attempt=2 failed host=short.weixin.qq.com profile=forced-pad-v104-psk3 path=/mmtls/a3dcf2a2 ...
2026/08/08 10:07:47 [MMTLS] decrypt attempt=3 failed host=short.weixin.qq.com profile=forced-pad-v104-psk4 path=/mmtls/a3dcf2a3 ...
```

- `host=short.weixin.qq.com` = 微信 long-link 服务器（短链域名）
- `path=/mmtls/...` = MMTLS (微信长连接加密协议)
- `profile=default-pad-v104` = vendor binary 用 v104 profile 解密
- **3 次 decrypt 都失败** = vendor binary 的 MMTLS profile 跟微信服务器期望的不匹配，微信服务器把 vendor 当作"陌生人"断开

### 证据 2: vendor binary 物理连接只到 Cloudflare, 没有微信服务器

```
$ docker exec wechatpadpromax08 netstat -an | grep ESTAB
172.23.0.6:60816  → 172.67.131.215:443    ESTABLISHED   ← Cloudflare CDN IP, 不是微信服务器
172.23.0.6:57564  → 172.23.0.3:6379       ESTABLISHED   ← Redis
::ffff:172.23.0.6:8089 → ::ffff:172.23.0.1:53048 ESTAB  ← OpenClaw plugin (gateway 容器)
::ffff:172.23.0.6:8089 → ::ffff:172.23.0.1:50810 ESTAB  ← OpenClaw plugin
```

**没有到 short.weixin.qq.com / long-link.wechat.qq.com 的连接** = vendor binary 跟微信服务器的 MMTLS long-link 物理上不存在。

### 证据 3: 10:07 MMTLS 失败后, 10:29 token_key 切换, 但 MMTLS 仍未重建

| 时间 | 事件 | MMTLS 状态 |
|---|---|---|
| 10:07 | 老 token_key `9a64b785...`, MMTLS decrypt 3 次失败 | ❌ 失败 |
| 10:29 | 老板 vendor 后台切新 token_key `93a4870c...` | — |
| 10:30:21 | vendor 心跳失败, invalid tokenkey 401（老 token 还没释放完） | — |
| 10:30:21 | Pad08 已关闭, 走 CCD 兼容链路 | — |
| 10:30:23 | vendor binary 服务已启动 (重启) | ❌ **没看到 MMTLS 重新握手** |
| 10:30:24 | WebSocket 已连接, 用户连接数=2 | plugin 端 OK, vendor 端 long-link 还是死的 |
| 11:00/11:05/11:09 | vendor 心跳成功 | 内部登录态 OK, 跟微信服务器无关 |
| 11:09:45/58 | webhook set 成功 | vendor 主动推 webhook, 但 vendor **没东西可推** |

### 证据 4: 11:10 老板实测 — vendor 容器日志完全无反应

老板 11:10 亲测：发消息到 q139198824 → vendor 容器日志**完全没反应**（0 条新消息处理 log）。这正是 "vendor 没收到" 而非 "vendor 收到没推" 的金标准证据。

---

## 三个潜在根因（老板决策路径）

### 假设 A: vendor binary 的 MMTLS 协议版本太老
- vendor binary 用 `default-pad-v104` profile (2024 年版本)
- 微信服务器现在可能要求 `v108` 或更新
- **建议**：联系 vendor 客服 (adminmax.knowhub.cloud) 确认 MMTLS 协议版本，可能需要升级 binary 或换 Pad08 真实链路

### 假设 B: CCD 兼容链路没重建 MMTLS long-link
- Pad08 已关闭 (`pad08enabled=false`)，`libv08.so` 装了但 binary 走 CCD 兼容
- CCD 兼容模式可能只保登录态 + 心跳，不重建 long-link
- **建议**：让 Pad08 起来（找 vendor 要新版 libv08.so 或调 `pad08enabled=true` 重启）

### 假设 C: token_key 切换导致 vendor-binary ↔ 微信服务器信任状态断
- 老板 10:29 切 token_key，vendor 容器 10:30 重启
- vendor 重启后只重连 vendor 后台 (knowhub.cloud)，但**没重新跟微信服务器握手 MMTLS**
- **建议**：vendor 后台手动重置 MMTLS long-link（需 vendor 客服指导）

---

## 客户端环境（参考）
- 容器名：`wechatpadpromax08`，镜像 `wechatpadpro:local`
- HTTP API：`http://127.0.0.1:8062`（容器内）
- WebSocket：`ws://127.0.0.1:8089/ws/sync?authcode=...`
- OpenClaw Plugin：`wechatpadpro-openclaw v1.1.8/v1.1.9`
- 公网反代：`https://wx.juhe.chat` (1Panel + openresty)
- 鉴权 env：`WECHATPRO_TOKEN_KEY=0fac2039cc1f5b3216cd5d009d7c070b`，`WECHATPRO_AUTHCODE=24f16fbb-e59e-4c8a-8e24-7c3f0474e8e0`

---

## 客户端侧全部正常（实测 ✅）

| 项 | 结果 |
|---|---|
| 容器健康 | `Up 25 minutes (healthy)` |
| vendor `/api/Msg/Sync` | `Code:0, 当前未有新消息, Count:0` |
| vendor `/api/Login/HeartBeat` | `Code:0, 成功` |
| vendor `/api/Login/GetCacheInfo` | `wxid=q139198824, nickname=接晓银, device=iPad iPadOS27.0` |
| vendor `/api/Friend/GetContractList` | `Code:0, ContactUsernameList 73万+` |
| vendor `/api/Login/Newinit` | `Code:0, 成功`（10:30:24 已 Newinit 成功） |
| openclaw-gateway ws-client | `ws connected ✅ ws recv: connection_ready (handshake ack) ✅` |
| 本地 webhook 自测 | `curl POST 4398/wechatpadpro/webhook` → `ok` + openclaw 日志显示 `inbound: account=default peer=direct/diagnostic_user text=hello diagnostic` 完整链路通 |

**结论**：客户端代码、openclaw 插件、openresty 反代、webhook 接收器**全部正常**。问题完全在 vendor binary ↔ 微信服务器之间。

---

## 容器 `app.conf` 当前配置
```
appname = WeChatPadProMAXwxapi
user_token_key = "93a4870cd7fea15b08536474ff32b363"
authcode = "24f16fbb-e59e-4c8a-8e24-7c3f0474e8e0"
websocket = true
websocketport = 8089
push_websocket = true
push_webhook = true
push_rabbitmq = false
msgpush = false
pad08enabled = false           ← 旧版兼容 CCD 链路 (没重建 MMTLS long-link?)
ccd08sourcemode = false
pad_face_public_base_url = "https://wx.juhe.chat"
```

---

## 老板决策路径（铁律 8/7: vendor 后台是老板专属, AI 不碰）

| 选项 | 动作 | 风险 | 老板执行 |
|---|---|---|---|
| **A** | 联系 vendor 客服 (adminmax.knowhub.cloud)，报告 MMTLS decrypt failed + 长连接缺失 | 0 | 老板发邮件/工单 |
| **B** | vendor 后台手动重启 vendor 容器 (`docker restart wechatpadpromax08`) | 中（token_key 可能重置） | 老板手工 |
| **C** | 暂时放弃 vendor (主号) 走 GeWe 副号 | 低（GeWe SaaS 已 OK） | 不需动 |
| **D** | 老板手机扫码重 Newinit，看是否触发 MMTLS 重握 | 低 | 老板手机操作 |

---

## 现场复现命令

```bash
# 1. 容器健康
docker ps | grep wechatpadpromax08

# 2. 看 vendor 跟谁连 (确认无微信服务器 outbound)
docker exec wechatpadpromax08 netstat -an | grep ESTAB

# 3. 看 vendor MMTLS 日志
docker logs wechatpadpromax08 2>&1 | grep "MMTLS"

# 4. vendor API 健康
curl -X POST "http://127.0.0.1:8062/api/Login/HeartBeat?authcode=24f16fbb-..." \
  -H "X-TokenKey: 93a4870c..." -H "Content-Type: application/json" -d '{}'

# 5. 本地 webhook 自测（确认客户端链路通）
curl -X POST http://127.0.0.1:4398/wechatpadpro/webhook \
  -H "Content-Type: application/json" \
  -d '{"fromWxid":"diag","toWxid":"q139198824","msgType":1,"content":"ping","msgId":"diag-1","newMsgId":"diag-1","ts":1786158000}'

# 6. openclaw ws 连接状态
journalctl --user -u openclaw-gateway --since "30m" | grep -E "ws (connected|closed|error)"
```

---

# English version (for vendor support)

## Title
WeChatPadPro MMTLS long-link failed to establish — vendor binary receives 0 messages despite login OK / WS OK / webhook OK

## Environment
- Container: `wechatpadpromax08` (image `wechatpadpro:local`)
- API: `http://127.0.0.1:8062`, WS: `ws://127.0.0.1:8089/ws/sync?authcode=...`
- Client app: OpenClaw wechatpadpro-openclaw plugin v1.1.9
- Public reverse proxy: `https://wx.juhe.chat`

## Root cause
**vendor binary failed to establish MMTLS long-link to `short.weixin.qq.com`** (3 decrypt attempts failed at 10:07:47). Vendor never receives messages because WeChat server doesn't deliver them.

## Hard evidence
```
2026/08/08 10:07:47 [MMTLS] decrypt attempt=1 failed host=short.weixin.qq.com profile=default-pad-v104 path=/mmtls/a3dcf2a1 send_records=19/ff104/162,19/ff104/36,17/ff104/3053,15/ff104/23 recv_records=15/ff104/7 recv_len=12
2026/08/08 10:07:47 [MMTLS] decrypt attempt=2 failed host=short.weixin.qq.com profile=forced-pad-v104-psk3 path=/mmtls/a3dcf2a2 ...
2026/08/08 10:07:47 [MMTLS] decrypt attempt=3 failed host=short.weixin.qq.com profile=forced-pad-v104-psk4 path=/mmtls/a3dcf2a3 ...
```

## Outbound connections (vendor container)
```
172.23.0.6:60816 → 172.67.131.215:443  ESTABLISHED  ← Cloudflare CDN (NOT WeChat server)
172.23.0.6:57564 → 172.23.0.3:6379    ESTABLISHED  ← Redis
::ffff:172.23.0.6:8089 → plugin       ESTABLISHED  ← OpenClaw plugin
```
**NO connection to short.weixin.qq.com or long-link.wechat.qq.com** = MMTLS long-link physically absent.

## After token_key switch (10:29), vendor restarted (10:30) but MMTLS not rebuilt
- 10:30:21 invalid tokenkey 401 (old token release in flight)
- 10:30:23 vendor binary restarted, but **no MMTLS re-handshake in logs**
- 10:30:24 WS connected, but MMTLS still dead
- 11:00/11:05/11:09 heartbeat OK (internal login state, unrelated to WeChat)
- 11:10 user test message → vendor logs completely silent

## What we tried (all confirmed working client-side)
- Local webhook receiver (`curl POST :4398/wechatpadpro/webhook` → 200 + inbound dispatcher OK)
- WS client handshake with vendor (`ws connected + connection_ready`)
- 60s fallback Msg/Sync polling (200 OK but Count=0)

**Client side is 100% functional. Bottleneck is vendor ↔ WeChat MMTLS handshake.**

## Possible causes (asking vendor support)
1. **MMTLS profile too old**: vendor uses `default-pad-v104` (2024); WeChat may require v108+
2. **CCD compatibility mode not rebuilding long-link**: `pad08enabled=false`, CCD mode may keep only login state + heartbeat
3. **token_key switch broke vendor ↔ WeChat trust**: vendor restarted but only reconnected to knowhub.cloud backend, not to WeChat MMTLS

## Ask vendor support
1. Check vendor binary MMTLS protocol version vs current WeChat requirement
2. Confirm `pad08enabled=false` (CCD mode) doesn't rebuild long-link; recommend Pad08 enabled if available
3. Guide on manually resetting MMTLS long-link after token_key switch
4. Provide any logs from vendor backend (adminmax.knowhub.cloud) showing MMTLS handshake status for this authcode