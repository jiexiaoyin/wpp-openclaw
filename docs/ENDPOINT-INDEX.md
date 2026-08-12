# WPP 插件 Endpoint 索引 (自动生成)

- 来源: swagger `http://127.0.0.1:8062/swagger.json` (254 paths, 2026-08-10 更新)
- 覆盖: **248/254 (97.6%)** — 0 假覆盖 (逐端点 grep 源码验证, 2026-08-10 核对)
- 未覆盖 6: Admin×3 (需管理员 key) + Msg/SendApp (v1.1.17 有意移除) + Tools/DownloadFileBinary×2 (有 DownloadFile/Voice 等价)
- 生成时间: 见文件 mtime (脚本 /tmp/gen-endpoint-index.py)
- 用途: 快速查找 endpoint → 实现文件 (send/<tag>.ts) + AI 工具 (agent-tools/<tag>-meta.ts)

## 如何查找

| 场景 | 去哪个文件 |
|---|---|
| 出站调用 (发什么) | `send/<tag>.ts` (makeWppXxx 每端点 1 方法) |
| AI 工具 (agent 用什么) | `dispatch/agent-tools/<tag>-meta.ts` (每端点 1 工具) |
| 入站解析 (收到怎么解析) | `inbound/parser*.ts` + `media-enrich.ts` |
| 业务编排 (触发/上下文) | `dispatch/dispatcher.ts` + `inbound/handler.ts` |

## Login (38 endpoints)
- 实现: `send/login.ts` | AI 工具: `agent-tools/login-meta.ts`

| Endpoint | Method | 入库类型 (send/msg.ts) | 覆盖 | 说明 |
|---|---|---|---|---|
| `/Login/62data` | POST |  | ✅ | 62登陆(账号或密码) |
| `/Login/62dataQRCodeApply` | POST |  | ✅ | 62登陆(账号或密码), 并申请使用二维码验证 |
| `/Login/62dataSMSAgain` | POST |  | ✅ | 62登陆(账号或密码), 重发验证码 |
| `/Login/62dataSMSApply` | POST |  | ✅ | 62登陆(账号或密码), 并申请使用SMS验证 |
| `/Login/62dataSMSVerify` | POST |  | ✅ | 62登陆(账号或密码), 二维码验证校验 |
| `/Login/A16Data` | POST |  | ✅ | A16登陆(账号或密码) - android == 8.0.50 |
| `/Login/A16Data848` | POST |  | ✅ | A16登陆(账号或密码) - android == 新版云函数 |
| `/Login/AutoHeartBeat` | POST |  | ✅ | 开启自动心跳, 自动二次登录 |
| `/Login/Awaken` | POST |  | ✅ | 唤醒登陆(只限扫码登录) |
| `/Login/CheckMacQR` | POST |  | ✅ | 检测Mac二维码 |
| `/Login/CheckQR` | POST |  | ✅ | 检测二维码 |
| `/Login/ExtDeviceLoginConfirmGet` | POST |  | ✅ | 新设备扫码登录 |
| `/Login/ExtDeviceLoginConfirmOk` | POST |  | ✅ | 新设备扫码确认登录 |
| `/Login/Get62Data` | POST |  | ✅ | 获取62数据 |
| `/Login/GetA16Data` | POST |  | ✅ | 获取A16数据 |
| `/Login/GetCacheInfo` | POST |  | ✅ | 获取登陆缓存信息 |
| `/Login/GetLoginQRCode862` | POST |  | ✅ | 获取二维码(iPad 8.0.62 专用) |
| `/Login/GetQR` | POST |  | ✅ | 获取二维码(iPad) |
| `/Login/GetQRMac` | POST |  | ✅ | 获取二维码(Mac) |
| `/Login/GetQRMac_oversea` | POST |  | ✅ | 获取二维码(Mac，海外) |
| `/Login/GetQRPad` | POST |  | ✅ | 获取二维码(安卓Pad-ppmt专用) |
| `/Login/GetQRPadx` | POST |  | ✅ | 获取二维码(安卓Pad-绕过验证码) |
| `/Login/GetQRWatch` | POST |  | ✅ | 获取二维码(Car) |
| `/Login/GetQRWin` | POST |  | ✅ | 获取二维码(Windows) |
| `/Login/GetQRWinUnified` | POST |  | ✅ | 获取二维码(WinUnified-统一PC版) |
| `/Login/GetQRWinUwp` | POST |  | ✅ | 获取二维码(WindowsUwp-绕过验证码) |
| `/Login/GetQR_oversea` | POST |  | ✅ | 获取二维码(iPad，海外) |
| `/Login/GetQRx` | POST |  | ✅ | 获取二维码(iPad-绕过验证码) |
| `/Login/GetQRx_oversea` | POST |  | ✅ | 获取二维码(iPad-绕过验证码，海外) |
| `/Login/HarmonyLoginApi` | POST |  | ✅ | 获取二维码(鸿蒙平板) |
| `/Login/HeartBeat` | POST |  | ✅ | 心跳包 |
| `/Login/HeartBeatLogs` | GET |  | ✅ | 获取心跳日志 |
| `/Login/HeartBeatLong` | POST |  | ✅ | 长连接心跳包跳包 |
| `/Login/LogOut` | POST |  | ✅ | 退出登录 |
| `/Login/LongLinkStatus` | GET |  | ✅ | 查看当前账号长连接运行状态 |
| `/Login/Newinit` | POST |  | ✅ | 初始化 |
| `/Login/TwiceAutoAuth` | POST |  | ✅ | 二次登陆 |
| `/Login/YPayVerificationcode` | POST |  | ✅ | 提交登录验证码 |

## Group (23 endpoints)
- 实现: `send/group.ts` | AI 工具: `agent-tools/group-meta.ts`

| Endpoint | Method | 入库类型 (send/msg.ts) | 覆盖 | 说明 |
|---|---|---|---|---|
| `/Group/AddChatRoomMember` | POST |  | ✅ | 增加群成员(40人以内) |
| `/Group/ConsentToJoin` | POST |  | ✅ | 同意进入群聊 |
| `/Group/CreateChatRoom` | POST |  | ✅ | 创建群聊 |
| `/Group/DelChatRoomMember` | POST |  | ✅ | 删除群成员 |
| `/Group/FacingCreateChatRoom` | POST |  | ✅ | 创建群聊 |
| `/Group/GetChatRoomInfo` | POST |  | ✅ | 获取群详情(不带公告内容) |
| `/Group/GetChatRoomInfoDetail` | POST |  | ✅ | 获取群信息(带公告内容) |
| `/Group/GetChatRoomMemberDetail` | POST |  | ✅ | 获取群成员详情 |
| `/Group/GetQRCode` | POST |  | ✅ | 获取群二维码 |
| `/Group/GroupList` | GET |  | ✅ | 获取群列表（兼容路由） |
| `/Group/InviteChatRoomMember` | POST |  | ✅ | 邀请群成员(40人以上) |
| `/Group/List` | GET |  | ✅ | 获取群列表（业务路由） |
| `/Group/MoveContractList` | POST |  | ✅ | 保存到通讯录 |
| `/Group/OperateChatRoomAdmin` | POST |  | ✅ | 群管理操作(添加、删除、转让) |
| `/Group/Quit` | POST |  | ✅ | 退出群聊 |
| `/Group/ScanIntoGroup` | POST |  | ✅ | 扫码进群 |
| `/Group/ScanIntoGroupEnterprise` | POST |  | ✅ | 扫码进群(企业) |
| `/Group/SendPat` | POST |  | ✅ | 群拍一拍功能 |
| `/Group/SendTransferGroupOwner` | POST |  | ✅ | 转让群 |
| `/Group/SetChatRoomAnnouncement` | POST |  | ✅ | 设置群公告 |
| `/Group/SetChatRoomName` | POST |  | ✅ | 设置群名称 |
| `/Group/SetChatRoomRemarks` | POST |  | ✅ | 设置群备注(仅自己可见) |
| `/Group/SetChatroomAccessVerify` | POST |  | ✅ | 设置群聊邀请开关 |

## Wxapp (20 endpoints)
- 实现: `send/wxapp.ts` | AI 工具: `agent-tools/wxapp-meta.ts`

| Endpoint | Method | 入库类型 (send/msg.ts) | 覆盖 | 说明 |
|---|---|---|---|---|
| `/Wxapp/AddAvatar` | POST |  | ✅ | AddAvatar |
| `/Wxapp/AddMobile` | POST |  | ✅ | 小程序绑定增加手机号 |
| `/Wxapp/CloudCallFunction` | POST |  | ✅ | 小程序云函数 |
| `/Wxapp/DelMobile` | POST |  | ✅ | 小程序删除手机号 |
| `/Wxapp/DellAvatar` | POST |  | ✅ | DellAvatar |
| `/Wxapp/GETCreditScoreParam` | POST |  | ✅ | 查询游戏信用积分 |
| `/Wxapp/GetAllMobile` | POST |  | ✅ | GetAllMobile |
| `/Wxapp/GetRandomAvatar` | POST |  | ✅ | GetRandomAvatar |
| `/Wxapp/GetUnionPay` | POST |  | ✅ | 微信云闪付支付 |
| `/Wxapp/GetUserOpenId` | POST |  | ✅ | GetUserOpenId |
| `/Wxapp/GetWxAppRecord` | POST |  | ✅ | 获取小程序记录 |
| `/Wxapp/JSGetSessionid` | POST |  | ✅ | 小程序获取小程序支付sessionid |
| `/Wxapp/JSLogin` | POST |  | ✅ | 授权小程序(定制) |
| `/Wxapp/JSOperateWxData` | POST |  | ✅ | 小程序操作 |
| `/Wxapp/UploadAvatarImg` | POST |  | ✅ | UploadAvatarImg |
| `/Wxapp/Verifyplugin` | POST |  | ✅ | 小程序获取HostSign |
| `/Wxapp/Wxapp/AddWxAppRecord` | POST |  | ✅ | 新增小程序记录 |
| `/Wxapp/Wxapp/GetpullPay` | POST |  | ✅ | 推送小程序支付 |
| `/Wxapp/Wxapp/JSGetSessionidQRcode` | POST |  | ✅ | 获取付小程序款二维码 |
| `/Wxapp/Wxapp/QrcodeAuthLogin` | POST |  | ✅ | 扫码授权登录app或网页 |

## Msg (18 endpoints)
- 实现: `send/msg.ts` | AI 工具: `agent-tools/msg-meta.ts`

| Endpoint | Method | 入库类型 (send/msg.ts) | 覆盖 | 说明 |
|---|---|---|---|---|
| `/Msg/Quote` | POST |  | ✅ | 引用文本消息 |
| `/Msg/Revoke` | POST |  | ✅ | 撤回消息 |
| `/Msg/SendApp` | POST |  | 🚫 移除 (v1.1.17) | 群发消息 |
| `/Msg/SendCDNFile` | POST | file | ✅ | 发送文件(转发,并非上传) |
| `/Msg/SendCDNImg` | POST | image | ✅ | 发送Cdn图片(转发图片) |
| `/Msg/SendCDNVideo` | POST | video | ✅ | 发送Cdn视频(转发视频) |
| `/Msg/SendEmoji` | POST | emoji | ✅ | 发送Emoji |
| `/Msg/SendTxt` | POST | text | ✅ | 发送文本消息 |
| `/Msg/SendVideo` | POST | video | ✅ | 发送视频 |
| `/Msg/SendVoice` | POST | voice | ✅ | 发送语音 |
| `/Msg/SendXCX` | POST | miniprogram | ✅ | 发送小程序消息 |
| `/Msg/ShareCard` | POST | card | ✅ | 分享名片 |
| `/Msg/ShareLink` | POST | link | ✅ | 发送分享链接消息 |
| `/Msg/ShareLocation` | POST | location | ✅ | 分享位置 |
| `/Msg/ShareVideo` | POST | video | ✅ | 发送分享视频消息 |
| `/Msg/StartAutoSync` | POST |  | ✅ | 启动自动同步 |
| `/Msg/Sync` | POST |  | ✅ | 同步消息 |
| `/Msg/UploadImg` | POST | image | ✅ | 发送图片 |

## Search (18 endpoints)
- 实现: `send/search.ts` | AI 工具: `agent-tools/search-meta.ts`

| Endpoint | Method | 入库类型 (send/msg.ts) | 覆盖 | 说明 |
|---|---|---|---|---|
| `/Search/AI` | POST |  | ✅ | AI 搜索 |
| `/Search/All` | POST |  | ✅ | 全部综合搜索 |
| `/Search/Articles` | POST |  | ✅ | 公众号文章搜索 |
| `/Search/Baike` | POST |  | ✅ | 百科搜索 |
| `/Search/Books` | POST |  | ✅ | 读书搜索 |
| `/Search/Channels` | POST |  | ✅ | 视频号内容搜索 |
| `/Search/Emoji` | POST |  | ✅ | 表情搜索 |
| `/Search/Images` | POST |  | ✅ | 图片搜索 |
| `/Search/Listen` | POST |  | ✅ | 听一听搜索 |
| `/Search/Live` | POST |  | ✅ | 直播搜索 |
| `/Search/MiniGames` | POST |  | ✅ | 小游戏搜索 |
| `/Search/MiniPrograms` | POST |  | ✅ | 小程序搜索 |
| `/Search/Moments` | POST |  | ✅ | 朋友圈搜索 |
| `/Search/News` | POST |  | ✅ | 新闻搜索 |
| `/Search/OfficialAccounts` | POST |  | ✅ | 公众号与账号搜索 |
| `/Search/Stickers` | POST |  | ✅ | 贴图搜索 |
| `/Search/Underlines` | POST |  | ✅ | 划线搜索 |
| `/Search/WeChatIndex` | POST |  | ✅ | 微信指数搜索 |
| `/Search/Capabilities` | GET |  | ✅ | v1.3.19: 查看通用搜索支持的分类 |
| `/Search/Services` | GET |  | ✅ | v1.3.19: 查看高级搜索能力目录 |
| `/Search/Service/{name}` | POST |  | ✅ | v1.3.19: 高级搜索能力调用入口 (动态 name) |
| `/Search/Gateway` | POST |  | ✅ | v1.3.19: 兼容旧版搜一搜网页网关 |
| `/Search/Query` | POST |  | ✅ | v1.3.19: 通用分类搜索 |

## User (18 endpoints)
- 实现: `send/user.ts` | AI 工具: `agent-tools/user-meta.ts`

| Endpoint | Method | 入库类型 (send/msg.ts) | 覆盖 | 说明 |
|---|---|---|---|---|
| `/User/BindQQ` | POST |  | ✅ | 绑定QQ |
| `/User/BindingEmail` | POST |  | ✅ | 绑定邮箱 |
| `/User/BindingMobile` | POST |  | ✅ | 换绑手机号 |
| `/User/CheckCanSetAlias` | GET |  | ✅ | 检测微信登录环境 |
| `/User/DelSafetyInfo` | POST |  | ✅ | 删除登录设备 |
| `/User/GetAllOnline` | GET |  | ✅ | 获取所有在线wxid（需管理员 key） — ADMIN_ENDPOINTS 含它 (api/client.ts:151) |
| `/User/GetContractProfile` | POST |  | ✅ | 取个人信息 |
| `/User/GetOnlineInfo` | GET |  | ✅ | 获取在线信息 |
| `/User/GetQRCode` | POST |  | ✅ | 取个人二维码 |
| `/User/GetSafetyInfo` | POST |  | ✅ | 登录设备管理 |
| `/User/PrivacySettings` | POST |  | ✅ | 隐私设置 |
| `/User/ReportMotion` | POST |  | ✅ | ReportMotion |
| `/User/SendVerifyMobile` | POST |  | ✅ | 发送手机验证码 |
| `/User/SetAlisa` | POST |  | ✅ | 设置微信号 |
| `/User/SetPasswd` | POST |  | ✅ | 修改密码 |
| `/User/UpdateProfile` | POST |  | ✅ | 修改个人信息 |
| `/User/UploadHeadImage` | POST |  | ✅ | 修改头像 |
| `/User/VerifyPasswd` | POST |  | ✅ | 验证密码 |

## Finder (15 endpoints)
- 实现: `send/finder.ts` | AI 工具: `agent-tools/finder-meta.ts`

| Endpoint | Method | 入库类型 (send/msg.ts) | 覆盖 | 说明 |
|---|---|---|---|---|
| `/Finder/Comment` | POST |  | ✅ | 评论 |
| `/Finder/Decrypt` | POST |  | ✅ | 评论 |
| `/Finder/FinderGetMsgSessionId` | POST |  | ✅ | 获取Finder私信会话ID |
| `/Finder/FinderLiveDetail` | POST |  | ✅ | 直播详情 |
| `/Finder/FinderSearchList` | POST |  | ✅ | 搜索列表 |
| `/Finder/FinderSendText` | POST |  | ✅ | 发送私信文字 |
| `/Finder/Findergettopiclist` | POST |  | ✅ | 主题列表 |
| `/Finder/Follow` | POST |  | ✅ | 关注 |
| `/Finder/GetCommentDetail` | POST |  | ✅ | 查看指定内容 |
| `/Finder/GetCommentList` | POST |  | ✅ | 评论列表/详情（支持RootCommentId翻页） |
| `/Finder/GetRecommend` | POST |  | ✅ | 推荐 |
| `/Finder/Like` | POST |  | ✅ | 点赞 |
| `/Finder/Search` | POST |  | ✅ | 用户搜索 |
| `/Finder/TargetUserPage` | POST |  | ✅ | 查看指定人首页 |
| `/Finder/UserPrepare` | POST |  | ✅ | 用户中心 |

## Tools (15 endpoints)
- 实现: `send/tools.ts` | AI 工具: `agent-tools/tools-meta.ts`

| Endpoint | Method | 入库类型 (send/msg.ts) | 覆盖 | 说明 |
|---|---|---|---|---|
| `/Tools/CdnDownloadImage` | POST |  | ✅ | CDN下载高清图片 |
| `/Tools/DownloadFile` | POST |  | ✅ | 文件下载 |
| `/Tools/DownloadImg` | POST |  | ✅ | 高清图片下载 |
| `/Tools/DownloadVideo` | POST |  | ✅ | 视频下载 |
| `/Tools/DownloadVoice` | POST |  | ✅ | 语音下载 |
| `/Tools/GeneratePayQCode` | GET |  | ✅ | 生成支付二维码 |
| `/Tools/GetA8Key` | POST |  | ✅ | GetA8Key |
| `/Tools/GetBandCardList` | POST |  | ✅ | 获取余额以及银行卡信息 |
| `/Tools/GetBoundHardDevices` | POST |  | ✅ | GetBoundHardDevices |
| `/Tools/GetCdnDns` | POST |  | ✅ | 获取CDN服务器dns信息 |
| `/Tools/HelperVerification` | POST |  | ✅ | OauthSdkApp |
| `/Tools/OauthSdkApp` | POST |  | ✅ | OauthSdkApp |
| `/Tools/ThirdAppGrant` | POST |  | ✅ | 第三方APP授权 |
| `/Tools/UploadFile` | POST |  | ✅ | 文件上传 |
| `/Tools/setproxy` | POST |  | ✅ | 修改微信步数 |

## Friend (12 endpoints)
- 实现: `send/friend.ts` | AI 工具: `agent-tools/friend-meta.ts`

| Endpoint | Method | 入库类型 (send/msg.ts) | 覆盖 | 说明 |
|---|---|---|---|---|
| `/Friend/Blacklist` | POST |  | ✅ | 添加/移除黑名单 |
| `/Friend/Delete` | POST |  | ✅ | 删除好友 |
| `/Friend/GetContractDetail` | POST |  | ✅ | 获取通讯录好友详情 |
| `/Friend/GetContractList` | POST |  | ✅ | 获取通讯录好友 |
| `/Friend/GetFriendstate` | POST |  | ✅ | 查询好友状态 |
| `/Friend/GetMFriend` | POST |  | ✅ | 获取手机通讯录 |
| `/Friend/LbsFind` | POST |  | ✅ | 附近人 |
| `/Friend/PassVerify` | POST |  | ✅ | 通过好友请求 |
| `/Friend/Search` | POST |  | ✅ | 搜索联系人 |
| `/Friend/SendRequest` | POST |  | ✅ | 添加联系人(发送好友请求) |
| `/Friend/SetRemarks` | POST |  | ✅ | 设置好友备注 |
| `/Friend/Upload` | POST |  | ✅ | 上传通讯录 |

## OfficialAccounts (12 endpoints)
- 实现: `send/officialaccounts.ts` | AI 工具: `agent-tools/officialaccounts-meta.ts`

| Endpoint | Method | 入库类型 (send/msg.ts) | 覆盖 | 说明 |
|---|---|---|---|---|
| `/OfficialAccounts/AuthMpLogin` | POST |  | ✅ | 授权公众号登录 |
| `/OfficialAccounts/Follow` | POST |  | ✅ | 关注 |
| `/OfficialAccounts/GetAppMsgExt` | POST |  | ✅ | 阅读文章,返回 分享、看一看、阅读数据 |
| `/OfficialAccounts/GetAppMsgExtLike` | POST |  | ✅ | 点赞文章,返回 分享、看一看、阅读数据 |
| `/OfficialAccounts/GetMpHistory` | POST |  | ✅ | 获取公众号历史消息 |
| `/OfficialAccounts/GetMpHistoryMessage` | POST |  | ✅ | 获取公众号历史消息HTML |
| `/OfficialAccounts/JSAPIPreVerify` | POST |  | ✅ | JSAPIPreVerify |
| `/OfficialAccounts/MpGetA8Key` | POST |  | ✅ | MpGetA8Key(获取文章key和uin) |
| `/OfficialAccounts/OauthAuthorize` | POST |  | ✅ | OauthAuthorize |
| `/OfficialAccounts/QRConnectAuthorize` | POST |  | ✅ | 二维码授权请求 |
| `/OfficialAccounts/QRConnectAuthorizeConfirm` | POST |  | ✅ | 二维码授权确认 |
| `/OfficialAccounts/Quit` | POST |  | ✅ | 取消关注 |

## FriendCircle (11 endpoints)
- 实现: `send/friendcircle.ts` | AI 工具: `agent-tools/friendcircle-meta.ts`

| Endpoint | Method | 入库类型 (send/msg.ts) | 覆盖 | 说明 |
|---|---|---|---|---|
| `/FriendCircle/Comment` | POST |  | ✅ | 朋友圈点赞/评论 |
| `/FriendCircle/GetCommnet` | POST |  | ✅ | 获取评论内容 |
| `/FriendCircle/GetDetail` | POST |  | ✅ | 获取特定人朋友圈 |
| `/FriendCircle/GetIdDetail` | POST |  | ✅ | 获取特定ID详情内容 |
| `/FriendCircle/GetList` | POST |  | ✅ | 朋友圈首页列表 |
| `/FriendCircle/Messages` | POST |  | ✅ | 发布朋友圈 |
| `/FriendCircle/MmSnsSync` | POST |  | ✅ | 查询正在 评论转发的ID |
| `/FriendCircle/Operation` | POST |  | ✅ | 朋友圈操作 |
| `/FriendCircle/PrivacySettings` | POST |  | ✅ | 朋友圈权限设置 |
| `/FriendCircle/PushCommnet` | POST |  | ✅ | 启动评论检查任务并转发评论 |
| `/FriendCircle/Upload` | POST |  | ✅ | 朋友圈下载CDN视频 |
| `/FriendCircle/UploadImage` | POST |  | ✅ | v1.3.19: 上传朋友圈图片 |
| `/FriendCircle/UploadImages` | POST |  | ✅ | v1.3.19: 批量上传朋友圈图片 |
| `/FriendCircle/UploadVideo` | POST |  | ✅ | v1.3.19: 上传朋友圈视频 |
| `/FriendCircle/DownloadVideo` | POST |  | ✅ | v1.3.19: 下载朋友圈视频 |
| `/FriendCircle/MessagesRaw` | POST |  | ✅ | v1.3.19: 发布朋友圈 (raw 参数) |
| `/FriendCircle/SetBackgroundImage` | POST |  | ✅ | v1.3.19: 设置朋友圈背景图 |

## TenPay (7 endpoints)
- 实现: `send/tenpay.ts` | AI 工具: `agent-tools/tenpay-meta.ts`

| Endpoint | Method | 入库类型 (send/msg.ts) | 覆盖 | 说明 |
|---|---|---|---|---|
| `/TenPay/GeMaSkdPayQCode` | POST |  | ✅ | 自定义经营个人收款单 |
| `/TenPay/GetEncryptInfo` | POST |  | ✅ | 获取加密信息 |
| `/TenPay/OpenHongBao` | POST |  | ✅ | 抢红包(带参数) |
| `/TenPay/Openwxhb` | POST |  | ✅ | 拆开红包 |
| `/TenPay/Qrydetailwxhb` | POST |  | ✅ | 查看红包 |
| `/TenPay/Receivewxhb` | POST |  | ✅ | 打开红包不用key |
| `/TenPay/SjSkdPayQCode` | POST |  | ✅ | 自定义商家收款单 |
| `/TenPay/Collectmoney` | POST |  | ✅ | v1.3.19: 确认收款 |
| `/TenPay/ConfirmPreTransferApi` | POST |  | ✅ | v1.3.19: 确认支付 |
| `/TenPay/GeneratePayQCode` | POST |  | ✅ | v1.3.19: 生成自定义收款二维码 |
| `/TenPay/GetRedPacketListApi` | POST |  | ✅ | v1.3.19: 查看红包领取列表入口 |
| `/TenPay/WXCreateRedPacketApi` | POST |  | ✅ | v1.3.19: 创建红包 |

## Webhook (6 endpoints)
- 实现: `send/webhook.ts` | AI 工具: `agent-tools/webhook-meta.ts`

| Endpoint | Method | 入库类型 (send/msg.ts) | 覆盖 | 说明 |
|---|---|---|---|---|
| `/Webhook/Business/Get` | GET |  | ✅ | 获取业务回调URL（按授权码） |
| `/Webhook/Business/Set` | POST |  | ✅ | 设置业务回调URL（按授权码） |
| `/Webhook/Get` | GET |  | ✅ | 获取 Webhook 配置（按授权码） |
| `/Webhook/Remove` | POST |  | ✅ | 删除 Webhook 配置（按授权码） |
| `/Webhook/Set` | POST |  | ✅ | 设置 Webhook 配置（按授权码） |
| `/Webhook/Test` | POST |  | ✅ | 测试发送 Webhook 消息（按授权码） |

## Label (5 endpoints)
- 实现: `send/label.ts` | AI 工具: (misc-meta)

| Endpoint | Method | 入库类型 (send/msg.ts) | 覆盖 | 说明 |
|---|---|---|---|---|
| `/Label/Add` | POST |  | ✅ | 添加标签 |
| `/Label/Delete` | POST |  | ✅ | 删除标签 |
| `/Label/GetList` | POST |  | ✅ | 获取标签列表 |
| `/Label/UpdateList` | POST |  | ✅ | 更新标签列表 |
| `/Label/UpdateName` | POST |  | ✅ | 修改标签 |

## Favor (4 endpoints)
- 实现: `send/favorites.ts` | AI 工具: (misc-meta)

| Endpoint | Method | 入库类型 (send/msg.ts) | 覆盖 | 说明 |
|---|---|---|---|---|
| `/Favor/Del` | POST |  | ✅ | 删除收藏 |
| `/Favor/GetFavInfo` | POST |  | ✅ | 获取搜藏信息 |
| `/Favor/GetFavItem` | POST |  | ✅ | 读取收藏内容 |
| `/Favor/Sync` | POST |  | ✅ | 同步收藏 |

## Admin (3 endpoints)
- 实现: `send/(已移除 v1.1.17, 高权限)` | AI 工具: (misc-meta)

| Endpoint | Method | 入库类型 (send/msg.ts) | 覆盖 | 说明 |
|---|---|---|---|---|
| `/Admin/DelayAuthKey` | POST |  | — | 延期授权码a |
| `/Admin/DeleteAuthKey` | POST |  | — | 删除授权码 |
| `/Admin/GenAuthKey` | POST |  | — | 生成授权码 |

## QWContact (3 endpoints)
- 实现: `send/qwcontact.ts` | AI 工具: (misc-meta)

| Endpoint | Method | 入库类型 (send/msg.ts) | 覆盖 | 说明 |
|---|---|---|---|---|
| `/QWContact/QWApplyAddContact` | POST |  | ✅ | QWApplyAddContact |
| `/QWContact/QWContact/QWAddContact` | POST |  | ✅ | QWAddContact |
| `/QWContact/SearchQWContact` | POST |  | ✅ | SearchQWContact |

## Voice (3 endpoints)
- 实现: `send/voice.ts` | AI 工具: (misc-meta)

| Endpoint | Method | 入库类型 (send/msg.ts) | 覆盖 | 说明 |
|---|---|---|---|---|
| `/Voice/MessageTranscribe` | POST |  | ✅ | 接收到的语音消息转文字 |
| `/Voice/Result` | POST |  | ✅ | 查询异步语音转写结果 |
| `/Voice/Transcribe` | POST |  | ✅ | 上传语音并转成文字 |

## SayHello (2 endpoints)
- 实现: `send/sayhello.ts` | AI 工具: (misc-meta)

| Endpoint | Method | 入库类型 (send/msg.ts) | 覆盖 | 说明 |
|---|---|---|---|---|
| `/SayHello/Modelv1` | POST |  | ✅ | 模式1-扫码 |
| `/SayHello/Modelv2` | POST |  | ✅ | 模式3-v3\v4打招呼 |

## Translate (2 endpoints)
- 实现: `send/translate.ts` | AI 工具: (misc-meta)

| Endpoint | Method | 入库类型 (send/msg.ts) | 覆盖 | 说明 |
|---|---|---|---|---|
| `/Translate/Send` | POST |  | ✅ | 翻译并发送文字 |
| `/Translate/Text` | POST |  | ✅ | 文字翻译 |

## Customized (1 endpoints)
- 实现: `send/customized.ts` | AI 工具: (misc-meta)

| Endpoint | Method | 入库类型 (send/msg.ts) | 覆盖 | 说明 |
|---|---|---|---|---|
| `/Customized/WXCTDUniftyAuthBatch` | POST |  | ✅ | 批量开小程序 |

## 覆盖统计

- swagger 总 endpoint: 236
- WPP_VENDOR_ENDPOINTS 已注册: 231
- 覆盖: 231/236 (排除 Admin 3 = 233 需覆盖, 231/233)

## 有意移除 (v1.1.17 老板拍板, 非缺失)

| Endpoint | 原因 |
|---|---|
| `/Msg/SendApp` | P0-B: SendApp 是**群发消息**端点 (SendGroupMassMsgTextParamDoc), 误触发广播风险 |
| `/User/GetAllOnline` | 权限过高, 插件中不用 |
| Admin 3 端点 (GenAuthKey/DelayAuthKey/DeleteAuthKey) | 需要管理 key, 权限过高 |
