# WPP 图片下载 64KB 截断 — 给 vendor 的技术报告

> **日期**: 2026-08-09/10
> **提交方**: 益融数码 (WPP 插件对接方)
> **问题**: v1 推送 schema 后, 图片消息只能下载首 64KB, AI 无法看到完整图片
> **关联**: vendor 于 **2026-08-09 09:00** 切换推送 schema v0 → v1

---

## 1. 现象

微信收到的图片, AI 智能体只能看到**前 64KB (65536 字节)**。原图大于 64KB 时, 图片下半部分被截断, AI 无法完整识别内容。

- 私聊、群聊**均受影响** (全渠道)
- 小图 (≤64KB) 不受影响, 大图明显截断
- AI 实测反馈: "图片下半部分好像截断了, 完整吗?"

## 2. 根因

### 2.1 推送 schema 切换去掉了 CDN 下载凭证

**v0 schema (8/9 09:00 前)**: 图片消息 content 含完整 `<img>` XML, 携带下载凭证:

```xml
<img aeskey="3f8ef33301890e52ecfa98e8d863c672"
     cdnbigimgurl="305f020100044b30..."
     cdnthumburl="305f020100044b30..."
     md5="73096997b21a67676e3a2187dd4b1ab8" ... />
```

→ 客户端用 `/Tools/CdnDownloadImage {fileAesKey, fileNo}` 下载**完整大图** (实测 1.3MB 图能完整下载)

**v1 schema (8/9 09:00 后)**: 推送只给 `local_id`, **无 aeskey / cdnbigimgurl**:

```json
{
  "content": "收到一张图片",
  "kind": "image",
  "local_id": 271382744,
  "image_bytes": 9305,
  "toWxid": "...",
  ...
}
```

→ 客户端只能退用 `/Tools/DownloadImg {msgId: local_id}`, 该接口**硬返回首 64KB**

### 2.2 /Tools/DownloadImg 硬截断 64KB (实测 5 组参数全忽略)

| 参数组合 | totalLen | dataLen | 实际字节 |
|---|---|---|---|
| `compressType=0` (默认) | 345493 | 65536 | **65536** |
| `compressType=1` | 345493 | 65536 | **65536** |
| `compressType=2` | 345493 | 65536 | **65536** |
| `sectionStart=65536&sectionLen=65536` | 345493 | 65536 | **65536** (startPos 仍=0) |
| `dataLen=345493&sectionLen=345493&sectionStart=0` | 345493 | 65536 | **65536** |

- 响应 `totalLen: 345493` = **完整图 337KB**, 说明 vendor 侧**有完整图**, 但接口没实现分片
- 参数名与 swagger `Tools.DownloadParamDoc` 定义一致 (sectionStart/sectionLen/compressType/dataLen 全有), 但后端**未读取/未实现**

### 2.3 MCP 完整 payload 也被挡

尝试用 vendor MCP `wechat_get_recent_messages` 拉历史消息找 CDN 字段:
```
mcp_realtime_forbidden: enable realtime in the plan and access token
```
需开通 realtime plan 才可用。

## 3. 证据 (OSS 目录对比)

OSS bucket `openclaw-a` 中两个目录是分水岭:

| 目录 | 图大小 | 来源 | 时间范围 |
|---|---|---|---|
| `wpp/images/` (23张) | **完整** (最大 1.3MB) | v0 → CdnDownloadImage | **全部 ≤ 08-09 08:59** |
| `wpp/v1/images/` | **全部 65536** (64KB) | v1 → DownloadImg | 08-09 15:36 起 |

> 时间分界线正好是 vendor 切 schema 的时刻 (8/9 09:00)。

## 4. 修复建议 (任选其一, 按优先级)

### 方案 A (推荐, 改动最小) — v1 推送补回 CDN 下载凭证
v1 schema 的 image 消息补回 v0 时代有的字段:
- `aeskey`
- `cdnbigimgurl` (或 cdnmidimgurl / cdnthumburl)

客户端即可走回 `/Tools/CdnDownloadImage` 完整下载, 插件**无需改动**。

### 方案 B — 实现 /Tools/DownloadImg 分片
swagger `Tools.DownloadParamDoc` 已定义 `sectionStart`/`sectionLen`, 但后端忽略。实现真正的分片下载 (响应已有 totalLen + startPos + dataLen, 分片拼接即可)。

### 方案 C — 开通 MCP realtime plan
放开 `wechat_get_recent_messages` 的 `mcp_realtime_forbidden` 限制, 客户端用 MCP 拉完整 payload 找 CDN 字段。

## 5. 影响面

- 所有 >64KB 的图片消息 (私聊 + 群聊) 无法完整识别
- 当前插件已做兜底: 截断图仍上传 OSS + 注入 AI 上下文, 但 AI 只能看到部分内容
- 文件消息 (v1 无下载能力) 是另一独立问题 (见 v1.1.58 记录)

## 6. 复现步骤 (vendor 侧)

1. 微信给机器人发一张 >64KB 的图 (建议 2000×3000 以上)
2. 抓 v1 推送 payload → 确认只有 `local_id`, 无 aeskey/cdnurl
3. 调 `/Tools/DownloadImg {msgId: local_id}` → 返回 totalLen>65536 但 dataLen=65536

---

*报告人: 益融数码 · 2026-08-10*
