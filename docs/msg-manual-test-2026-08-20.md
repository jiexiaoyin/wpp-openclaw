# Msg 消息模块 新旧版本差异 + 手工测试清单

**日期**: 2026-08-20
**对比**: 旧 vendor (20260809) vs 新 vendor (v2026.08.18.1)
**Msg 域**: 21 个端点 (旧 18 + 新 21)
**测试前提**: 新容器已部署 (API `http://127.0.0.1:18062`), 已登录 (authcode = X-Access-Token)

---

## 一、新旧差异总览

### 1.1 新增端点 (3 个, 旧版本没有)
| 端点 | 请求体 | 说明 |
|---|---|---|
| `/Msg/SendGroupMassMsgText` | `{ToIds: string[], Content: string}` | 群发文本到多个群 |
| `/Msg/SendFile` | `{ToWxid: string, FileName: string, Base64: string}` | 发文件 (自动上传+发送) |
| `/Msg/SendAppMessage` | `{items: [{kind, ...}]}` | 结构化应用卡片 (链接/小程序/音乐/文件) |

### 1.2 字段变化 (2 个)
| 端点 | 旧请求体 | 新请求体 | 说明 |
|---|---|---|---|
| `/Msg/SendApp` | `{Content, ToIds}` | `{ToWxid, Type, Xml}` | **完全不同** — 旧是群发, 新是单发应用消息 |
| `/Msg/Revoke` | `ClientMsgId/NewMsgId` (integer) | `ClientMsgId/NewMsgId` (**string**) | **类型变化** — 传数字新版本报错? 实测接受 |

### 1.3 无变化 (16 个, 直接测试即可)
Quote / SendCDNFile / SendCDNImg / SendCDNVideo / SendEmoji / SendTxt / SendVideo / SendVoice / SendXCX / ShareCard / ShareLink / ShareLocation / ShareVideo / StartAutoSync / Sync / UploadImg

### 1.4 响应结构变化 (所有端点)
- **旧**: `{Code, CodeValue, Data, Data62, Debug, ID, Message, Success}`
- **新**: `{Code, Data, Message, Success, request_id}`
- **判断**: 只看 `Code` + `Success` 即可; `Code=0` = 成功

---

## 二、手工测试清单

> authcode = 登录后 X-Access-Token 值 (本部署 `71bed0f5...`)
> 以下 curl 走 `http://127.0.0.1:18062` (或域名 `https://wx.juhe.chat`)

### A. 发送文本 (SendTxt) — 无变化, 基础验证

```bash
curl -X POST "http://127.0.0.1:18062/api/Msg/SendTxt?authcode=<AC>" \
  -H "Content-Type: application/json" \
  -d '{"ToWxid":"filehelper","Content":"手工测试文本","At":"","Type":1}'
```
**预期**: `Code:0 Success:true`; 文件传输助手收到文本
**注意**: `ToWxid` 用 filehelper (自己) 或真实好友 wxid

### B. 群发文本 (SendGroupMassMsgText) — 新端点 ★

```bash
curl -X POST "http://127.0.0.1:18062/api/Msg/SendGroupMassMsgText?authcode=<AC>" \
  -H "Content-Type: application/json" \
  -d '{"ToIds":["<群wxid@chatroom>"],"Content":"群发测试文本"}'
```
**预期**: `Code:0 Success:true`, 群收到文本
**注意**: ToIds 是**数组** (不是字符串)

### C. 发文件 (SendFile) — 新端点 ★

```bash
# base64 = 文件内容 (如 echo -n "test file" | base64)
curl -X POST "http://127.0.0.1:18062/api/Msg/SendFile?authcode=<AC>" \
  -H "Content-Type: application/json" \
  -d '{"ToWxid":"filehelper","FileName":"test.txt","Base64":"dGVzdCBmaWxl"}'
```
**预期**: `Code:0`, 文件传输助手收到 test.txt
**注意**: Base64 是文件内容, 不是路径

### D. 发结构化卡片 (SendAppMessage) — 新端点 ★

```bash
curl -X POST "http://127.0.0.1:18062/api/Msg/SendAppMessage?authcode=<AC>" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"kind":"link","title":"测试链接","desc":"链接卡片","url":"https://example.com"}]}'
```
**预期**: `Code:0`, 收到链接卡片
**注意**: items 数组, kind 决定卡片类型

### E. 发图片 (UploadImg + SendCDNImg) — 无变化

```bash
# 1. 上传图片拿 imgUrl
curl -X POST "http://127.0.0.1:18062/api/Msg/UploadImg?authcode=<AC>" \
  -H "Content-Type: application/json" -d '{"ToWxid":"filehelper","Base64":"<图片base64>"}'
# 2. 用返回的 URL 发 CDN 图片
curl -X POST "http://127.0.0.1:18062/api/Msg/SendCDNImg?authcode=<AC>" \
  -H "Content-Type: application/json" -d '{"ToWxid":"filehelper","Content":"<imgUrl>"}'
```
**预期**: 第1步 Code:0 返回 imgUrl; 第2步 Code:0 收到图片

### F. 发语音 (SendVoice) — 无变化 (silk 格式)

```bash
# Base64 是 silk 音频内容 (Type=4), ToWxid 必填
curl -X POST "http://127.0.0.1:18062/api/Msg/SendVoice?authcode=<AC>" \
  -H "Content-Type: application/json" \
  -d '{"ToWxid":"filehelper","Base64":"<silk-base64>","Type":4,"VoiceTime":2000}'
```
**预期**: Code:0, 收到语音 (时长 2 秒)
**注意**: vendor 只收 silk 格式 (插件会自动转码)

### G. 撤回 (Revoke) — 类型变化 ⚠️

```bash
# 先发一条文本, 记下返回的 MsgId / NewMsgId
# 撤回: NewMsgId 传 string (新版本类型)
curl -X POST "http://127.0.0.1:18062/api/Msg/Revoke?authcode=<AC>" \
  -H "Content-Type: application/json" \
  -d '{"ClientMsgId":"<msgId>","NewMsgId":"<newMsgId>","CreateTime":<时间戳>,"ToUserName":"filehelper"}'
```
**预期**: Code:0, 消息被撤回
**⚠️ 重点测**: NewMsgId 传**字符串** vs **数字** 是否都成功 (新版本是 string 类型)

### H. 引用回复 (Quote) — 无变化, 重要链路

```bash
curl -X POST "http://127.0.0.1:18062/api/Msg/Quote?authcode=<AC>" \
  -H "Content-Type: application/json" \
  -d '{"to_wxid":"filehelper","content":"引用回复测试","quote_content":"被引用的原文","svr_id":"<原消息svrid>","sequence":"1","new_msg_id":"<原消息newMsgId>","msg_type":1,"from_user_id":"<发送者wxid>","chat_user_id":"filehelper"}'
```
**预期**: Code:0, 收到引用原消息的回复
**注意**: svr_id/new_msg_id 要填**真实**的原消息 ID (从历史消息拿)

### I. 同步消息 (Sync) — 无变化, 收消息依赖

```bash
curl -X POST "http://127.0.0.1:18062/api/Msg/Sync?authcode=<AC>" \
  -H "Content-Type: application/json" -d '{"Scene":0,"Synckey":""}'
```
**预期**: Code:0, Data 含 AddMsgs (有消息时) / "当前未有新消息" (无消息时)
**注意**: 这是插件收消息的核心, 若异常会影响 AI 回复

### J. 发应用消息 (SendApp) — 字段变化 ⚠️ (谨慎)

```bash
# 新版本: {ToWxid, Type, Xml} — 和旧版完全不同的语义
curl -X POST "http://127.0.0.1:18062/api/Msg/SendApp?authcode=<AC>" \
  -H "Content-Type: application/json" \
  -d '{"ToWxid":"filehelper","Type":5,"Xml":"<appmsg xml>"}'
```
**预期**: Code:0 或明确错误
**注意**: 插件**不用此端点** (改用 ShareLink), 测试仅确认新语义

---

## 三、测试优先级建议

| 优先级 | 端点 | 理由 |
|---|---|---|
| 🔴 必测 | SendTxt / Sync / Quote | 插件核心链路 (发/收/引用) |
| 🔴 必测 | SendGroupMassMsgText / SendFile / SendAppMessage | 新端点, 插件已适配 |
| 🟡 重点 | Revoke | 类型变化 (string), 需验证 |
| 🟡 重点 | SendVoice / UploadImg | 媒体收发 |
| 🟢 可选 | SendApp / ShareCard / ShareLocation 等 | 低频 |

## 四、测试注意

1. **ToWxid**: 用 `filehelper` (文件传输助手) 可自我测试, 不影响他人
2. **响应判断**: 只看 `Code:0` + `Success:true` = 成功
3. **authcode**: 每个请求都要带 `?authcode=<AC>` 或 `X-Access-Token` 头
4. **媒体测试**: 图片/语音/视频建议用真实小文件, 避免假 base64 触发业务错误
5. **风控**: 群发/发圈等敏感操作建议用测试群, 避免打扰真实群
