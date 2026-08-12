# WPP 插件 swagger API 实现核对报告 (v1.3.19)

- **日期**: 2026-08-10
- **方法**: swagger 236 endpoint 逐项 vs send wrapper / agent-tools / 业务调用 三层比对 (脚本 /tmp/wpp-final-audit.py)
- **结论**: **API 封装层 100% 覆盖** (除 4 个有意移除); 真正缺口在 **"已封装但没接成 AI 工具"** 层

---

## 一、三层覆盖总览

| 覆盖级别 | 含义 | 数量 |
|---|---|---|
| **L3 全用** | wrapper + AI 工具 + 业务调用 | ~44 |
| **L2 工具** | wrapper + AI 工具 (AI 可直接调) | ~85 |
| **L1 仅封装** | wrapper 有, 没接 AI 工具, 没业务调用 | ~101 |
| **L0 未实现** | swagger 有, wrapper 无 | 4 |

**关键洞察**: 236 个 endpoint 全部有 API wrapper (封装层完备)。所谓"未实现"其实分两类:
1. **L0 完全无**: 4 个 (全部是有意移除)
2. **L1 有 wrapper 但没暴露给 AI**: ~101 个 — 这是**可开发的存量**

---

## 二、按组分类 (老板决策用)

### 🚫 A 组: 未实现 (L0, 4 个) — 建议保持移除

| Endpoint | 说明 | 建议 |
|---|---|---|
| `/Admin/GenAuthKey` | 生成授权码 | v1.1.17 有意移除 (需管理 key, 权限过高) |
| `/Admin/DelayAuthKey` | 延期授权码 | 同上 |
| `/Admin/DeleteAuthKey` | 删除授权码 | 同上 |
| `/User/GetAllOnline` | 获取所有在线 wxid | 需管理员 key |

> 这 4 个**不建议开发** — 权限过高, 插件运行用不到。若真要开, 需先评估管理 key 的安全暴露。

---

### 📌 B 组: 有业务价值, 建议接入 AI 工具 (L1 中精选, 每组 1-2h)

这些是**已封装好 (wrapper 有了)**, 只差在 `agent-tools/<tag>-meta.ts` 加一条 meta + lazy ctx。开发成本低。

| 组 | 未接 AI 工具的端点 | 业务价值 | 建议 |
|---|---|---|---|
| **Group 群管理** (3) | `FacingCreateChatRoom` 创建面对面群 / `GroupList` 群列表 / `ScanIntoGroupEnterprise` 扫码进群企业 | 高: 老板常用建群/查群 | ✅ 接入 |
| **FriendCircle 朋友圈** (2) | `MmSnsSync` 查询评论转发 ID / `Upload` 朋友圈下载 CDN 视频 | 中: 朋友圈运营 | 可选 |
| **OfficialAccounts 公众号** (6) | `GetAppMsgExtLike` 点赞文章 / `OauthAuthorize` OAuth / `MpGetA8Key` 文章 key | 中: 公众号运营 | 可选 |
| **Finder 视频号** (6) | `FinderSearchList` 搜索列表 / `GetCommentList` 评论 / `GetCommentDetail` 详情 / `Findergettopiclist` 主题列表 | 中: 视频号运营 | 可选 |
| **Wxapp 小程序** (12) | `AddAvatar`/`AddMobile`/`GetUnionPay` 云闪付/`GetUserOpenId` 等 | 低-中: 定制场景才用 | 暂缓 |
| **TenPay 支付** (4) | `Openwxhb` 发红包 / `Receivewxhb` 收红包 / `Qrydetailwxhb` 查红包 / `GetEncryptInfo` | 中: 红包运营 | 可选 |
| **Search 搜索** (6) | `Live` 直播 / `MiniGames` 小游戏 / `Stickers` 贴图 / `Underlines` 划线 / `WeChatIndex` 指数 | 低: AI 搜索场景 | 暂缓 |
| **Friend 好友** (2) | `GetMFriend` 手机通讯录 / `Upload` 上传通讯录 | 中: 通讯录管理 | 可选 |
| **Tools 工具** (4) | `ThirdAppGrant` 第三方APP授权 / `GetBoundHardDevices` / `HelperVerification` / `OauthSdkApp` | 低: OAuth 授权类 | 暂缓 |
| **Customized** (1) | `WXCTDUniftyAuthBatch` 批量开小程序 | 低: 定制接口 | 暂缓 |
| **QWContact** (2) | `QWApplyAddContact`/`QWAddContact` 企业微信加好友 | 低 | 暂缓 |

---

### 🔒 C 组: 内部流程用, 不该暴露给 AI (L1 中的 Login 29 个 + 部分)

| 组 | 端点 | 为什么不该给 AI |
|---|---|---|
| **Login** (29) | `62data`/`A16Data` 各种登录方式, `GetQR*` 各种二维码, `CheckQR`/`ExtDeviceLogin*` 扫码, `TwiceAutoAuth` 二次登录等 | 登录是**账号生命周期管理**, 内部 webhook/startup 用, 不该让 AI 触发 (会打断登录态) |
| **Msg/StartAutoSync** (1) | 启动自动同步 | 内部同步机制, 不该 AI 控制 |
| **User/GetOnlineInfo** (1) | 获取在线信息 | 内部状态查询 |

> 建议 **保持不暴露** — 这些暴露给 AI 反而有风险 (AI 可能误触发登录流程/同步)。

---

### ✅ D 组: 已完整可用 (L2+L3, ~129 个) — 无需开发

AI 已可直接调用的核心能力:
- **Msg (17)**: 发文本/图片/视频/语音/文件/表情/小程序/名片/链接/位置/引用回复/撤回
- **Group (18)**: 建群/加人/删人/群详情/群二维码/改群名/公告/转让/拍一拍
- **Friend (8)**: 搜索好友/加好友/删好友/备注/拉黑
- **Search (8)**: 综合/图片/视频号/小程序/公众号/文章搜索
- **Webhook (6)**: 全部
- **Translate (2)**: 翻译+发送
- **Voice (2)**: 语音转写
- **Label/Favor (7)**: 标签/收藏
- **Tools (6)**: 图片/文件下载等

---

## 三、推荐开发路线 (老板决策)

| 优先级 | 做什么 | 工作量 | 收益 |
|---|---|---|---|
| **P1** | B 组 Group 群管理 3 个接入 AI 工具 | 0.5-1h | 高: 建群/查群是高频 |
| **P2** | B 组 FriendCircle 朋友圈 2 个 + TenPay 红包 4 个 | 1-1.5h | 中: 运营场景 |
| **P3** | B 组 OfficialAccounts 公众号 6 个 + Finder 视频号 6 个 | 1.5-2h | 中: 内容运营 |
| **P4** | B 组 Wxapp 小程序 12 个 + Search 6 个 + 其余 | 2-3h | 低: 定制才用 |
| **不做** | A 组 Admin 3 + GetAllOnline; C 组 Login 29 + 内部同步 | — | 保持移除 (权限/风险) |

**接入成本极低**: 每个端点 = 在 `<tag>-meta.ts` 加一条 `[描述, Type.Object schema, fn]` + lazy ctx (v1.3.18 模式已有), 加测试即可。总投入 P1-P3 ≈ 半天。

---

## 四、方法说明

- **脚本**: `/tmp/wpp-final-audit.py` (swagger 236 endpoint → 三层覆盖比对)
- **判定**: wrapper = `send/<tag>.ts` 含端点字符串/方法; AI 工具 = `agent-tools/<tag>-meta.ts` 或 `send-message.ts` 含端点/类型路由; 业务 = 非 send/meta 的 src/ 引用
- **注意**: agent-tools 用 AI 友好名 (sendText vs sendTxt), 脚本按端点字符串匹配避免误报
